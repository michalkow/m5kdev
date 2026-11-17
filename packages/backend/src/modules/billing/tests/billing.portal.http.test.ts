import { transformer } from "@m5kdev/commons/utils/trpc";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ExperienceFlowSigner } from "../../../experience-flows";
import {
  BILLING_SECRET,
  billingFixture,
  billingQuery,
  billingSchema,
  readBillingTRPC,
} from "../../../test/billing.fixtures";
import { experienceConfig } from "../../../test/experience.fixtures";
import { defaultBillingGrants } from "../billing.grants";
import { createPortalReturnUrl } from "../billing.portal";
import { BillingService } from "../billing.service";

describe("Experience-bound Billing Portal", () => {
  it("returns its original Owner to the entered Experience after reconciling the bound Customer", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("horeka");
      await f.activate(cookie);
      await f.visit("horeka.example.test", "/stripe/checkout/price_usd", { cookie });
      const checkout = new URL(f.complete());
      expect(
        (await f.visit(checkout.host, checkout.pathname + checkout.search, { cookie })).status
      ).toBe(302);
      const start = await f.visit(
        "horeka.example.test",
        "/stripe/portal?returnPath=%2Fsettings%3Ftab%3Dbilling%23plans",
        { cookie }
      );
      expect(start.status).toBe(302);
      expect(start.headers.get("location")).toBe("https://billing.stripe.com/p/session/bps_1");
      expect(f.portalCreates[0].customer).toBe("cus_one");
      expect(f.portalCreates[0].return_url).toContain(
        "https://horeka.example.test/stripe/portal/return?"
      );
      f.subscriptions.get("cus_one")!.status = "past_due";
      const returned = new URL(f.portalCreates[0].return_url!);
      const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe(
        "https://horeka.example.test/settings?tab=billing#plans"
      );
      const subscription = await f.visit(
        "horeka.example.test",
        billingQuery("getActiveSubscription"),
        { cookie }
      );
      expect(await readBillingTRPC(subscription)).toMatchObject({
        referenceId: "org_one",
        status: "past_due",
        environment: "sandbox",
      });
      expect(f.portalCreates).toHaveLength(1);
      expect(f.retrieved).toEqual(["cs_test_1"]);
      expect(f.creates).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it("starts through shared-API browser POST and safely repeats the bound return without a Portal retrieve API", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      await f.visit("api.example.test", "/trpc/billing.startCheckout", {
        cookie,
        origin: "https://radar.example.test",
        method: "POST",
        body: { priceId: "price_usd" },
      });
      f.complete();
      const baseline = f.synced.length;
      const neutral = await f.visit("api.example.test", "/stripe/portal", { cookie });
      expect(neutral.status).toBe(400);
      expect(f.portalCreates).toHaveLength(0);
      const start = await f.visit("api.example.test", "/trpc/billing.startPortal", {
        cookie,
        origin: "https://radar.example.test",
        method: "POST",
        body: { returnPath: "/billing?from=shared" },
      });
      expect(start.status).toBe(200);
      const body = z
        .array(z.object({ result: z.object({ data: z.string() }) }))
        .parse(await start.json());
      expect(transformer.deserialize(body[0].result.data)).toEqual({
        url: "https://billing.stripe.com/p/session/bps_1",
      });
      const url = new URL(f.portalCreates[0].return_url!);
      expect(url.host).toBe("api.example.test");
      for (let index = 0; index < 2; index++) {
        const returned = await f.visit(url.host, url.pathname + url.search, { cookie });
        expect(returned.status).toBe(302);
        expect(returned.headers.get("location")).toBe(
          "https://radar.example.test/billing?from=shared"
        );
      }
      expect(f.synced.slice(baseline)).toEqual(["cus_one", "cus_one"]);
      expect(f.retrieved).toEqual([]);
      expect(f.portalCreates).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it("applies authorized per-Experience Portal overlays after static values without mutating concurrent requests", async () => {
    const seen: unknown[] = [];
    const overlay = async (context: { experience: { id: string }; source: unknown }) => {
      seen.push(context);
      return {
        configuration: `bpc_${context.experience.id}`,
        locale: "pl" as const,
        expand: ["context"],
        return_url: undefined,
        flow_data: {
          type: "subscription_update" as const,
          after_completion: {
            type: "hosted_confirmation" as const,
            hosted_confirmation: { custom_message: context.experience.id },
          },
        },
      };
    };
    const staticOverlay = {
      configuration: "bpc_static",
      locale: "auto" as const,
      expand: ["static"],
      flow_data: {
        type: "subscription_update" as const,
        subscription_update: { subscription: "sub_one" },
        after_completion: {
          type: "hosted_confirmation" as const,
          hosted_confirmation: { custom_message: "static" },
        },
      },
    };
    const f = await billingFixture({
      shared: true,
      libs: {
        billingPortalSessionCreate: staticOverlay,
        resolveBillingPortalSessionCreate: overlay,
      },
    });
    try {
      const cookie = await f.login("radar");
      const sessionId = await f.activate(cookie);
      const starts = await Promise.all(
        ["radar", "horeka", "partner"].map((id) =>
          f.visit("api.example.test", "/trpc/billing.startPortal", {
            cookie,
            origin: `https://${id}.example.test`,
            method: "POST",
            body: {},
          })
        )
      );
      expect(starts.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(seen).toHaveLength(3);
      for (const id of ["radar", "horeka", "partner"]) {
        expect(seen).toContainEqual(
          expect.objectContaining({
            experience: expect.objectContaining({ id }),
            environment: "sandbox",
            organization: { id: "org_one", currency: "usd", locale: "en_GB" },
            customerId: "cus_one",
            source: { kind: "browser", userId: "person", memberId: "member_one", sessionId },
          })
        );
        expect(f.portalCreates).toContainEqual(
          expect.objectContaining({
            configuration: `bpc_${id}`,
            locale: "pl",
            expand: ["context"],
            flow_data: {
              type: "subscription_update",
              subscription_update: { subscription: "sub_one" },
              after_completion: {
                type: "hosted_confirmation",
                hosted_confirmation: { custom_message: id },
              },
            },
            return_url: expect.stringContaining("https://api.example.test/stripe/portal/return?"),
          })
        );
      }
      expect(staticOverlay.flow_data.after_completion.hosted_confirmation.custom_message).toBe(
        "static"
      );
      expect(staticOverlay.expand).toEqual(["static"]);
    } finally {
      await f.close();
    }
  });

  it("rejects a malformed signed-flow schema with a plain 400 and no reconciliation", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      expect((await f.visit("radar.example.test", "/stripe/portal", { cookie })).status).toBe(302);
      const returned = new URL(f.portalCreates[0].return_url!);
      const flow = JSON.parse(
        Buffer.from(returned.searchParams.get("flow")!, "base64url").toString()
      );
      flow.v = 2;
      returned.searchParams.set("flow", Buffer.from(JSON.stringify(flow)).toString("base64url"));
      const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
      expect(done.status).toBe(400);
      expect(done.headers.get("location")).toBeNull();
      expect(f.synced).toEqual([]);
      expect(f.retrieved).toEqual([]);
      expect(await done.text()).not.toContain("Zod");
    } finally {
      await f.close();
    }
  });
  it.each([
    "member",
    "left",
    "closed",
    "external",
    "protocol-relative",
    "client-params",
    "alias",
    "wrong-origin",
  ])("rejects %s initiation before contextual or Stripe effects", async (failure) => {
    const overlay = jest.fn(() => ({ configuration: "bpc_allowed" }));
    const f = await billingFixture({ libs: { resolveBillingPortalSessionCreate: overlay } });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      if (failure === "member")
        await f.orm
          .update(billingSchema.members)
          .set({ role: "member" })
          .where(eq(billingSchema.members.id, "member_one"));
      if (failure === "left")
        await f.orm
          .update(billingSchema.members)
          .set({ deletedAt: new Date() })
          .where(eq(billingSchema.members.id, "member_one"));
      if (failure === "closed")
        await f.orm
          .update(billingSchema.organizations)
          .set({ closedAt: new Date() })
          .where(eq(billingSchema.organizations.id, "org_one"));
      const body =
        failure === "external"
          ? { returnPath: "https://evil.example/billing" }
          : failure === "protocol-relative"
            ? { returnPath: "//radar.example.test/billing" }
            : failure === "client-params"
              ? { configuration: "bpc_foreign", customer: "cus_two" }
              : {};
      const response =
        failure === "alias"
          ? await f.visit("alias-radar.example.test", "/stripe/portal", { cookie })
          : await f.visit("radar.example.test", "/trpc/billing.startPortal", {
              cookie,
              method: "POST",
              origin:
                failure === "wrong-origin"
                  ? "https://horeka.example.test"
                  : "https://radar.example.test",
              body,
            });
      expect(response.status).toBe(
        ["left", "closed"].includes(failure) ? 404 : failure === "member" ? 403 : 400
      );
      expect(overlay).not.toHaveBeenCalled();
      expect(f.portalCreates).toEqual([]);
      expect(f.synced).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("uses live Owner authority when cached role and Member fields are absent or stale", async () => {
    const overlay = jest.fn(() => ({}));
    const f = await billingFixture({ libs: { resolveBillingPortalSessionCreate: overlay } });
    try {
      const cookie = await f.login("radar");
      const session = await f.activate(cookie);
      await f.orm
        .update(billingSchema.sessions)
        .set({ activeOrganizationRole: "member", activeOrganizationMemberId: null })
        .where(eq(billingSchema.sessions.id, session));
      const start = await f.visit("radar.example.test", "/stripe/portal", { cookie });
      expect(start.status).toBe(302);
      expect(f.portalCreates).toHaveLength(1);
      expect(overlay).toHaveBeenCalledWith(
        expect.objectContaining({
          source: { kind: "browser", userId: "person", sessionId: session, memberId: "member_one" },
        })
      );
    } finally {
      await f.close();
    }
  });

  it.each([
    "active-organization",
    "session",
    "member",
    "member-identity",
    "left",
    "closed",
    "customer",
    "deleted-customer",
    "origin",
    "proof",
    "resource",
    "missing",
    "repeated",
    "purpose",
    "expired",
  ])("rejects %s on return without syncing any Customer", async (failure) => {
    const f = await billingFixture({ shared: true });
    let clock: jest.SpyInstance | undefined;
    try {
      let cookie = await f.login("radar");
      await f.activate(cookie);
      expect(
        (
          await f.visit("api.example.test", "/trpc/billing.startPortal", {
            cookie,
            origin: "https://radar.example.test",
            method: "POST",
            body: {},
          })
        ).status
      ).toBe(200);
      const url = new URL(f.portalCreates[0].return_url!);
      if (failure === "active-organization") await f.activate(cookie, "two");
      if (failure === "session") {
        cookie = await f.login("radar");
        await f.activate(cookie);
      }
      if (failure === "member")
        await f.orm
          .update(billingSchema.members)
          .set({ role: "member" })
          .where(eq(billingSchema.members.id, "member_one"));
      if (failure === "left")
        await f.orm
          .update(billingSchema.members)
          .set({ deletedAt: new Date() })
          .where(eq(billingSchema.members.id, "member_one"));
      if (failure === "closed")
        await f.orm
          .update(billingSchema.organizations)
          .set({ closedAt: new Date() })
          .where(eq(billingSchema.organizations.id, "org_one"));
      if (failure === "member-identity")
        await f.orm
          .update(billingSchema.members)
          .set({ id: "replacement_member" })
          .where(eq(billingSchema.members.id, "member_one"));
      if (failure === "customer")
        await f.orm
          .update(billingSchema.organizations)
          .set({ stripeSandboxCustomerId: "cus_replacement" })
          .where(eq(billingSchema.organizations.id, "org_one"));
      if (failure === "deleted-customer") f.customers.get("cus_one")!.deleted = true;
      if (failure === "proof")
        url.searchParams.set("experienceFlow", `${url.searchParams.get("experienceFlow")}x`);
      if (failure === "resource") {
        const flow = JSON.parse(Buffer.from(url.searchParams.get("flow")!, "base64url").toString());
        flow.organizationId = "org_two";
        url.searchParams.set("flow", Buffer.from(JSON.stringify(flow)).toString("base64url"));
      }
      if (failure === "missing") url.searchParams.delete("experienceFlow");
      if (failure === "repeated") url.searchParams.append("flow", url.searchParams.get("flow")!);
      if (failure === "purpose") url.pathname = "/stripe/cancel";
      if (failure === "expired") {
        const now = Date.now();
        clock = jest.spyOn(Date, "now").mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
      }
      const returned = await f.visit(url.host, url.pathname + url.search, {
        cookie,
        ...(failure === "origin" ? { origin: "https://horeka.example.test" } : {}),
      });
      expect(returned.status).toBe(["member", "left", "closed"].includes(failure) ? 403 : 400);
      expect(returned.headers.get("location")).toBeNull();
      expect(f.synced).toEqual([]);
      expect(f.retrieved).toEqual([]);
    } finally {
      clock?.mockRestore();
      await f.close();
    }
  });

  it("allows a bound no-Origin return only on its actual configured API pair", async () => {
    const f = await billingFixture({
      experiences: {
        ...experienceConfig,
        definitions: {
          ...experienceConfig.definitions,
          radar: { ...experienceConfig.definitions.radar, apiOrigin: "https://a-api.example.test" },
          horeka: {
            ...experienceConfig.definitions.horeka,
            apiOrigin: "https://bc-api.example.test",
          },
          partner: {
            ...experienceConfig.definitions.partner,
            apiOrigin: "https://bc-api.example.test",
          },
        },
      },
    });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      f.recordSubscription("cus_one");
      expect(
        (
          await f.visit("a-api.example.test", "/stripe/portal", {
            cookie,
            origin: "https://radar.example.test",
          })
        ).status
      ).toBe(302);
      const url = new URL(f.portalCreates[0].return_url!);
      const crossed = await f.visit("bc-api.example.test", url.pathname + url.search, { cookie });
      expect(crossed.status).toBe(400);
      expect(crossed.headers.get("location")).toBeNull();
      expect(f.synced).toEqual([]);
      const accepted = await f.visit("a-api.example.test", url.pathname + url.search, { cookie });
      expect(accepted.status).toBe(302);
      expect(accepted.headers.get("location")).toBe("https://radar.example.test/billing");
      expect(f.synced).toEqual(["cus_one"]);
    } finally {
      await f.close();
    }
  });

  it.each(["sync", "async"])(
    "returns Err for a %s contextual callback failure, including direct service calls",
    async (mode) => {
      const failure = () => {
        throw new Error("Contextual Portal unavailable");
      };
      const f = await billingFixture({
        libs: {
          resolveBillingPortalSessionCreate: mode === "sync" ? failure : async () => failure(),
        },
      });
      try {
        const cookie = await f.login("radar");
        const sessionId = await f.activate(cookie);
        expect((await f.visit("radar.example.test", "/stripe/portal", { cookie })).status).toBe(
          500
        );
        const result = await f.built.modules.billing.services.billing.createBillingPortalSession(
          {
            organizationId: "org_one",
            memberId: "member_one",
            organizationRole: "owner",
            email: "person@example.test",
          },
          {
            experience: f.built.config.app.experienceRegistry!.get("radar"),
            destination: "https://radar.example.test/billing",
            source: { kind: "browser", userId: "person", sessionId, memberId: "member_one" },
          }
        );
        expect(result.isErr()).toBe(true);
        expect(f.portalCreates).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );

  it.each(["standard-key", "no-runtime-key"])(
    "keeps unchanged shorthand Portal authoring and reconciliation with %s",
    async (mode) => {
      const f = await billingFixture({
        legacy: true,
        ...(mode === "no-runtime-key" ? { secret: null } : {}),
        libs: { billingPortalSessionCreate: { configuration: "bpc_legacy", locale: "auto" } },
      });
      try {
        const cookie = await f.login("radar");
        await f.activate(cookie);
        f.recordSubscription("cus_one");
        expect((await f.visit("radar.example.test", "/stripe/portal", { cookie })).status).toBe(
          302
        );
        expect(f.portalCreates[0]).toMatchObject({
          customer: "cus_one",
          configuration: "bpc_legacy",
          locale: "auto",
        });
        const url = new URL(f.portalCreates[0].return_url!);
        expect(url.pathname).toBe(
          mode === "standard-key" ? "/stripe/portal/return" : "/stripe/success"
        );
        const returned = await f.visit(url.host, url.pathname + url.search, { cookie });
        expect(returned.status).toBe(302);
        expect(returned.headers.get("location")).toBe("https://radar.example.test/billing");
        expect(f.synced).toEqual(["cus_one"]);
      } finally {
        await f.close();
      }
    }
  );

  it("keeps trusted Customer and return overrides unbounded while normal return sync stays bound to the original resource", async () => {
    const f = await billingFixture({
      libs: { billingPortalSessionCreate: { customer: "cus_two" } },
    });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      f.recordSubscription("cus_one");
      f.recordSubscription("cus_two");
      expect((await f.visit("radar.example.test", "/stripe/portal", { cookie })).status).toBe(302);
      expect(f.portalCreates[0].customer).toBe("cus_two");
      const url = new URL(f.portalCreates[0].return_url!);
      const returned = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(returned.status).toBe(302);
      expect(f.synced).toEqual(["cus_one"]);
    } finally {
      await f.close();
    }
    const custom = await billingFixture({
      libs: {
        billingPortalSessionCreate: { return_url: "https://trusted.example/return" },
        resolveBillingPortalSessionCreate: () => ({ return_url: "https://context.example/return" }),
      },
    });
    try {
      const cookie = await custom.login("radar");
      await custom.activate(cookie);
      expect((await custom.visit("radar.example.test", "/stripe/portal", { cookie })).status).toBe(
        302
      );
      expect(custom.portalCreates[0].return_url).toBe("https://context.example/return");
      expect(custom.synced).toEqual([]);
    } finally {
      await custom.close();
    }
  });
  it("rejects a validly signed different-environment return before Stripe reconciliation", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("radar");
      const sessionId = await f.activate(cookie);
      const registry = f.built.config.app.experienceRegistry!;
      const url = new URL(
        createPortalReturnUrl({
          flows: new ExperienceFlowSigner(registry, BILLING_SECRET),
          presentation: {
            experience: registry.get("radar"),
            destination: "https://radar.example.test/billing",
            source: { kind: "browser", userId: "person", sessionId, memberId: "member_one" },
          },
          organizationId: "org_one",
          customerId: "cus_one",
          environment: "production",
        })
      );
      const response = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(f.synced).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it.each(["missing", "foreign-user", "foreign-member", "external-destination", "missing-signer"])(
    "rejects strict direct %s presentation before Portal effects",
    async (failure) => {
      const f = await billingFixture();
      try {
        const registry = f.built.config.app.experienceRegistry!;
        const service =
          failure === "missing-signer"
            ? new BillingService(
                { billing: f.built.modules.billing.repositories.billing },
                { email: f.built.modules.email.services.email },
                defaultBillingGrants,
                { registry }
              )
            : f.built.modules.billing.services.billing;
        const presentation =
          failure === "missing"
            ? undefined
            : {
                experience: registry.get("radar"),
                destination:
                  failure === "external-destination"
                    ? "https://evil.example/billing"
                    : "https://radar.example.test/billing",
                source: {
                  kind: "browser" as const,
                  userId: failure === "foreign-user" ? "foreign-user" : "person",
                  memberId: failure === "foreign-member" ? "member_two" : "member_one",
                  sessionId: "trusted-server-session",
                },
              };
        const result = await service.createBillingPortalSession(
          {
            organizationId: "org_one",
            memberId: "member_one",
            organizationRole: "owner",
            email: "person@example.test",
          },
          presentation
        );
        expect(result.isErr()).toBe(true);
        expect(f.portalCreates).toEqual([]);
        expect(f.synced).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
});
