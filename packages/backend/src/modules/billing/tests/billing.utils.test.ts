import type { StripePlan, StripePlanPrice } from "@m5kdev/commons/modules/billing/billing.types";
import { findPlanPrice, resolveTrialDays } from "@m5kdev/commons/modules/billing/billing.utils";

const month: StripePlanPrice = {
  priceId: "price_month",
  interval: "month",
  intervalCount: 1,
  unitAmount: 14900,
  freeTrialDays: 14,
};

const quarter: StripePlanPrice = {
  priceId: "price_quarter",
  interval: "month",
  intervalCount: 3,
  unitAmount: 29800,
  freeTrialDays: 0,
};

const override: StripePlanPrice = {
  priceId: "price_override",
  interval: "month",
  intervalCount: 1,
  unitAmount: 14900,
  freeTrialDays: 30,
};

const noOverride: StripePlanPrice = {
  priceId: "price_plain",
  interval: "year",
  intervalCount: 1,
  unitAmount: 89400,
};

function planWith(prices: StripePlanPrice[], days?: number): StripePlan {
  return {
    name: "pro",
    products: {
      usd: {
        id: "prod_usd",
        defaultPriceId: prices[0]?.priceId,
        prices,
      },
    },
    ...(days != null ? { freeTrial: { days } } : {}),
  };
}

describe("findPlanPrice", () => {
  it("returns the Price with that id", () => {
    const plan = planWith([month, quarter], 14);
    expect(findPlanPrice({ plan, priceId: "price_quarter" })).toEqual(quarter);
  });

  it("returns undefined when the Price is missing", () => {
    expect(
      findPlanPrice({ plan: planWith([month], 14), priceId: "price_missing" })
    ).toBeUndefined();
  });
});

describe("resolveTrialDays", () => {
  it("lets Price freeTrialDays win over plan freeTrial.days", () => {
    expect(resolveTrialDays({ plan: planWith([override], 14), price: override })).toBe(30);
  });

  it("treats Price freeTrialDays 0 as no trial and does not fall through to plan days or fallbackDays", () => {
    const plan = planWith([quarter], 14);
    expect(resolveTrialDays({ plan, price: quarter })).toBeUndefined();
    expect(resolveTrialDays({ plan, price: quarter, fallbackDays: 7 })).toBeUndefined();
  });

  it("falls back to plan freeTrial.days when the Price omits freeTrialDays", () => {
    expect(resolveTrialDays({ plan: planWith([noOverride], 14), price: noOverride })).toBe(14);
  });

  it("returns fallbackDays only when neither Price nor Plan sets days", () => {
    const plan = planWith([noOverride]);
    expect(resolveTrialDays({ plan, price: noOverride })).toBeUndefined();
    expect(resolveTrialDays({ plan, price: noOverride, fallbackDays: 7 })).toBe(7);
  });

  it("falls back to plan days when the Price is missing", () => {
    const plan = planWith([month], 14);
    expect(resolveTrialDays({ plan })).toBe(14);
    expect(resolveTrialDays({ plan, fallbackDays: 7 })).toBe(14);
  });

  it("returns fallbackDays when the Price is missing and the Plan has no days", () => {
    const plan = planWith([month]);
    expect(resolveTrialDays({ plan })).toBeUndefined();
    expect(resolveTrialDays({ plan, fallbackDays: 7 })).toBe(7);
  });

  it("looks up the Price by priceId when price is omitted", () => {
    const plan = planWith([month, quarter], 14);
    expect(resolveTrialDays({ plan, priceId: "price_quarter" })).toBeUndefined();
    expect(resolveTrialDays({ plan, priceId: "price_month" })).toBe(14);
  });
});
