import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import {
  booleanCapability,
  defineBundles,
  defineCapabilities,
} from "@m5kdev/commons/modules/billing/billing.entitlements";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import IORedis from "ioredis";
import { err, ok } from "neverthrow";
import { createElement } from "react";
import Stripe from "stripe";
import { z } from "zod";
import { type BackendAppMetadata, createBackendApp } from "../../../app";
import { resolveOrganizationActor } from "../../../base/base.actor";
import { BaseService } from "../../../base/base.service";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as authSchema from "../../auth/auth.db";
import { AuthModule } from "../../auth/auth.module";
import type { AuthService } from "../../auth/auth.service";
import { subscriptions } from "../../billing/billing.db";
import { BillingModule } from "../../billing/billing.module";
import type { BillingService } from "../../billing/billing.service";
import { workflows } from "../../workflow/workflow.db";
import { WorkflowModule } from "../../workflow/workflow.module";
import type { WorkflowService } from "../../workflow/workflow.service";
import { EmailModule } from "../email.module";
import type { CommunicationContext, CommunicationPolicy } from "../email.schema";
import type { EmailService, EmailTemplates } from "../email.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const schema = { ...authSchema, workflows, subscriptions };
const reminderSchema = z
  .object({
    userId: z.string().min(1),
    organizationId: z.string().min(1),
    invitationId: z.string().min(1),
    experienceId: experienceIdSchema.optional(),
    eventId: z.string().min(1).optional(),
  })
  .strict();
type Reminder = z.infer<typeof reminderSchema>;

/** App-owned use case: live resource/tenant/Grant checks belong here, not in Email or Workflow. */
class InvitationReminder extends BaseService<
  Record<string, never>,
  { auth: AuthService; email: EmailService; billing: BillingService }
