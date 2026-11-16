import {
  type ExperienceRegistryConfig,
  experienceIdSchema,
} from "@m5kdev/commons/modules/app/experience.schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import {
  BILLING_WEBHOOK_SECRET,
  billingFixture,
  billingQuery,
  billingSchema,
  billingTemplates,
  readBillingTRPC,
} from "../../../test/billing.fixtures";
import { experienceConfig } from "../../../test/experience.fixtures";
import { EmailService } from "../../email/email.service";
import { defaultBillingGrants } from "../billing.grants";
import { BillingService } from "../billing.service";

const trialTemplate = {
  id: "trial-warning",
  react: ({ brand, url, htmlLang }: Record<string, unknown>) =>
    createElement(
      "main",
      { lang: String(htmlLang) },
      createElement("h1", null, (brand as { name: string }).name),
      createElement("a", { href: String(url) }, "Manage billing")
    ),
};
function event(id: string, subscription: unknown) {
  return {
    id,
    object: "event",
    type: "customer.subscription.trial_will_end",
    livemode: false,
    data: { object: subscription },
  };
}

describe("Experience-bound trial warnings from signed events", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = BILLING_WEBHOOK_SECRET;
  });
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  });

  it("sends a selected named-set warning even when the base omits it, with one policy selection before Portal and mail", async () => {
    const policy = jest.fn(async () => experienceIdSchema.parse("horeka"));
    const contexts: unknown[] = [];
    const f = await billingFixture({
      shared: true,
      experiences: {
        ...experienceConfig,
        emailProfiles: {
          assistant: { from: "Horeka <warning@horeka.example.test>", templateSet: "assistant" },
        },
        definitions: {
          ...experienceConfig.definitions,
          horeka: { ...experienceConfig.definitions.horeka, emailProfile: "assistant" },
        },
      },
      emailOptions: {
        communicationPolicy: policy,
        templateSets: { assistant: { ...billingTemplates, trialEnding: trialTemplate } },
      },
      libs: {
        resolveBillingPortalSessionCreate: (context) => {
          contexts.push(context);
          return { configuration: `bpc_${context.experience.id}` };
        },
      },
    });
    try {
      const body = event("evt_horeka", f.recordSubscription("cus_one", "trialing"));
      const response = await f.visit("api.example.test", "/stripe/webhook", {
        method: "POST",
        body,
        headers: { "stripe-signature": f.signWebhook(body) },
      });
      expect(response.status).toBe(200);
      const email = await f.email.findLatestStoredEmail({
        to: "person@example.test",
      });
      expect(email).toMatchObject({
        from: "Horeka <warning@horeka.example.test>",
        templateId: "trial-warning",
        props: {
          experience: { id: "horeka" },
          brand: { name: "Horeka AI" },
          htmlLang: "en-GB",
          url: "https://billing.stripe.com/p/session/bps_1",
        },
      });
      expect(email?.html).toContain("Horeka AI");
      expect(email?.html).toContain('lang="en-GB"');
      expect(policy).toHaveBeenCalledTimes(1);
      expect(policy).toHaveBeenCalledWith({
        event: "billing.trial-will-end",
        eventId: "evt_horeka",
        organizationId: "org_one",
        resourceId: "sub_cus_one",
      });
      expect(f.portalCreates).toHaveLength(1);
      expect(f.portalCreates[0].configuration).toBe("bpc_horeka");
      const url = new URL(f.portalCreates[0].return_url!);
      expect(url.origin).toBe("https://api.example.test");
      expect(url.pathname).toBe("/stripe/portal/return");
      expect(contexts).toEqual([
        expect.objectContaining({
          experience: expect.objectContaining({ id: "horeka" }),
          customerId: "cus_one",
          source: { kind: "trial-ending", eventId: "evt_horeka", subscriptionId: "sub_cus_one" },
        }),
      ]);
      expect(f.synced).toEqual(["cus_one"]);
    } finally {
      await f.close();
    }
  });
  it.each(["none", "unreferenced", "disabled-only", "shadowed-base", "selected-empty"])(
    "preserves the %s optional-template no-op without a new presentation gate",
    async (mode) => {
      const policy = jest.fn(async () => experienceIdSchema.parse("horeka"));
      const withBase = mode === "shadowed-base" || mode === "selected-empty";
      const profiles: NonNullable<ExperienceRegistryConfig["emailProfiles"]> =
        mode === "shadowed-base"
          ? { empty: { templateSet: "empty" } }
          : { assistant: { templateSet: "assistant" }, empty: { templateSet: "empty" } };
      const definitions = Object.fromEntries(
        Object.entries(experienceConfig.definitions).map(([id, definition]) => [
          id,
          {
            ...definition,
            ...(mode === "shadowed-base" ? { emailProfile: "empty" } : {}),
            ...(id === "horeka" && mode === "selected-empty" ? { emailProfile: "empty" } : {}),
            ...(id === "horeka" && mode === "disabled-only"
              ? { emailProfile: "assistant", disabled: true }
              : {}),
          },
        ])
      );
      const f = await billingFixture({
        shared: true,
        experiences: { ...experienceConfig, emailProfiles: profiles, definitions },
        templates: { ...billingTemplates, ...(withBase ? { trialEnding: trialTemplate } : {}) },
        emailOptions: {
          ...(mode === "none" || mode === "shadowed-base" ? {} : { communicationPolicy: policy }),
          templateSets: {
            assistant: { ...billingTemplates, trialEnding: trialTemplate },
            empty: billingTemplates,
          },
        },
      });
      try {
        const body = event(`evt_${mode}`, f.recordSubscription("cus_one", "trialing"));
        const response = await f.visit("api.example.test", "/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": f.signWebhook(body) },
        });
        expect(response.status).toBe(200);
        expect(policy).toHaveBeenCalledTimes(mode === "selected-empty" ? 1 : 0);
        expect(f.portalCreates).toEqual([]);
        expect(await f.email.listStoredEmails()).toEqual([]);
        expect(f.synced).toEqual(["cus_one"]);
        const cookie = await f.login("radar");
        await f.activate(cookie);
        const visible = await f.visit("api.example.test", billingQuery("getActiveSubscription"), {
          cookie,
        });
        expect(await readBillingTRPC(visible)).toMatchObject({
          referenceId: "org_one",
          status: "trialing",
        });
      } finally {
        await f.close();
      }
    }
  );

  it.each(["missing", "declined", "removed", "disabled", "ambiguous", "rejected"])(
    "fails %s policy before Portal/send when the warning is reachable, while preserving reconciliation",
    async (failure) => {
      const policy = jest.fn(async () => {
        if (failure === "rejected") throw new Error("Policy unavailable");
        if (failure === "declined") return undefined;
        if (failure === "ambiguous") return JSON.parse('["radar","horeka"]');
        return experienceIdSchema.parse(failure === "disabled" ? "horeka" : "removed");
      });
      const f = await billingFixture({
        shared: true,
        templates: { ...billingTemplates, trialEnding: trialTemplate },
        experiences: {
          ...experienceConfig,
          definitions: {
            ...experienceConfig.definitions,
            horeka: { ...experienceConfig.definitions.horeka, disabled: failure === "disabled" },
          },
        },
        emailOptions: failure === "missing" ? undefined : { communicationPolicy: policy },
      });
      try {
        const body = event(`evt_${failure}`, f.recordSubscription("cus_one", "trialing"));
        const response = await f.visit("api.example.test", "/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": f.signWebhook(body) },
        });
        expect(response.status).toBe(500);
        expect(policy).toHaveBeenCalledTimes(failure === "missing" ? 0 : 1);
        expect(f.portalCreates).toEqual([]);
        expect(await f.email.listStoredEmails()).toEqual([]);
        expect(f.synced).toEqual(["cus_one"]);
      } finally {
        await f.close();
      }
    }
  );

  it("keeps concurrent A/B warnings and a partner browser Portal isolated for one Organization", async () => {
    const policy = jest.fn(async ({ eventId }: { eventId?: string }) =>
      experienceIdSchema.parse(eventId === "evt_a" ? "radar" : "horeka")
    );
    const f = await billingFixture({
      shared: true,
      experiences: {
        ...experienceConfig,
        emailProfiles: {
          radar: { from: "Radar <a@example.test>", templateSet: "a" },
          horeka: { from: "Horeka <b@example.test>", templateSet: "b" },
        },
        definitions: {
          ...experienceConfig.definitions,
          radar: { ...experienceConfig.definitions.radar, emailProfile: "radar" },
          horeka: { ...experienceConfig.definitions.horeka, emailProfile: "horeka" },
        },
      },
      emailOptions: {
        communicationPolicy: policy,
        templateSets: {
          a: { ...billingTemplates, trialEnding: { ...trialTemplate, id: "radar-trial" } },
          b: { ...billingTemplates, trialEnding: { ...trialTemplate, id: "horeka-trial" } },
        },
      },
      libs: {
        resolveBillingPortalSessionCreate: ({ experience }) => ({
          configuration: `bpc_${experience.id}`,
        }),
      },
    });
    try {
      const subscription = f.recordSubscription("cus_one", "trialing");
      const prime = { ...event("evt_prime", subscription), type: "customer.subscription.updated" };
      expect(
        (
          await f.visit("api.example.test", "/stripe/webhook", {
            method: "POST",
            body: prime,
            headers: { "stripe-signature": f.signWebhook(prime) },
          })
        ).status
      ).toBe(200);
      const cookie = await f.login("radar");
      await f.activate(cookie);
      const bodies = [event("evt_a", subscription), event("evt_b", subscription)];
      const results = await Promise.all([
        ...bodies.map((body) =>
          f.visit("api.example.test", "/stripe/webhook", {
            method: "POST",
            body,
            headers: { "stripe-signature": f.signWebhook(body) },
          })
        ),
        f.visit("api.example.test", "/trpc/billing.startPortal", {
          cookie,
          origin: "https://partner.example.test",
          method: "POST",
          body: {},
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(policy).toHaveBeenCalledTimes(2);
      const messages = await f.email.listStoredEmails();
      expect(messages).toHaveLength(2);
      for (const [id, name, from] of [
        ["radar", "Gastro Raider", "Radar <a@example.test>"],
        ["horeka", "Horeka AI", "Horeka <b@example.test>"],
      ]) {
        const message = messages.find((row) => row.templateId === `${id}-trial`);
        if (!message) throw new Error(`Missing ${id} trial warning`);
        const full = await f.email.readStoredEmail(message.id);
        expect(message.props.experience).toMatchObject({ id });
        expect(message.from).toBe(from);
        expect(message.templateId).toBe(`${id}-trial`);
        expect(full?.html).toContain(name);
        expect(full?.html).toContain('lang="en-GB"');
        const portalIndex = f.portalCreates.findIndex(
          (params) => params.configuration === `bpc_${id}`
        );
        expect(message.props.url).toBe(
          `https://billing.stripe.com/p/session/bps_${portalIndex + 1}`
        );
        const returned = new URL(f.portalCreates[portalIndex].return_url!);
        const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
        expect(done.status).toBe(302);
        expect(done.headers.get("location")).toBe(`https://${id}.example.test/billing`);
      }
      expect(f.portalCreates.map((p) => p.configuration).sort()).toEqual([
        "bpc_horeka",
        "bpc_partner",
        "bpc_radar",
      ]);
      const visible = await f.visit("api.example.test", billingQuery("getActiveSubscription"), {
        cookie,
      });
      expect(await readBillingTRPC(visible)).toMatchObject({
        referenceId: "org_one",
        status: "trialing",
      });
    } finally {
      await f.close();
    }
  });

  it("requires a current Owner of the bound active Organization for a communication return without inventing an issuing browser", async () => {
    const f = await billingFixture({
      shared: true,
      templates: { ...billingTemplates, trialEnding: trialTemplate },
      emailOptions: { communicationPolicy: () => experienceIdSchema.parse("radar") },
    });
    try {
      const body = event("evt_transfer", f.recordSubscription("cus_one", "trialing"));
      expect(
        (
          await f.visit("api.example.test", "/stripe/webhook", {
            method: "POST",
            body,
            headers: { "stripe-signature": f.signWebhook(body) },
          })
        ).status
      ).toBe(200);
      const url = new URL(f.portalCreates[0].return_url!);
      const original = await f.login("radar");
      await f.activate(original, "two");
      const baseline = f.synced.length;
      const crossed = await f.visit(url.host, url.pathname + url.search, { cookie: original });
      expect(crossed.status).toBe(400);
      expect(f.synced).toHaveLength(baseline);
      await f.orm.insert(billingSchema.users).values({
        id: "new-owner",
        name: "New",
        email: "new-owner@example.test",
        emailVerified: true,
        role: "user",
      });
      await f.orm.insert(billingSchema.accounts).values({
        id: "new-credential",
        providerId: "credential",
        accountId: "new-owner",
        userId: "new-owner",
        password: await hashPassword("Original-Password-123"),
      });
      await f.orm.insert(billingSchema.members).values({
        id: "new-member",
        userId: "new-owner",
        organizationId: "org_one",
        role: "owner",
      });
      await f.orm
        .update(billingSchema.members)
        .set({ role: "member" })
        .where(eq(billingSchema.members.id, "member_one"));
      const replacement = await f.login("radar", "new-owner");
      await f.activate(replacement);
      const accepted = await f.visit(url.host, url.pathname + url.search, { cookie: replacement });
      expect(accepted.status).toBe(302);
      expect(accepted.headers.get("location")).toBe("https://radar.example.test/billing");
      expect(f.synced.slice(baseline)).toEqual(["cus_one"]);
      await f.activate(original);
      const denied = await f.visit(url.host, url.pathname + url.search, { cookie: original });
      expect(denied.status).toBe(403);
      expect(f.synced.slice(baseline)).toEqual(["cus_one"]);
    } finally {
      await f.close();
    }
  });

  it("rejects an invalid real Stripe signature before reconciliation, policy or Portal effects", async () => {
    const policy = jest.fn(() => experienceIdSchema.parse("radar"));
    const f = await billingFixture({
      shared: true,
      templates: { ...billingTemplates, trialEnding: trialTemplate },
      emailOptions: { communicationPolicy: policy },
    });
    try {
      const body = event("evt_signed", f.recordSubscription("cus_one", "trialing"));
      const bad = await f.visit("api.example.test", "/stripe/webhook", {
        method: "POST",
        body: { ...body, id: "evt_forged" },
        headers: { "stripe-signature": f.signWebhook(body) },
      });
      expect(bad.status).toBe(500);
      expect(f.synced).toEqual([]);
      expect(policy).not.toHaveBeenCalled();
      expect(f.portalCreates).toEqual([]);
      const good = await f.visit("api.example.test", "/stripe/webhook", {
        method: "POST",
        body,
        headers: { "stripe-signature": f.signWebhook(body) },
      });
      expect(good.status).toBe(200);
      expect(f.synced).toEqual(["cus_one"]);
      expect(policy).toHaveBeenCalledTimes(1);
      expect(f.portalCreates).toHaveLength(1);
      expect(await f.email.listStoredEmails()).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it.each([
    "cancel-policy",
    "subscription-card",
    "customer-card",
    "no-recipient",
    "closed-organization",
    "deleted-customer",
  ])("keeps current %s checks ahead of policy and Portal effects", async (condition) => {
    const policy = jest.fn(() => experienceIdSchema.parse("radar"));
    const f = await billingFixture({
      shared: true,
      templates: { ...billingTemplates, trialEnding: trialTemplate },
      emailOptions: { communicationPolicy: policy },
    });
    try {
      const sub = f.recordSubscription("cus_one", "trialing");
      if (condition === "cancel-policy")
        sub.trial_settings!.end_behavior.missing_payment_method = "pause";
      if (condition === "subscription-card") sub.default_payment_method = "pm_subscription";
      if (condition === "customer-card")
        f.customers.get("cus_one")!.invoice_settings.default_payment_method = "pm_customer";
      if (condition === "no-recipient") f.customers.get("cus_one")!.email = null;
      if (condition === "deleted-customer") f.customers.get("cus_one")!.deleted = true;
      if (condition === "closed-organization")
        await f.orm
          .update(billingSchema.organizations)
          .set({ closedAt: new Date() })
          .where(eq(billingSchema.organizations.id, "org_one"));
      const body = event(`evt_${condition}`, sub);
      const response = await f.visit("api.example.test", "/stripe/webhook", {
        method: "POST",
        body,
        headers: { "stripe-signature": f.signWebhook(body) },
      });
      expect(response.status).toBe(
        ["closed-organization", "deleted-customer"].includes(condition) ? 500 : 200
      );
      expect(policy).not.toHaveBeenCalled();
      expect(f.portalCreates).toEqual([]);
      expect(await f.email.listStoredEmails()).toEqual([]);
      expect(f.synced).toEqual(["cus_one"]);
    } finally {
      await f.close();
    }
  });

  it.each(["portal", "delivery", "contextual"])(
    "retries a %s failure without a false successful delivery mark and suppresses only later successful duplicates",
    async (failure) => {
      let failContext = failure === "contextual";
      const policy = jest.fn(() => experienceIdSchema.parse("radar"));
      const f = await billingFixture({
        shared: true,
        templates: { ...billingTemplates, trialEnding: trialTemplate },
        emailOptions: { communicationPolicy: policy },
        libs: {
          resolveBillingPortalSessionCreate: () => {
            if (failContext) throw new Error("Contextual selection offline");
            return {};
          },
        },
      });
      try {
        const email = f.email;
        if (failure === "portal") f.portalState.failures = 1;
        if (failure === "delivery") email.mode = "send";
        const body = event("evt_retry", f.recordSubscription("cus_one", "trialing"));
        const send = (payload = body) =>
          f.visit("api.example.test", "/stripe/webhook", {
            method: "POST",
            body: payload,
            headers: { "stripe-signature": f.signWebhook(payload) },
          });
        expect((await send()).status).toBe(500);
        expect(await email.listStoredEmails()).toEqual([]);
        failContext = false;
        email.mode = "store";
        expect((await send()).status).toBe(200);
        expect(await email.listStoredEmails()).toHaveLength(1);
        const portalCount = f.portalCreates.length;
        expect((await send()).status).toBe(200);
        expect(f.portalCreates).toHaveLength(portalCount);
        expect(await email.listStoredEmails()).toHaveLength(1);
        expect(policy).toHaveBeenCalledTimes(2);
        expect((await send({ ...body, id: "evt_later" })).status).toBe(200);
        expect(await email.listStoredEmails()).toHaveLength(2);
        expect(f.portalCreates).toHaveLength(portalCount + 1);
        expect(policy).toHaveBeenCalledTimes(3);
        expect(f.synced).toEqual(["cus_one", "cus_one", "cus_one", "cus_one"]);
      } finally {
        await f.close();
      }
    }
  );

  it("retries a failed policy lookup with current approved output instead of marking the event delivered", async () => {
    let selected = "removed";
    const policy = jest.fn(() => experienceIdSchema.parse(selected));
    const f = await billingFixture({
      shared: true,
      templates: { ...billingTemplates, trialEnding: trialTemplate },
      emailOptions: { communicationPolicy: policy },
    });
    try {
      const body = event("evt_policy_retry", f.recordSubscription("cus_one", "trialing"));
      const send = () =>
        f.visit("api.example.test", "/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": f.signWebhook(body) },
        });
      expect((await send()).status).toBe(500);
      expect(f.portalCreates).toEqual([]);
      selected = "radar";
      expect((await send()).status).toBe(200);
      expect(policy).toHaveBeenCalledTimes(2);
      expect(f.portalCreates).toHaveLength(1);
      expect(await f.email.listStoredEmails()).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it.each(["standard-key", "no-runtime-key"])(
    "preserves existing shorthand trial delivery with %s",
    async (mode) => {
      const f = await billingFixture({
        legacy: true,
        ...(mode === "no-runtime-key" ? { secret: null } : {}),
        templates: { ...billingTemplates, trialEnding: trialTemplate },
      });
      try {
        const body = event("evt_legacy", f.recordSubscription("cus_one", "trialing"));
        const response = await f.visit("radar.example.test", "/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": f.signWebhook(body) },
        });
        expect(response.status).toBe(200);
        const email = await f.email.findLatestStoredEmail({
          to: "person@example.test",
        });
        expect(email?.html).toContain("Legacy");
        expect(email?.props.htmlLang).toBe("en-GB");
        expect(new URL(f.portalCreates[0].return_url!).pathname).toBe(
          mode === "standard-key" ? "/stripe/portal/return" : "/stripe/success"
        );
      } finally {
        await f.close();
      }
    }
  );
  it("rejects a source rewrite and leaves no-registry custom composition explicit", async () => {
    const f = await billingFixture({
      shared: true,
      templates: { ...billingTemplates, trialEnding: trialTemplate },
      emailOptions: { communicationPolicy: () => experienceIdSchema.parse("radar") },
    });
    try {
      const body = event("evt_source", f.recordSubscription("cus_one", "trialing"));
      expect(
        (
          await f.visit("api.example.test", "/stripe/webhook", {
            method: "POST",
            body,
            headers: { "stripe-signature": f.signWebhook(body) },
          })
        ).status
      ).toBe(200);
      const cookie = await f.login("radar");
      const sessionId = await f.activate(cookie);
      const baseline = f.synced.length;
      const url = new URL(f.portalCreates[0].return_url!);
      const raw = JSON.parse(Buffer.from(url.searchParams.get("flow")!, "base64url").toString());
      raw.source = { kind: "browser", userId: "person", memberId: "member_one", sessionId };
      url.searchParams.set("flow", Buffer.from(JSON.stringify(raw)).toString("base64url"));
      const changed = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(changed.status).toBe(400);
      expect(f.synced).toHaveLength(baseline);
      const manual = new BillingService(
        { billing: f.built.modules.billing.repositories.billing },
        {
          email: new EmailService({
            templates: { ...billingTemplates, trialEnding: trialTemplate },
            mode: "log",
          }),
        },
        defaultBillingGrants
      );
      const signed = manual.constructEvent(JSON.stringify(body), f.signWebhook(body));
      if (signed.isErr()) throw signed.error;
      const result = await manual.processEvent(signed.value);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.message).toContain("registry is not configured");
      expect(f.portalCreates).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
});
