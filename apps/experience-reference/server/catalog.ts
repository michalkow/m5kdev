import {
  type BooleanCapability,
  booleanCapability,
  defineBundles,
  defineCapabilities,
} from "@m5kdev/commons/modules/billing/billing.entitlements";
import type { ResolvedStripePlans } from "@m5kdev/commons/modules/billing/billing.types";
export const catalog: ResolvedStripePlans = {
  environment: "sandbox",
  defaultCurrency: "usd",
  trialPlanName: {},
  trialRequiresPaymentMethod: false,
  seatBilling: false,
  nonBillableRoleKeys: [],
  entitlements: defineBundles(
    defineCapabilities<Record<string, BooleanCapability>>({
      "reports.publish": booleanCapability(),
      "assistant.use": booleanCapability(),
    }),
    { "reports@1": ["reports.publish"], "assistant@1": ["assistant.use"] }
  ),
  plans: [
    {
      name: "Reports",
      bundles: ["reports@1"],
      products: {
        usd: {
          id: "prod_reports",
          defaultPriceId: "price_reports",
          prices: [
            { priceId: "price_reports", interval: "month", intervalCount: 1, unitAmount: 1000 },
          ],
        },
      },
    },
    {
      name: "Combined",
      bundles: ["reports@1", "assistant@1"],
      products: {
        usd: {
          id: "prod_combined",
          defaultPriceId: "price_combined",
          prices: [
            { priceId: "price_combined", interval: "month", intervalCount: 1, unitAmount: 2000 },
          ],
        },
      },
    },
  ],
};