> {
  async send(input: Reminder, event: CommunicationContext["event"]) {
    const { auth, email } = this.service;
    const user = await auth.repository.user.findById(input.userId);
    if (user.isErr()) return err(user.error);
    if (!user.value || user.value.closedAt || user.value.banned)
      return this.error("FORBIDDEN", "User is unavailable");
    const organization = await auth.repository.organization.findById(input.organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND");
    const invitation = await auth.repository.invitation.findById(input.invitationId);
    if (invitation.isErr()) return err(invitation.error);
    if (!invitation.value) return this.error("NOT_FOUND");
    const resolvedActor = await resolveOrganizationActor({
      user: { userId: user.value.id, userRole: user.value.role ?? "user" },
      organizationId: organization.value.id,
      memberships: auth.repository.organization,
    });
    if (resolvedActor.isErr()) return err(resolvedActor.error);
    const actor = resolvedActor.value;
    const entitlement = await this.service.billing.requireAll(actor, ["reminders.send"]);
    if (entitlement.isErr()) return err(entitlement.error);
    const selected = await email.resolveCommunicationExperience({
      experienceId: input.experienceId,
      context: {
        event,
        eventId: input.eventId,
        userId: user.value.id,
        organizationId: organization.value.id,
        resourceId: invitation.value.id,
      },
    });
    if (selected.isErr()) return err(selected.error);
    const link = await auth.createOrganizationInvitationLink(
      { id: invitation.value.id },
      {
        experience: selected.value,
        user: user.value,
        actor,
      }
    );
    if (link.isErr()) return err(link.error);
    return email.sendTemplate(
      invitation.value.email,
      "reminder",
      { url: link.value.url },
      {
        experience: selected.value,
        locale: organization.value.locale ?? undefined,
      }
    );
  }
}

function trackDuplicates(connection: IORedis, created: IORedis[]): IORedis {
  const duplicate = connection.duplicate.bind(connection);
  connection.duplicate = ((...args: Parameters<IORedis["duplicate"]>) =>
    trackDuplicates(duplicate(...args), created)) as IORedis["duplicate"];
  created.push(connection);
  return connection;
}

const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;
describeWithRedis("Delayed communications through real Workflow and Email", () => {
  const client = createTestPool();
  const orm = drizzle(client, { schema });
  const connections: IORedis[] = [];
  let redis: IORedis;
  let outputDirectory: string;
  let prefix: string;
  const shutdowns: Array<() => Promise<void>> = [];

  const template = {
    id: "radar-reminder",
    react: ({ brand, url, htmlLang }: Record<string, unknown>) =>
      createElement(
        "main",
        { lang: String(htmlLang) },
        createElement("h1", null, (brand as { name: string }).name),
        createElement("a", { href: String(url) }, "Accept invitation")
      ),
  };
  const templates: EmailTemplates = {
    verification: template,
    passwordReset: template,
    organizationInvite: template,
    accountDeletion: template,
    reminder: template,
  };
  const registryConfig = {
    ...experienceConfig,
    emailProfiles: {
      radar: { from: "Radar <radar@example.test>" },
      horeka: { from: "Horeka <horeka@example.test>", templateSet: "assistant" },
    },
    definitions: {
      ...experienceConfig.definitions,
      radar: { ...experienceConfig.definitions.radar, emailProfile: "radar" },
      horeka: { ...experienceConfig.definitions.horeka, emailProfile: "horeka" },
    },
  };

  function build(
    policy?: CommunicationPolicy,
    metadata: BackendAppMetadata = { experiences: registryConfig }
  ) {
    const built = createBackendApp(
      {
        schema,
        db: { client },
        redis,
        experienceFlowSecret: "local-delayed-communication-key-with-thirty-two-characters",
        app: {
          ...metadata,
          locales: {
            defaultLocale: "en",
            locales: [
              { code: "en", displayName: "English" },
              { code: "en_GB", displayName: "English (UK)" },
            ],
          },
        },
        email: { mode: "store", outputDirectory, from: "legacy@example.test" },
      },
      [
        new EmailModule(templates, {
          communicationPolicy: policy,
          templateSets: {
            assistant: { ...templates, reminder: { ...template, id: "horeka-reminder" } },
          },
        }),
        new BillingModule(
          {
            stripe: new Stripe("sk_test_no_network", {
              httpClient: Stripe.createFetchHttpClient(async () => {
                throw new Error("Unexpected Stripe request");
              }),
            }),
          },
          {
            environment: "sandbox",
            plans: [],
            trialPlanName: {},
            trialRequiresPaymentMethod: false,
            defaultCurrency: "usd",
            seatBilling: false,
            nonBillableRoleKeys: [],
            entitlements: defineBundles<Record<string, ReturnType<typeof booleanCapability>>>(
              defineCapabilities({ "reminders.send": booleanCapability() }),
              {}
            ),
          }
        ),
        new AuthModule(),
        new WorkflowModule({
          prefix,
          boardPath: null,
          schedulers: false,
          reconcile: { enabled: false },
          queues: { main: { concurrency: 2 } },
          defaultQueue: "main",
        }),
      ] as const
    );
    if (!built.workflow) throw new Error("Workflow composition missing");
    const workflow: WorkflowService = built.workflow.service;
    const email: EmailService = built.modules.email.services.email;
    const reminder = new InvitationReminder(
      {},
      {
        auth: built.modules.auth.services.auth,
        email,
        billing: built.modules.billing.services.billing,
      }
    );
    const jobs = Object.fromEntries(
      ["scheduled", "admin", "webhook"].map((source) => [
        source,
        workflow
          .job<{ data: Reminder }>({
            name: `${source}.invitation-reminder`,
            meta: ({ data }) => ({ userId: data.userId }),
            retries: 1,
          })
          .input(reminderSchema, true)
          .handle(async ({ data }) => {
            const sent = await reminder.send(data, `${source}.invitation-reminder`);
            if (sent.isErr()) throw sent.error;
          }),
      ])
    );
    const neutral = workflow
      .job<{ data: { resourceId: string } }>({ name: "neutral.resource" })
      .input(z.object({ resourceId: z.string() }).strict(), true)
      .output(z.string(), true)
      .handle(async ({ data }) => ok(data.resourceId));
    built.workflow.registry.registerService({ ...jobs, neutral });
    const result = { built, workflow, email, jobs, neutral };
    shutdowns.push(() => built.shutdown());
    return result;
  }

  async function invite(id: string, organizationId = "organization") {
    await orm.insert(schema.invitations).values({
      id,
      organizationId,
      email: `${id}@example.test`,
      status: "pending",
      inviterId: "owner",
      expiresAt: new Date(Date.now() + 60_000),
    });
  }
  function payload(invitationId: string, experienceId?: string) {
    return {
      data: reminderSchema.parse({
        userId: "owner",
        organizationId: "organization",
        invitationId,
        experienceId,
      }),
    };
  }
  async function terminal(
    app: ReturnType<typeof build>,
    id: string,
    expected: "completed" | "failed"
  ) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const job = await app.workflow.getJob("main", id);
      const record = await app.workflow.read({ jobId: id, userId: "owner" });
      if ((await job?.getState()) === expected && record.isOk() && record.value.status === expected)
        return { job, record: record.value };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Expected job ${id} to be ${expected}`);
  }

  beforeEach(async () => {
    await prepareExperienceTables(client, schema);
    // Existing Drizzle-declared composite unique required by Workflow lifecycle upserts.
    for (const constraint of getTableConfig(workflows).uniqueConstraints) {
      await client.query(
        `ALTER TABLE "${process.env.DATABASE_SCHEMA}".workflows ADD CONSTRAINT "${constraint.name}" UNIQUE (${constraint.columns.map((c) => `"${c.name}"`).join(",")})`
      );
    }
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-delayed-mail-"));
    prefix = `communication-${process.pid}-${Date.now()}`;
    if (!redisUrl) throw new Error("TEST_REDIS_URL is required for Redis integration tests");
    redis = trackDuplicates(new IORedis(redisUrl, { maxRetriesPerRequest: null }), connections);
    await orm.insert(schema.users).values({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      emailVerified: true,
      role: "user",
    });
    await orm.insert(schema.organizations).values({
      id: "organization",
      name: "Shared",
      slug: "shared",
      locale: "en",
      billingExempt: true,
    });
    await orm.insert(schema.members).values({
      id: "owner-member",
      userId: "owner",
      organizationId: "organization",
      role: "owner",
    });
  });
  afterEach(async () => {
    for (const shutdown of shutdowns.splice(0)) await shutdown();
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    for (const connection of connections.splice(0)) connection.disconnect();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });
  afterAll(async () => {
    await client.end();
  });

  it("queues ids only and renders delayed A/B messages using reloaded locale after interleaved sends", async () => {
    const app = build();
    await invite("radar-invite");
    await invite("horeka-invite");
    const queued = await Promise.all(
      ["radar", "horeka"].map((id) => app.jobs.scheduled.trigger(payload(`${id}-invite`, id)))
    );
    for (const [index, id] of queued.entries()) {
      const data = {
        data: {
          userId: "owner",
          organizationId: "organization",
          invitationId: `${["radar", "horeka"][index]}-invite`,
          experienceId: ["radar", "horeka"][index],
        },
      };
      expect((await app.workflow.getJob("main", id))?.data).toEqual(data);
      const record = await app.workflow.read({ jobId: id, userId: "owner" });
      if (record.isErr()) throw record.error;
      expect(record.value.input).toEqual(data);
      expect(record.value.status).toBe("queued");
    }
    await app.email.sendTemplate(
      "between-b@example.test",
      "reminder",
      {},
      { experience: "horeka", linkPaths: { url: "/between-b" } }
    );
    await app.email.sendTemplate(
      "between-a@example.test",
      "reminder",
      {},
      { experience: "radar", linkPaths: { url: "/between-a" } }
    );
    await orm
      .update(schema.organizations)
      .set({ locale: "en_GB" })
      .where(eq(schema.organizations.id, "organization"));
    await app.built.start({ listen: false });
    for (const [index, id] of queued.entries()) {
      await terminal(app, id, "completed");
      const brand = ["radar", "horeka"][index];
      const stored = await app.email.findLatestStoredEmail({ to: `${brand}-invite@example.test` });
      expect(stored).toMatchObject({
        from: `${brand === "radar" ? "Radar" : "Horeka"} <${brand}@example.test>`,
        templateId: `${brand}-reminder`,
        props: { experience: { id: brand }, htmlLang: "en-GB" },
      });
      expect(stored?.html).toContain(brand === "radar" ? "Gastro Raider" : "Horeka AI");
      expect(stored?.html).toContain(
        `href="https://${brand}.example.test/organization/accept-invitation`
      );
      expect(stored?.html).toContain('lang="en-GB"');
      expect(new URL(String(stored?.props.url)).searchParams.get("id")).toBe(`${brand}-invite`);
    }
    expect(await app.email.listStoredEmails()).toHaveLength(4);
  });
  it("resolves scheduled/admin/webhook presentation once from trusted ids with no recipient inference", async () => {
    const policy = jest.fn(async (context: CommunicationContext) =>
      experienceIdSchema.parse(context.resourceId === "scheduled-invite" ? "radar" : "horeka")
    );
    const app = build(policy);
    const sources = ["scheduled", "admin", "webhook"];
    const queued = [];
    for (const source of sources) {
      await invite(`${source}-invite`);
      queued.push(
        await app.jobs[source].trigger({
          data: { ...payload(`${source}-invite`).data, eventId: `${source}-event` },
        })
      );
    }
    await app.built.start({ listen: false });
    for (const [index, id] of queued.entries()) {
      await terminal(app, id, "completed");
      const source = sources[index];
      const stored = await app.email.findLatestStoredEmail({ to: `${source}-invite@example.test` });
      const experience = source === "scheduled" ? "radar" : "horeka";
      expect(stored?.props.experience).toMatchObject({ id: experience });
      expect(stored?.html).toContain(
        `href="https://${experience}.example.test/organization/accept-invitation`
      );
      expect(policy).toHaveBeenCalledWith({
        event: `${source}.invitation-reminder`,
        eventId: `${source}-event`,
        userId: "owner",
        organizationId: "organization",
        resourceId: `${source}-invite`,
      });
    }
    expect(policy).toHaveBeenCalledTimes(3);
    expect(await app.email.listStoredEmails()).toHaveLength(3);
  });

  it.each(["removed", "disabled", "updated"])(
    "resolves %s references against the worker deployment instead of the queued configuration",
    async (change) => {
      const producer = build();
      const ref = change === "disabled" ? "horeka" : "radar";
      await invite("lifecycle-invite");
      const id = await producer.jobs.scheduled.trigger(payload("lifecycle-invite", ref));
      await producer.built.shutdown();
      const policy = jest.fn(async () =>
        experienceIdSchema.parse(ref === "radar" ? "horeka" : "radar")
      );
      const config =
        change === "removed"
          ? {
              ...registryConfig,
              defaultExperience: "horeka",
              definitions: {
                horeka: registryConfig.definitions.horeka,
                partner: registryConfig.definitions.partner,
              },
            }
          : change === "disabled"
            ? {
                ...registryConfig,
                definitions: {
                  ...registryConfig.definitions,
                  horeka: { ...registryConfig.definitions.horeka, disabled: true },
                },
              }
            : {
                ...registryConfig,
                brands: { ...registryConfig.brands, radar: { name: "New Radar" } },
                emailProfiles: {
                  ...registryConfig.emailProfiles,
                  radar: { from: "New Radar <updated@example.test>", templateSet: "assistant" },
                },
                definitions: {
                  ...registryConfig.definitions,
                  radar: {
                    ...registryConfig.definitions.radar,
                    webOrigin: "https://new-radar.example.test",
                    apiOrigin: "https://new-radar.example.test",
                  },
                },
              };
      const consumer = build(policy, { experiences: config });
      await consumer.built.start({ listen: false });
      const result = await terminal(consumer, id, change === "updated" ? "completed" : "failed");
      expect(result.record.input).toEqual(payload("lifecycle-invite", ref));
      expect(policy).not.toHaveBeenCalled();
      if (change === "updated") {
        const stored = await consumer.email.findLatestStoredEmail({
          to: "lifecycle-invite@example.test",
        });
        expect(stored).toMatchObject({
          from: "New Radar <updated@example.test>",
          templateId: "horeka-reminder",
          props: { brand: { name: "New Radar" } },
        });
        expect(stored?.html).toContain("New Radar");
        expect(stored?.html).toContain(
          'href="https://new-radar.example.test/organization/accept-invitation'
        );
        expect(stored?.html).not.toContain("Gastro Raider");
      } else {
        expect(result.record.error).toContain("Unknown or disabled Experience");
        expect(await consumer.email.listStoredEmails()).toEqual([]);
      }
    }
  );

  it.each([
    "missing-policy",
    "declined",
    "ambiguous",
    "removed",
    "disabled",
    "rejected",
    "malformed-reference",
  ])("fails a delayed %s action explicitly without mail", async (failure) => {
    const policy =
      failure === "missing-policy"
        ? undefined
        : jest.fn(async () => {
            if (failure === "rejected") throw new Error("policy lookup offline");
            if (failure === "ambiguous") return JSON.parse('["radar","horeka"]');
            if (failure === "removed") return experienceIdSchema.parse("removed");
            if (failure === "disabled") return experienceIdSchema.parse("horeka");
            return undefined;
          });
    const app =
      failure === "disabled"
        ? build(policy, {
            experiences: {
              ...registryConfig,
              definitions: {
                ...registryConfig.definitions,
                horeka: { ...registryConfig.definitions.horeka, disabled: true },
              },
            },
          })
        : build(policy);
    await invite("failed-invite");
    const data =
      failure === "malformed-reference"
        ? JSON.parse(
            JSON.stringify({
              ...payload("failed-invite"),
              data: { ...payload("failed-invite").data, experienceId: "bad id" },
            })
          )
        : payload("failed-invite");
    const id = await app.jobs.webhook.trigger(data);
    await app.built.start({ listen: false });
    const result = await terminal(app, id, "failed");
    expect(result.record.error).toMatch(/Experience|policy|Invalid/);
    expect(await app.email.listStoredEmails()).toEqual([]);
    if (failure === "malformed-reference") expect(policy).not.toHaveBeenCalled();
  });

  it.each([
    "expired",
    "revoked",
    "grant-revoked",
    "membership-left",
    "foreign-organization",
    "user-banned",
    "entitlement-revoked",
  ])(
    "rechecks live %s authority after enqueue instead of licensing by Experience",
    async (change) => {
      const app = build();
      await invite("authority-invite");
      const id = await app.jobs.admin.trigger(payload("authority-invite", "radar"));
      if (change === "entitlement-revoked")
        await orm
          .update(schema.organizations)
          .set({ billingExempt: false })
          .where(eq(schema.organizations.id, "organization"));
      if (change === "expired")
        await orm
          .update(schema.invitations)
          .set({ expiresAt: new Date(Date.now() - 1) })
          .where(eq(schema.invitations.id, "authority-invite"));
      if (change === "revoked")
        await orm
          .update(schema.invitations)
          .set({ status: "canceled" })
          .where(eq(schema.invitations.id, "authority-invite"));
      if (change === "grant-revoked")
        await orm
          .update(schema.members)
          .set({ role: "member" })
          .where(eq(schema.members.id, "owner-member"));
      if (change === "membership-left")
        await orm
          .update(schema.members)
          .set({ deletedAt: new Date() })
          .where(eq(schema.members.id, "owner-member"));
      if (change === "user-banned")
        await orm.update(schema.users).set({ banned: true }).where(eq(schema.users.id, "owner"));
      if (change === "foreign-organization") {
        await orm
          .insert(schema.organizations)
          .values({ id: "foreign", name: "Foreign", slug: "foreign" });
        await orm
          .update(schema.invitations)
          .set({ organizationId: "foreign" })
          .where(eq(schema.invitations.id, "authority-invite"));
      }
      await app.built.start({ listen: false });
      const result = await terminal(app, id, "failed");
      expect(result.record.error).toMatch(
        /invalid|expired|forbidden|Live Membership required|unavailable|Entitlement denied/
      );
      expect(await app.email.listStoredEmails()).toEqual([]);
    }
  );

  it.each(["shorthand", "adopted-policy"])(
    "runs an older no-reference payload using only the documented %s handling",
    async (mode) => {
      const policy = jest.fn(async () => experienceIdSchema.parse("horeka"));
      const app =
        mode === "shorthand"
          ? build(undefined, {
              name: "Legacy",
              urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
            })
          : build(policy);
      await invite("old-invite");
      const old = payload("old-invite");
      expect(JSON.parse(JSON.stringify(old))).toEqual({
        data: { userId: "owner", organizationId: "organization", invitationId: "old-invite" },
      });
      const id = await app.jobs.scheduled.trigger(old);
      await app.built.start({ listen: false });
      await terminal(app, id, "completed");
      const stored = await app.email.findLatestStoredEmail({ to: "old-invite@example.test" });
      expect(stored?.html).toContain(
        `href="https://${mode === "shorthand" ? "radar" : "horeka"}.example.test/organization/accept-invitation`
      );
      expect(policy).toHaveBeenCalledTimes(mode === "shorthand" ? 0 : 1);
    }
  );

  it("keeps a neutral resource job independent of website presentation", async () => {
    const policy = jest.fn(async () => {
      throw new Error("No communication mapping");
    });
    const app = build(policy);
    const id = await app.neutral.trigger({ data: { resourceId: "neutral-7" } });
    await app.built.start({ listen: false });
    const deadline = Date.now() + 5_000;
    let complete = false;
    while (Date.now() < deadline) {
      const job = await app.workflow.getJob("main", id);
      if ((await job?.getState()) === "completed") {
        expect(job?.returnvalue).toBe("neutral-7");
        complete = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(complete).toBe(true);
    expect(policy).not.toHaveBeenCalled();
    expect(await app.email.listStoredEmails()).toEqual([]);
  });
});
