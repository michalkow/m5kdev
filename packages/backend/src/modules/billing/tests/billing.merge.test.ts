import { mergeSessionCreateParams } from "../billing.merge";

describe("mergeSessionCreateParams", () => {
  it("returns a copy of defaults when overlay is omitted", () => {
    const defaults = { mode: "subscription", metadata: { organizationId: "org" } };
    const merged = mergeSessionCreateParams(defaults);
    expect(merged).toEqual(defaults);
    expect(merged).not.toBe(defaults);
  });

  it("deep-merges nested objects and keeps Kernel keys", () => {
    const merged = mergeSessionCreateParams(
      {
        metadata: { organizationId: "org", memberId: "mem" },
        subscription_data: {
          metadata: { organizationId: "org" },
          trial_period_days: 7,
        },
      },
      {
        metadata: { campaign: "spring" },
        subscription_data: {
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        },
        tax_id_collection: { enabled: true, required: "if_supported" },
      }
    );

    expect(merged).toEqual({
      metadata: { organizationId: "org", memberId: "mem", campaign: "spring" },
      subscription_data: {
        metadata: { organizationId: "org" },
        trial_period_days: 7,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      },
      tax_id_collection: { enabled: true, required: "if_supported" },
    });
  });

  it("lets the overlay win a nested leaf", () => {
    const merged = mergeSessionCreateParams(
      { metadata: { organizationId: "org" } },
      { metadata: { organizationId: "other" } }
    );
    expect(merged.metadata).toEqual({ organizationId: "other" });
  });

  it("replaces arrays instead of merging by index", () => {
    const merged = mergeSessionCreateParams(
      { line_items: [{ price: "price_kernel", quantity: 2 }] },
      { line_items: [{ price: "price_app", quantity: 1 }] }
    );
    expect(merged.line_items).toEqual([{ price: "price_app", quantity: 1 }]);
  });

  it("skips undefined overlay keys and assigns null", () => {
    const merged = mergeSessionCreateParams(
      {
        success_url: "https://kernel.example/success",
        cancel_url: "https://kernel.example/cancel",
      },
      { success_url: undefined, cancel_url: null }
    );
    expect(merged.success_url).toBe("https://kernel.example/success");
    expect(merged.cancel_url).toBeNull();
  });

  it("does not mutate defaults or overlay", () => {
    const defaults = { metadata: { organizationId: "org" } };
    const overlay = { metadata: { campaign: "x" } };
    mergeSessionCreateParams(defaults, overlay);
    expect(defaults).toEqual({ metadata: { organizationId: "org" } });
    expect(overlay).toEqual({ metadata: { campaign: "x" } });
  });
});
