import { transformer } from "@m5kdev/commons/utils/trpc";
import { eq } from "drizzle-orm";
import {
  billingCatalog,
  billingFixture,
  billingQuery,
  billingSchema,
  readBillingTRPC,
} from "../../../test/billing.fixtures";

describe("Experience-bound Checkout HTTP flow", () => {
  it("reconciles the actual Checkout for its original Owner before returning to the entered product", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("horeka");
      await f.activate(cookie);
      const start = await f.visit(
        "horeka.example.test",
        "/stripe/checkout/price_usd?returnPath=%2Fsettings%3Ftab%3Dbilling",
        { cookie }
      );
      expect(start.status).toBe(302);
      expect(start.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
      expect(f.creates[0].success_url).toContain("https://horeka.example.test/stripe/success?");
      expect(f.creates[0].success_url).toContain("checkoutSessionId={CHECKOUT_SESSION_ID}");
      const returned = new URL(f.complete());
      const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe("https://horeka.example.test/settings?tab=billing");
      expect(f.retrieved).toEqual(["cs_test_1"]);
      const subscription = await f.visit(
        "horeka.example.test",
        billingQuery("getActiveSubscription"),
        { cookie }
      );
      expect(subscription.status).toBe(200);
      expect(await readBillingTRPC(subscription)).toMatchObject({
        plan: "pro",
        status: "active",
        referenceId: "org_one",
        environment: "sandbox",
      });
    } finally {
      await f.close();
    }
  });
  it("starts through the real organizationProcedure browser POST on a shared canonical API", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const cookie = await f.login("horeka");
      await f.activate(cookie);
      const start = await f.visit("api.example.test", "/trpc/billing.startCheckout", {
        cookie,
        origin: "https://horeka.example.test",
        method: "POST",
        body: { priceId: "price_usd", returnPath: "/billing?from=shared" },
      });
      expect(start.status).toBe(200);
      const body = await start.json();
      expect(transformer.deserialize(body[0].result.data)).toEqual({
        url: "https://checkout.stripe.com/c/pay/cs_test_1",
      });
      expect(f.creates[0].success_url).toContain("https://api.example.test/stripe/success?");
      const done = new URL(f.complete());
      const returned = await f.visit(done.host, done.pathname + done.search, { cookie });
      expect(returned.status).toBe(302);
      expect(returned.headers.get("location")).toBe(
        "https://horeka.example.test/billing?from=shared"
      );
    } finally {
      await f.close();
    }
  });
  it("applies authorized contextual presentation after static overlays using effective Trial and Seat values without cross-brand mutation", async () => {
    const seen: unknown[] = [];
    const staticOverlay = {
      metadata: { staticKey: "static", leaf: "static" },
      subscription_data: { metadata: { staticSub: "kept" } },
      line_items: [{ price: "static-price", quantity: 9 }],
      custom_text: { after_submit: { message: "static" } },
      branding_settings: { display_name: "Static Brand" },
    };
    const contextual = async (context: { experience: { id: string; brand: { name: string } } }) => {
      seen.push(context);
      return {
        metadata: { leaf: context.experience.id },
        subscription_data: { metadata: { contextSub: context.experience.id } },
        line_items: [{ price: "context-price", quantity: 3 }],
        custom_text: { after_submit: null },
        branding_settings: { display_name: context.experience.brand.name },
        success_url: undefined,
      };
    };
    const catalog = {
      ...billingCatalog,
      seatBilling: true,
      trialRequiresPaymentMethod: true,
      trialPlanName: { usd: "pro" },
      plans: [{ ...billingCatalog.plans[0], freeTrial: { days: 7, seats: 5 } }],
    };
    const f = await billingFixture({
      shared: true,
      catalog,
      libs: {
        checkoutSessionCreate: staticOverlay,
        ...{ resolveCheckoutSessionCreate: contextual },
      },
    });
    try {
      await f.orm.insert(billingSchema.members).values({
        id: "pending",
        organizationId: "org_one",
        email: "pending@example.test",
        role: "member",
      });
      const cookie = await f.login("radar");
      await f.activate(cookie);
      for (const id of ["horeka", "radar"]) {
        const start = await f.visit("api.example.test", "/trpc/billing.startCheckout", {
          cookie,
          origin: `https://${id}.example.test`,
          method: "POST",
          body: { priceId: "price_usd" },
        });
        expect(start.status).toBe(200);
      }
      expect(seen).toEqual([
        expect.objectContaining({
          experience: expect.objectContaining({ id: "horeka" }),
          environment: "sandbox",
          organization: { id: "org_one", currency: "usd", locale: "en_GB" },
          customerId: "cus_one",
          source: {
            kind: "browser",
            userId: "person",
            sessionId: expect.any(String),
            memberId: "member_one",
          },
          checkout: { priceId: "price_usd", quantity: 2, trialDays: 7, collectPaymentMethod: true },
        }),
        expect.objectContaining({ experience: expect.objectContaining({ id: "radar" }) }),
      ]);
      expect(f.creates.map((p) => p.branding_settings?.display_name)).toEqual([
        "Horeka AI",
        "Gastro Raider",
      ]);
      expect(f.creates[0]).toMatchObject({
        line_items: [{ price: "context-price", quantity: 3 }],
        metadata: {
          organizationId: "org_one",
          memberId: "member_one",
          staticKey: "static",
          leaf: "horeka",
        },
        subscription_data: {
          metadata: {
            organizationId: "org_one",
            memberId: "member_one",
            staticSub: "kept",
            contextSub: "horeka",
          },
          trial_period_days: 7,
        },
        custom_text: { after_submit: null },
      });
      expect(f.creates[0].success_url).toContain("checkoutSessionId={CHECKOUT_SESSION_ID}");
      expect(staticOverlay.metadata.leaf).toBe("static");
      expect(staticOverlay.custom_text.after_submit.message).toBe("static");
    } finally {
      await f.close();
    }
  });
  it("automatically signs new shorthand Checkout from its existing stable Auth secret", async () => {
    const f = await billingFixture({ legacy: true });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      const start = await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
      expect(start.status).toBe(302);
      expect(f.creates[0].success_url).toContain("experienceFlow=");
      const recovery = await f.visit("radar.example.test", "/api/auth/request-password-reset", {
        method: "POST",
        origin: "https://radar.example.test",
        body: {
          email: "person@example.test",
          redirectTo: "https://radar.example.test/reset-password",
        },
      });
      expect(recovery.status).toBe(200);
      const stored = await f.built.modules.email.services.email.findLatestStoredEmail({
        to: "person@example.test",
      });
      expect(stored?.props.url).toContain("/api/auth/reset-password/");
      expect(stored?.props.url).not.toContain("experienceFlow");
      const done = new URL(f.complete());
      expect(
        (await f.visit(done.host, done.pathname + done.search, { cookie })).headers.get("location")
      ).toBe("https://radar.example.test/billing");
    } finally {
      await f.close();
    }
  });
  it.each([null, "short-auth-secret"])(
    "keeps existing shorthand boot/Checkout and raw reconciliation compatible with Auth key %s",
    async (secret) => {
      const f = await billingFixture({ legacy: true, secret });
      try {
        const cookie = await f.login("radar");
        await f.activate(cookie);
        const start = await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
        expect(start.status).toBe(302);
        expect(f.creates[0].success_url).toBe("https://radar.example.test/stripe/success");
        f.complete();
        const done = await f.visit("radar.example.test", "/stripe/success", { cookie });
        expect(done.status).toBe(302);
        expect(done.headers.get("location")).toBe("https://radar.example.test/billing");
        expect(f.retrieved).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
  it.each(["member", "removed", "closed"])(
    "rechecks live Owner authority for legacy HTTP start after cached Owner became %s",
    async (change) => {
      const f = await billingFixture();
      try {
        const cookie = await f.login("radar");
        await f.activate(cookie);
        if (change === "closed")
          await f.orm
            .update(billingSchema.organizations)
            .set({ closedAt: new Date() })
            .where(eq(billingSchema.organizations.id, "org_one"));
        else
          await f.orm
            .update(billingSchema.members)
            .set(change === "removed" ? { deletedAt: new Date() } : { role: "member" })
            .where(eq(billingSchema.members.id, "member_one"));
        const start = await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
        expect(start.status).toBe(403);
        expect(start.headers.get("location")).toBeNull();
        expect(f.creates).toEqual([]);
        expect(f.synced).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
  it.each(["member", "removed", "closed", "session", "organization", "customer"])(
    "rejects return after original %s context changed without syncing a different Organization",
    async (change) => {
      const f = await billingFixture({ shared: true });
      try {
        let cookie = await f.login("radar");
        await f.activate(cookie);
        expect(
          (
            await f.visit("api.example.test", "/stripe/checkout/price_usd", {
              cookie,
              origin: "https://radar.example.test",
            })
          ).status
        ).toBe(302);
        const returned = new URL(f.complete());
        const baseline = [...f.synced];
        if (change === "member" || change === "removed")
          await f.orm
            .update(billingSchema.members)
            .set(change === "removed" ? { deletedAt: new Date() } : { role: "member" })
            .where(eq(billingSchema.members.id, "member_one"));
        if (change === "closed")
          await f.orm
            .update(billingSchema.organizations)
            .set({ closedAt: new Date() })
            .where(eq(billingSchema.organizations.id, "org_one"));
        if (change === "session") {
          cookie = await f.login("radar");
          await f.activate(cookie);
        }
        if (change === "organization") await f.activate(cookie, "two");
        if (change === "customer")
          await f.orm
            .update(billingSchema.organizations)
            .set({ stripeSandboxCustomerId: "cus_replaced" })
            .where(eq(billingSchema.organizations.id, "org_one"));
        const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
        expect([400, 403]).toContain(done.status);
        expect(done.headers.get("location")).toBeNull();
        expect(f.synced).toEqual(baseline);
        expect(f.retrieved).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
  it.each(["open", "expired", "nonce", "version", "customer", "livemode"])(
    "rejects authoritative Stripe Checkout mismatch: %s",
    async (change) => {
      const f = await billingFixture();
      try {
        const cookie = await f.login("radar");
        await f.activate(cookie);
        await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
        const returned = new URL(f.complete());
        const actual = f.sessions.get("cs_test_1")!;
        if (change === "open" || change === "expired") actual.status = change;
        if (change === "nonce") actual.metadata!.m5kdevCheckoutNonce = "another-nonce";
        if (change === "version") actual.metadata!.m5kdevCheckoutFlow = "future";
        if (change === "customer") actual.customer = "cus_two";
        if (change === "livemode") actual.livemode = true;
        if (change === "deadline") actual.expires_at = Math.floor(Date.now() / 1000) - 1;
        const baseline = [...f.synced];
        const done = await f.visit(returned.host, returned.pathname + returned.search, { cookie });
        expect(done.status).toBe(400);
        expect(done.headers.get("location")).toBeNull();
        expect(f.synced).toEqual(baseline);
      } finally {
        await f.close();
      }
    }
  );
  it("validates cancellation for its bound brand and performs navigation without reconciliation", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const cookie = await f.login("horeka");
      await f.activate(cookie);
      await f.visit(
        "api.example.test",
        "/stripe/checkout/price_usd?returnPath=%2Fsettings%3Ffrom%3Dcancel",
        { cookie, origin: "https://horeka.example.test" }
      );
      const baseline = [...f.synced];
      const url = new URL(String(f.creates[0].cancel_url));
      const done = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe("https://horeka.example.test/settings?from=cancel");
      expect(f.retrieved).toEqual([]);
      expect(f.synced).toEqual(baseline);
      url.pathname = "/stripe/success";
      expect((await f.visit(url.host, url.pathname + url.search, { cookie })).status).toBe(400);
    } finally {
      await f.close();
    }
  });
  it("keeps interleaved A/B and alternate-brand Checkout returns bound across shared-API browser sessions", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const first = await f.login("radar");
      await f.activate(first);
      const second = await f.login("horeka");
      await f.activate(second, "two");
      for (const [id, cookie] of [
        ["radar", first],
        ["horeka", second],
        ["partner", first],
      ])
        expect(
          (
            await f.visit(
              "api.example.test",
              "/stripe/checkout/price_usd?returnPath=%2Fbilling%3Fjourney%3Dcheckout",
              { cookie, origin: `https://${id}.example.test` }
            )
          ).status
        ).toBe(302);
      const urls = [0, 1, 2].map((i) => new URL(f.complete(i)));
      for (const [index, id, cookie] of [
        [2, "partner", first],
        [1, "horeka", second],
        [0, "radar", first],
      ] as const) {
        const url = urls[index];
        const response = await f.visit(url.host, url.pathname + url.search, { cookie });
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
          `https://${id}.example.test/billing?journey=checkout`
        );
      }
      expect(f.retrieved).toEqual(["cs_test_3", "cs_test_2", "cs_test_1"]);
      const repeat = await f.visit(urls[0].host, urls[0].pathname + urls[0].search, {
        cookie: first,
      });
      expect(repeat.status).toBe(302);
      const firstSubscription = await f.visit(
        "api.example.test",
        billingQuery("getActiveSubscription"),
        { cookie: first }
      );
      const secondSubscription = await f.visit(
        "api.example.test",
        billingQuery("getActiveSubscription"),
        { cookie: second }
      );
      expect(await readBillingTRPC(firstSubscription)).toMatchObject({
        referenceId: "org_one",
        status: "active",
      });
      expect(await readBillingTRPC(secondSubscription)).toMatchObject({
        referenceId: "org_two",
        status: "active",
      });
    } finally {
      await f.close();
    }
  });
  it("rejects altered proof/envelope, cross-Checkout Session and conflicting Origin before any Subscription effect", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      for (const id of ["radar", "horeka"])
        await f.visit("api.example.test", "/stripe/checkout/price_usd", {
          cookie,
          origin: `https://${id}.example.test`,
        });
      const url = new URL(f.complete(0));
      f.complete(1);
      const baseline = [...f.synced];
      const variants = [new URL(url), new URL(url), new URL(url), new URL(url), new URL(url)];
      variants[0].searchParams.set("checkoutSessionId", "cs_test_2");
      variants[1].searchParams.set(
        "experienceFlow",
        String(variants[1].searchParams.get("experienceFlow")) + "."
      );
      const envelope = JSON.parse(
        Buffer.from(String(variants[2].searchParams.get("flow")), "base64url").toString()
      );
      envelope.organizationId = "org_two";
      variants[2].searchParams.set(
        "flow",
        Buffer.from(JSON.stringify(envelope)).toString("base64url")
      );
      variants[3].searchParams.append("checkoutSessionId", "cs_test_1");
      variants[4].searchParams.delete("experienceFlow");
      for (const altered of variants) {
        const response = await f.visit(altered.host, altered.pathname + altered.search, { cookie });
        expect(response.status).toBe(400);
        expect(response.headers.get("location")).toBeNull();
      }
      const conflict = await f.visit(url.host, url.pathname + url.search, {
        cookie,
        origin: "https://horeka.example.test",
      });
      expect(conflict.status).toBe(400);
      expect(conflict.headers.get("location")).toBeNull();
      expect(f.synced).toEqual(baseline);
      expect((await f.visit(url.host, url.pathname + url.search, { cookie })).status).toBe(302);
    } finally {
      await f.close();
    }
  });
  it("rejects expired proof and strict raw returns while preserving authoritative webhook reconciliation", async () => {
    const f = await billingFixture();
    let time: jest.SpyInstance | undefined;
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
      const url = new URL(f.complete());
      const baseline = [...f.synced];
      time = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
      const expired = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(expired.status).toBe(400);
      expect(expired.headers.get("location")).toBeNull();
      time.mockRestore();
      time = undefined;
      expect((await f.visit("radar.example.test", "/stripe/success", { cookie })).status).toBe(400);
      expect(f.synced).toEqual(baseline);
      const synced = await f.built.modules.billing.services.billing.processEvent({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: { object: { customer: "cus_one" } },
      } as never);
      expect(synced.isOk()).toBe(true);
      const subscription = await f.visit(
        "radar.example.test",
        billingQuery("getActiveSubscription"),
        { cookie }
      );
      expect(await readBillingTRPC(subscription)).toMatchObject({
        referenceId: "org_one",
        status: "active",
      });
    } finally {
      time?.mockRestore();
      await f.close();
    }
  });
  it("rejects browser Stripe overrides, external returns and a named non-active Organization before Stripe creation", async () => {
    const f = await billingFixture({ shared: true });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      for (const body of [
        { priceId: "price_usd", customer: "cus_two" },
        { priceId: "price_usd", success_url: "https://evil.test" },
        { priceId: "price_usd", experience: "horeka" },
        { priceId: "price_usd", returnPath: "https://evil.test" },
        { priceId: "price_usd", returnPath: " //radar.example.test/billing" },
        { priceId: "price_usd", organizationId: "org_two" },
      ]) {
        const response = await f.visit("api.example.test", "/trpc/billing.startCheckout", {
          cookie,
          origin: "https://radar.example.test",
          method: "POST",
          body,
        });
        expect([400, 403]).toContain(response.status);
      }
      expect(
        (await f.visit("api.example.test", "/stripe/checkout/price_usd", { cookie })).status
      ).toBe(400);
      expect(f.creates).toEqual([]);
      expect(f.synced).toEqual([]);
    } finally {
      await f.close();
    }
  });
  it("keeps shorthand raw reconciliation fresh-Owner only and never downgrades partial signed inputs", async () => {
    const f = await billingFixture({ legacy: true });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      for (const query of [
        "flow=x",
        "experienceFlow=x",
        "checkoutSessionId=cs_unknown",
        "flow=&experienceFlow=",
      ]) {
        expect(
          (await f.visit("radar.example.test", `/stripe/success?${query}`, { cookie })).status
        ).toBe(400);
      }
      await f.orm
        .update(billingSchema.members)
        .set({ role: "member" })
        .where(eq(billingSchema.members.id, "member_one"));
      expect((await f.visit("radar.example.test", "/stripe/success", { cookie })).status).toBe(403);
      expect(f.synced).toEqual([]);
    } finally {
      await f.close();
    }
  });
  it("retains explicit custom app success/customer/line-items overrides while webhook reconciliation stays authoritative", async () => {
    const f = await billingFixture({
      legacy: true,
      libs: {
        checkoutSessionCreate: {
          success_url: "https://app-owned.example.test/custom",
          customer: "cus_two",
          line_items: [{ price: "app-owned-price", quantity: 8 }],
          metadata: { organizationId: "app-owned-value" },
        },
      },
    });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      expect(
        (await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie })).status
      ).toBe(302);
      expect(f.creates[0]).toMatchObject({
        success_url: "https://app-owned.example.test/custom",
        customer: "cus_two",
        line_items: [{ price: "app-owned-price", quantity: 8 }],
        metadata: { organizationId: "app-owned-value" },
      });
      f.complete();
      expect(
        (
          await f.built.modules.billing.services.billing.processEvent({
            id: "evt_custom",
            type: "checkout.session.completed",
            data: { object: { customer: "cus_two" } },
          } as never)
        ).isOk()
      ).toBe(true);
      const otherCookie = await f.login("radar");
      await f.activate(otherCookie, "two");
      const subscription = await f.visit(
        "radar.example.test",
        billingQuery("getActiveSubscription"),
        { cookie: otherCookie }
      );
      expect(await readBillingTRPC(subscription)).toMatchObject({
        referenceId: "org_two",
        status: "active",
      });
    } finally {
      await f.close();
    }
  });
  it("rejects a real host-only alias start while canonical authenticated initiation remains supported", async () => {
    const f = await billingFixture();
    try {
      const signed = await f.visit("alias-radar.example.test", "/api/auth/sign-in/email", {
        method: "POST",
        origin: "https://alias-radar.example.test",
        body: { email: "person@example.test", password: "Original-Password-123" },
      });
      expect(signed.status).toBe(200);
      expect(signed.headers.get("set-cookie")).not.toContain("Domain=");
      const cookie = signed.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      await f.activate(cookie);
      const rejected = await f.visit("alias-radar.example.test", "/stripe/checkout/price_usd", {
        cookie,
      });
      expect(rejected.status).toBe(400);
      expect(rejected.headers.get("location")).toBeNull();
      expect(f.creates).toEqual([]);
      const canonicalCookie = await f.login("radar");
      await f.activate(canonicalCookie);
      expect(
        (
          await f.visit("radar.example.test", "/stripe/checkout/price_usd", {
            cookie: canonicalCookie,
          })
        ).status
      ).toBe(302);
    } finally {
      await f.close();
    }
  });
  it("fails strict invalid signing configuration at the composition boundary", async () => {
    await expect(billingFixture({ secret: "short-auth-secret" })).rejects.toThrow();
  });
  it("does not trust app-overridden correlation metadata while retaining the app override", async () => {
    const f = await billingFixture({
      libs: { checkoutSessionCreate: { metadata: { m5kdevCheckoutNonce: "app-override" } } },
    });
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
      expect(f.creates[0].metadata?.m5kdevCheckoutNonce).toBe("app-override");
      const url = new URL(f.complete());
      const baseline = [...f.synced];
      const done = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(done.status).toBe(400);
      expect(done.headers.get("location")).toBeNull();
      expect(f.synced).toEqual(baseline);
    } finally {
      await f.close();
    }
  });
  it("resolves the live Owner for a browser session without cached Member or role fields", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("radar");
      const sessionId = await f.activate(cookie);
      await f.orm
        .update(billingSchema.sessions)
        .set({ activeOrganizationMemberId: null, activeOrganizationRole: null })
        .where(eq(billingSchema.sessions.id, sessionId));
      const start = await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
      expect(start.status).toBe(302);
      expect(f.creates[0].metadata).toMatchObject({
        memberId: "member_one",
        organizationId: "org_one",
      });
    } finally {
      await f.close();
    }
  });
  it("accepts a completed Checkout after its original open-session deadline while the signed return is valid", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      await f.visit("radar.example.test", "/stripe/checkout/price_usd", { cookie });
      const url = new URL(f.complete());
      f.sessions.get("cs_test_1")!.expires_at = Math.floor(Date.now() / 1000) - 1;
      const done = await f.visit(url.host, url.pathname + url.search, { cookie });
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe("https://radar.example.test/billing");
      const subscription = await f.visit(
        "radar.example.test",
        billingQuery("getActiveSubscription"),
        { cookie }
      );
      expect(await readBillingTRPC(subscription)).toMatchObject({
        status: "active",
        referenceId: "org_one",
      });
    } finally {
      await f.close();
    }
  });
  it.each(["sync", "async"])(
    "returns a Result failure for a %s contextual hook error through direct service composition",
    async (mode) => {
      const resolver =
        mode === "sync"
          ? () => {
              throw new Error("Test contextual failure");
            }
          : async () => {
              throw new Error("Test contextual failure");
            };
      const f = await billingFixture({ libs: { resolveCheckoutSessionCreate: resolver } });
      try {
        const result = await f.built.modules.billing.services.billing.createCheckoutSession(
          { priceId: "price_usd" },
          {
            organizationId: "org_one",
            memberId: "member_one",
            organizationRole: "owner",
            email: "person@example.test",
          },
          {
            experience: f.built.config.app.experienceRegistry!.get("radar"),
            destination: "https://radar.example.test/billing",
            userId: "person",
            sessionId: "explicit-server-session",
          }
        );
        expect(result.isErr()).toBe(true);
        expect(f.creates).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
  it.each(["missing", "foreign-user", "external-destination"])(
    "validates explicit strict direct-service presentation before Stripe effects: %s",
    async (change) => {
      const f = await billingFixture();
      try {
        const presentation =
          change === "missing"
            ? undefined
            : {
                experience: f.built.config.app.experienceRegistry!.get("radar"),
                destination:
                  change === "external-destination"
                    ? "https://evil.test/billing"
                    : "https://radar.example.test/billing",
                userId: change === "foreign-user" ? "different-user" : "person",
                sessionId: "explicit-server-session",
              };
        const result = await f.built.modules.billing.services.billing.createCheckoutSession(
          { priceId: "price_usd" },
          {
            organizationId: "org_one",
            memberId: "member_one",
            organizationRole: "owner",
            email: "person@example.test",
          },
          presentation
        );
        expect(result.isErr()).toBe(true);
        expect(f.creates).toEqual([]);
        expect(f.synced).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
});

describe("Unsigned shorthand custom billing destinations", () => {
  it.each(["checkout", "portal"])(
    "rejects custom %s returnPath before a Stripe Session is created",
    async (operation) => {
      const f = await billingFixture({ legacy: true, secret: null });
      try {
        const cookie = await f.login("radar");
        await f.activate(cookie);
        const route = operation === "checkout" ? "/stripe/checkout/price_usd" : "/stripe/portal";
        const result = await f.visit(
          "radar.example.test",
          `${route}?returnPath=%2Fsettings%3Ftab%3Dbilling`,
          { cookie }
        );
        expect(result.status).toBe(400);
        expect(await result.json()).toMatchObject({
          message: "Custom billing return paths require flow signing to be configured",
        });
        expect(f.creates).toEqual([]);
        expect(f.portalCreates).toEqual([]);
      } finally {
        await f.close();
      }
    }
  );
});
