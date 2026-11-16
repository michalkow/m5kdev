import { readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBackendApp } from "@m5kdev/backend/app";
import {
  type AdminActor,
  type OrganizationActor,
  resolveOrganizationActor,
} from "@m5kdev/backend/base/base.actor";
import * as authTables from "@m5kdev/backend/modules/auth/auth.db";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import type { AuthService } from "@m5kdev/backend/modules/auth/auth.service";
import * as billingTables from "@m5kdev/backend/modules/billing/billing.db";
import { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";
import type { BillingService } from "@m5kdev/backend/modules/billing/billing.service";
import * as connectTables from "@m5kdev/backend/modules/connect/connect.db";
import { ConnectModule } from "@m5kdev/backend/modules/connect/connect.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import type { EmailTemplates } from "@m5kdev/backend/modules/email/email.service";
import * as fileTables from "@m5kdev/backend/modules/file/file.db";
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
import * as workflowTables from "@m5kdev/backend/modules/workflow/workflow.db";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import IORedis from "ioredis";
import { Pool } from "pg";
import { createElement } from "react";
import Stripe from "stripe";
import { z } from "zod";
import { catalog } from "./catalog";
import { ReferenceModule } from "./reference.module";
import { prepareExperienceTables } from "./test-database";

const schema = {
  users: authTables.users,
  sessions: authTables.sessions,
  accounts: authTables.accounts,
  verifications: authTables.verifications,
  organizations: authTables.organizations,
  members: authTables.members,
  invitations: authTables.invitations,
  apikeys: authTables.apikeys,
  waitlist: authTables.waitlist,
  accountClaims: authTables.accountClaims,
  accountClaimMagicLinks: authTables.accountClaimMagicLinks,
  subscriptions: billingTables.subscriptions,
  files: fileTables.files,
  connect: connectTables.connect,
  workflows: workflowTables.workflows,
};
const secret = "reference-local-only-credential-at-least-thirty-two-characters";
export async function bootReference(topology: "local" | "shared") {
  const namespace = process.env.DATABASE_SCHEMA;
  if (!namespace || !/^test_[a-f0-9]+$/.test(namespace))
    throw new Error("Reference requires an owned test schema");
  const workflowPrefix = `reference-${namespace}`;
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!redisUrl) throw new Error("TEST_REDIS_URL must name the owned reference Redis");
  const originalFetch = globalThis.fetch;
  const webhookSecret = "whsec_reference_local_recording_only";
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  const localBucket = `reference-files-${namespace}`;
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 4,
  });
  let server: Server | undefined;
  let shutdown: () => Promise<void> = async () => {};
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve()))
        );
      await shutdown();
      globalThis.fetch = originalFetch;
      if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
      const cleanupRedis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
      try {
        const keys = await cleanupRedis.keys(`${workflowPrefix}:*`);
        if (keys.length) await cleanupRedis.del(...keys);
      } finally {
        await cleanupRedis.quit();
      }
      await rm(path.join(tmpdir(), "m5kdev-file-s3", localBucket), {
        recursive: true,
        force: true,
      });
      await pool.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    } finally {
      await pool.end();
    }
  };
  try {
    await prepareExperienceTables(pool, schema);
    const orm = drizzle(pool, { schema });
    await orm.insert(authTables.users).values({
      id: "person",
      name: "Person",
      email: "person@example.test",
      emailVerified: true,
      role: "user",
      locale: "en_GB",
      preferences: { compactMode: true },
    });
    await orm.insert(authTables.accounts).values({
      id: "credential",
      providerId: "credential",
      accountId: "person",
      userId: "person",
      password: await hashPassword("Reference-Password-123"),
    });
    const trialCustomers = new Set<string>();
    const checkoutSessions = new Map<string, Record<string, unknown>>();
    const customerPlans = new Map<string, string>();
    const orgs = ["reports", "combined", "unpaid", "exempt", "denied"];
    for (const id of orgs) {
      await orm.insert(authTables.organizations).values({
        id: `org_${id}`,
        name: id,
        slug: id,
        currency: "usd",
        locale: "en_GB",
        preferences: { referenceOffice: id === "reports" },
        billingExempt: id === "exempt",
        stripeSandboxCustomerId: `cus_${id}`,
      });
      await orm.insert(authTables.members).values({
        id: `member_${id}`,
        organizationId: `org_${id}`,
        userId: "person",
        email: "person@example.test",
        role: id === "denied" ? "member" : "owner",
      });
      if (id === "reports" || id === "combined") {
        await orm.insert(authTables.users).values({
          id: `guest_user_${id}`,
          email: `${id}-guest@example.test`,
          name: `${id} guest`,
          emailVerified: true,
        });
        await orm.insert(authTables.members).values({
          id: `guest_${id}`,
          userId: `guest_user_${id}`,
          organizationId: `org_${id}`,
          email: `${id}-guest@example.test`,
          name: `${id} guest`,
          role: "member",
        });
      }
      if (id !== "unpaid" && id !== "exempt")
        customerPlans.set(`cus_${id}`, id === "reports" ? "price_reports" : "price_combined");
    }
    const creates: { kind: string; params: URLSearchParams }[] = [];
    const stripe = new Stripe("sk_test_recording_reference", {
      httpClient: Stripe.createFetchHttpClient(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const parsed = new URL(String(url));
          const pathname = parsed.pathname;
          const params = new URLSearchParams(
            typeof init?.body === "string" ? init.body : undefined
          );
          let data: unknown;
          if (pathname.startsWith("/v1/customers/"))
            data = {
              id: pathname.split("/").at(-1),
              object: "customer",
              email: "person@example.test",
              metadata: {},
              invoice_settings: { default_payment_method: null },
            };
          else if (pathname === "/v1/subscriptions") {
            const customer = parsed.searchParams.get("customer") ?? "";
            const price = customerPlans.get(customer);
            const now = Math.floor(Date.now() / 1000);
            data = {
              object: "list",
              data: price
                ? [
                    {
                      id: `sub_${customer}`,
                      object: "subscription",
                      customer,
                      status: trialCustomers.has(customer) ? "trialing" : "active",
                      ...(trialCustomers.has(customer) ? { trial_end: now + 3 * 86400 } : {}),
                      items: {
                        data: [
                          {
                            id: `si_${customer}`,
                            quantity: 1,
                            price: {
                              id: price,
                              unit_amount: 1000,
                              recurring: {
                                interval: "month",
                                interval_count: 1,
                              },
                            },
                            current_period_start: now,
                            current_period_end: now + 86400,
                          },
                        ],
                      },
                      discounts: [],
                      cancel_at_period_end: false,
                      metadata: {},
                    },
                  ]
                : [],
            };
          } else if (pathname.startsWith("/v1/checkout/sessions/")) {
            const id = pathname.split("/").at(-1)!;
            data = checkoutSessions.get(id);
            if (!data) throw new Error("Unknown Checkout");
          } else if (pathname === "/v1/invoices") data = { object: "list", data: [] };
          else if (
            pathname === "/v1/checkout/sessions" ||
            pathname === "/v1/billing_portal/sessions"
          ) {
            const kind = pathname.includes("checkout") ? "checkout" : "portal";
            creates.push({ kind, params });
            const id = `recorded_${creates.length}`;
            if (kind === "checkout")
              checkoutSessions.set(id, {
                id,
                object: "checkout.session",
                customer: params.get("customer"),
                livemode: false,
                status: "complete",
                payment_status: "paid",
                metadata: Object.fromEntries(
                  [...params]
                    .filter(([k]) => k.startsWith("metadata["))
                    .map(([k, v]) => [k.slice(9, -1), v])
                ),
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              });
            data = {
              id,
              object: "session",
              url: `https://recorded-stripe.example.test/${kind}/${creates.length}`,
            };
          } else throw new Error(`Unrecorded Stripe request: ${pathname}`);
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      ),
    });
    // Bind the listener first so canonical configured origins contain the real assigned port.
    const { default: express } = await import("express");
    const shell = express();
    server = await new Promise<Server>((resolve, reject) => {
      const listening = shell.listen(0, "127.0.0.1", () => resolve(listening));
      listening.once("error", reject);
    });
    const port = (server.address() as AddressInfo).port;
    const hosts =
      topology === "local"
        ? { alpha: "alpha.test", beta: "beta.test", partner: "partner.test" }
        : {
            alpha: "a.experience.test",
            beta: "b.experience.test",
            partner: "partner.experience.test",
          };
    const origins = Object.fromEntries(
      Object.entries(hosts).map(([id, host]) => [id, `http://${host}:${port}`])
    );
    const definitions = Object.fromEntries(
      Object.entries(origins).map(([id, webOrigin]) => [
        id,
        {
          product: id === "beta" ? "assistant" : "reports",
          brand: id,
          webOrigin,
          apiOrigin: topology === "shared" ? `http://api.experience.test:${port}` : webOrigin,
        },
      ])
    );
    const exchanges: URLSearchParams[] = [];
    const internalApiHosts = new Set(
      Object.values(definitions).map((d) => new URL(d.apiOrigin).host)
    );
    // Record the external provider boundary; route server-owned magic-link HTTP to the actual listener.
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.href === "https://provider.example.test/token") {
        exchanges.push(new URLSearchParams(String(init?.body)));
        return new Response(
          JSON.stringify({
            access_token: "recorded-access",
            refresh_token: "recorded-refresh",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
      if (internalApiHosts.has(url.host)) {
        return new Promise<Response>((resolve, reject) => {
          const req = httpRequest(
            {
              host: "127.0.0.1",
              port,
              path: url.pathname + url.search,
              method: init?.method ?? "GET",
              headers: {
                ...Object.fromEntries(new Headers(init?.headers)),
                host: url.host,
              },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => {
                body += chunk;
              });
              res.on("end", () =>
                resolve(
                  new Response(body, {
                    status: res.statusCode,
                    headers: (() => {
                      const headers = new Headers();
                      for (const [k, v] of Object.entries(res.headers))
                        if (typeof v === "string") headers.append(k, v);
                        else if (Array.isArray(v)) for (const value of v) headers.append(k, value);
                      return headers;
                    })(),
                  })
                )
              );
            }
          );
          req.on("error", reject);
          if (init?.body) req.write(String(init.body));
          req.end();
        });
      }
      return originalFetch(input, init);
    };
    const template = {
      id: "reference",
      react: ({ brand, url, htmlLang }: Record<string, unknown>) =>
        createElement(
          "main",
          { lang: String(htmlLang) },
          createElement("h1", null, (brand as { name: string }).name),
          createElement("a", { href: String(url) }, "Continue")
        ),
    };
    const templates: EmailTemplates = {
      accountDeletion: template,
      verification: template,
      passwordReset: template,
      organizationInvite: template,
      waitlistInvite: template,
      waitlistUserInvite: template,
      waitlistConfirmation: template,
      systemWaitlistNotification: template,
      magicLink: template,
      trialEnding: template,
      reminder: template,
    };
    const webRoot = fileURLToPath(new URL("../dist", import.meta.url));
    const built = createBackendApp(
      {
        db: { client: pool },
        schema,
        redis: { url: redisUrl, options: { maxRetriesPerRequest: null } },
        express: shell,
        env: {
          APP_ENV: "local",
          APP_SLUG: "experience-reference",
          BETTER_AUTH_SECRET: secret,
        },
        app: {
          experiences: {
            defaultExperience: "alpha",
            brands: {
              alpha: { name: "Alpha Reports" },
              beta: { name: "Beta Assistant" },
              partner: { name: "Partner Reports" },
            },
            definitions: Object.fromEntries(
              Object.entries(definitions).map(([id, d]) => [id, { ...d, emailProfile: id }])
            ),
            emailProfiles: Object.fromEntries(
              Object.keys(definitions).map((id) => [
                id,
                { from: `${id} <${id}@example.test>`, templateSet: id },
              ])
            ),
          },
          locales: {
            defaultLocale: "en",
            locales: [
              { code: "en", displayName: "English" },
              { code: "en_GB", displayName: "English (UK)" },
            ],
          },
        },
        email: {
          mode: "store",
          from: "reference@example.test",
          outputDirectory: `${process.env.REFERENCE_ARTIFACT_ROOT ?? "/tmp/m5kdev-implement-88/99-artifacts"}/emails`,
        },
        spa: { root: webRoot },
        auth: {
          factory: ({ db, appConfig, experienceFlows, services }) =>
            createBetterAuth({
              orm: db.orm,
              schema,
              app: appConfig,
              experienceFlows,
              services: { email: services.email.email },
              options: { secret, rateLimit: { enabled: false } },
            }),
        },
      },
      [
        new EmailModule(templates, {
          templateSets: Object.fromEntries(
            Object.keys(definitions).map((id) => [
              id,
              {
                ...templates,
                ...Object.fromEntries(
                  Object.entries(templates).flatMap(([key, value]) =>
                    value ? [[key, { ...value, id: `${id}-${key}` }]] : []
                  )
                ),
              },
            ])
          ),
          communicationPolicy: async () => experienceIdSchema.parse("beta"),
        }),
        new BillingModule(
          {
            stripe,
            resolveCheckoutSessionCreate: ({ experience }) => ({
              metadata: { referenceExperience: experience.id },
            }),
            resolveBillingPortalSessionCreate: ({ experience }) => ({
              configuration: `bpc_${experience.id}`,
            }),
          },
          catalog
        ),
        new AuthModule(),
        new FileModule({ buckets: [localBucket] }),
        new ConnectModule(
          [
            {
              id: "recording",
              clientId: "recording-client",
              clientSecret: "recording-secret",
              scopes: ["read"],
              redirectUris: Object.fromEntries(
                Object.entries(definitions).map(([id, d]) => [
                  id,
                  `${d.apiOrigin}/connections/recording/callback`,
                ])
              ),
              issuerConfig: {
                issuer: "https://provider.example.test",
                authorization_endpoint: "https://provider.example.test/authorize",
                token_endpoint: "https://provider.example.test/token",
              },
              mapProfile: async () => ({
                providerAccountId: "external-person",
                displayName: "External Person",
                accountType: "user",
              }),
            },
          ],
          { mountPath: "/connections" }
        ),
        new WorkflowModule({
          prefix: workflowPrefix,
          boardPath: null,
          schedulers: false,
          reconcile: { enabled: false },
          queues: { main: { concurrency: 2 } },
          defaultQueue: "main",
        }),
        new ReferenceModule(await readFile(`${webRoot}/index.html`, "utf8")),
      ] as const
    );
    shutdown = () => built.shutdown();
    const billing = built.modules.billing.services.billing as BillingService;
    const auth: AuthService = built.modules.auth.services.auth;
    const email = built.modules.email.services.email;
    const registry = built.config.app.experienceRegistry!;
    const owner = await auth.repository.user.findById("person");
    if (owner.isErr() || !owner.value) throw new Error("Owner missing");
    const ownerContext = (id: string) => ({
      user: owner.value!,
      experience: registry.get(id),
      actor: {
        userId: "person",
        userRole: "user",
        organizationId: "org_reports",
        organizationRole: "owner",
        memberId: "member_reports",
        teamId: null,
        teamRole: null,
      } satisfies OrganizationActor,
    });
    const adminContext = (id: string) => ({
      ...ownerContext(id),
      actor: {
        userId: "person",
        userRole: "admin",
        organizationId: null,
        organizationRole: null,
        memberId: null,
        teamId: null,
        teamRole: null,
      } satisfies AdminActor,
    });
    const workflow = built.workflow!;
    const reminderInput = z
      .object({
        userId: z.string(),
        organizationId: z.string(),
        invitationId: z.string(),
        experienceId: experienceIdSchema,
      })
      .strict();
    const reminder = workflow.service
      .job<{ data: z.infer<typeof reminderInput> }>({
        name: "reference.invitation-reminder",
        retries: 1,
      })
      .input(reminderInput, true)
      .handle(async ({ data }) => {
        const requester = await auth.repository.user.findById(data.userId);
        if (
          requester.isErr() ||
          !requester.value ||
          requester.value.closedAt ||
          requester.value.banned
        )
          throw new Error("User unavailable");
        const actor = await resolveOrganizationActor({
          user: { userId: requester.value.id, userRole: requester.value.role ?? "user" },
          organizationId: data.organizationId,
          memberships: auth.repository.organization,
        });
        if (actor.isErr()) throw actor.error;
        const link = await auth.createOrganizationInvitationLink(
          { id: data.invitationId },
          {
            user: requester.value,
            actor: actor.value,
            experience: registry.get(data.experienceId),
          }
        );
        if (link.isErr()) throw link.error;
        const org = await auth.repository.organization.findById(data.organizationId);
        if (org.isErr() || !org.value) throw new Error("Organization missing");
        const invitation = await auth.repository.invitation.findById(data.invitationId);
        if (invitation.isErr() || !invitation.value) throw new Error("Invitation missing");
        const sent = await email.sendTemplate(
          invitation.value.email,
          "reminder",
          { url: link.value.url },
          {
            experience: data.experienceId,
            locale: org.value.locale ?? undefined,
          }
        );
        if (sent.isErr()) throw sent.error;
      });
    workflow.registry.registerService({ reminder });
    await built.start({ listen: false });
    for (const id of orgs.filter((id) => customerPlans.has(`cus_${id}`)))
      (await billing.syncStripeData({ customerId: `cus_${id}` }))._unsafeUnwrap();
    return {
      built,
      pool,
      orm,
      port,
      origins,
      creates,
      exchanges,
      definitions,
      email,
      auth,
      registry,
      ownerContext,
      adminContext,
      reminder,
      workflow,
      signWebhook: (body: unknown) =>
        stripe.webhooks.generateTestHeaderString({
          payload: JSON.stringify(body),
          secret: webhookSecret,
        }),
      recordTrial: (customer: string) => {
        trialCustomers.add(customer);
      },
      setPriceAtStripe: (id: string, price: string) => customerPlans.set(`cus_${id}`, price),
      changePlan: async (id: string, price: string) => {
        customerPlans.set(`cus_${id}`, price);
        (await billing.syncStripeData({ customerId: `cus_${id}` }))._unsafeUnwrap();
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type ReferenceRouter = Awaited<ReturnType<typeof bootReference>>["built"]["trpc"]["router"];
