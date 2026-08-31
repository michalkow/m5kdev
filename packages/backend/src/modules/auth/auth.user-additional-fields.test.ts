import { createAuthUserAdditionalFields } from "./auth.user-additional-fields";

describe("createAuthUserAdditionalFields", () => {
  it("keeps stripeCustomerId and drops unused payment fields", () => {
    const fields = createAuthUserAdditionalFields();

    expect("stripeCustomerId" in fields).toBe(true);
    expect("paymentCustomerId" in fields).toBe(false);
    expect("paymentPlanTier" in fields).toBe(false);
    expect("paymentPlanExpiresAt" in fields).toBe(false);
  });
});
