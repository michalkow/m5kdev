import { billingFixture } from "../../../test/billing.fixtures";

const user = { id: "person", name: "Person", email: "person@example.test" };
describe("Named browser Billing operations", () => {
  it("identifies each denied start without requiring a fabricated Actor or creating external sessions", async () => {
    const f = await billingFixture();
    try {
      for (const [name, run] of [
        [
          "startCheckout",
          () =>
            f.billing.startCheckout(
              { priceId: "price_usd" },
              { user, experience: f.built.config.app.experienceRegistry!.get("radar") }
            ),
        ],
        [
          "startPortal",
          () =>
            f.billing.startPortal(
              {},
              { user, experience: f.built.config.app.experienceRegistry!.get("radar") }
            ),
        ],
      ] as const) {
        const result = await run();
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.code).toBe("FORBIDDEN");
          expect(result.error.context).toMatchObject({ procedure: name });
        }
      }
      expect(f.creates).toEqual([]);
      expect(f.portalCreates).toEqual([]);
    } finally {
      await f.close();
    }
  });
  it("identifies a denied raw legacy Checkout completion using its route-owned input kind", async () => {
    const f = await billingFixture({ legacy: true });
    try {
      const result = await f.billing.completeCheckout({ kind: "success" }, { user });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("FORBIDDEN");
        expect(result.error.context).toMatchObject({ procedure: "completeCheckout" });
      }
      expect(f.synced).toEqual([]);
      expect(f.retrieved).toEqual([]);
    } finally {
      await f.close();
    }
  });
});
