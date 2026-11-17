import { transformer } from "@m5kdev/commons/utils/trpc";
import { billingFixture, billingQuery } from "../../../test/billing.fixtures";

describe("Private billing transport", () => {
  it("marks actual Organization Entitlement, Subscription, batch and error responses private and uncached", async () => {
    const f = await billingFixture();
    try {
      const cookie = await f.login("radar");
      await f.activate(cookie);
      const batchInput = encodeURIComponent(
        JSON.stringify({
          "0": transformer.serialize({}),
          "1": transformer.serialize({}),
        })
      );
      const paths = [
        billingQuery("getEntitlements"),
        billingQuery("getActiveSubscription"),
        `/trpc/billing.getEntitlements,billing.getActiveSubscription?batch=1&input=${batchInput}`,
        `/trpc/billing.getEntitlements?input=${encodeURIComponent(JSON.stringify(transformer.serialize({ organizationId: "unowned" })))}`,
      ];
      for (const [index, path] of paths.entries()) {
        const response = await f.visit("radar.example.test", path, { cookie });
        expect(response.status).toBe(index === 3 ? 404 : 200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    } finally {
      await f.close();
    }
  });
});
