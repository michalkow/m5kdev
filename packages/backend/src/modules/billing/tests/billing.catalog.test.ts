import {
  booleanCapability,
  composeCapabilities,
  defineBundles,
  defineCapabilities,
  unknownCapabilities,
} from "@m5kdev/commons/modules/billing/billing.entitlements";
import type { StripePlan, StripePlansConfig } from "@m5kdev/commons/modules/billing/billing.types";
import {
  assertEntitlementCatalog,
  capabilitiesOfPlan,
  getEnvironmentPlans,
} from "@m5kdev/commons/modules/billing/billing.utils";

const capabilities = composeCapabilities(
  defineCapabilities({
    "resources.analyze": booleanCapability(),
  }),
  defineCapabilities({
    "apps.typeorb": booleanCapability(),
    "typeorb.publish": booleanCapability(),
  })
);

const entitlements = defineBundles(capabilities, {
  "brain@1": ["resources.analyze"],
  "typeorb@1": ["apps.typeorb", "typeorb.publish", "resources.analyze"],
});

function plan(bundles?: readonly string[]): StripePlan {
  return {
    name: "pro",
    products: {
      usd: {
        id: "prod_usd",
        prices: [{ priceId: "price_usd", interval: "month", intervalCount: 1, unitAmount: 1000 }],
      },
    },
    ...(bundles ? { bundles } : {}),
  };
}

function plansConfig(overrides: Partial<StripePlansConfig> = {}): StripePlansConfig {
  return {
    defaultCurrency: "usd",
    entitlements,
    production: [plan(["typeorb@1"])],
    sandbox: [plan(["brain@1"])],
    ...overrides,
  };
}

describe("Billing Entitlement catalog", () => {
  it("throws when composing duplicate Capability keys", () => {
    expect(() =>
      composeCapabilities(
        defineCapabilities({ "resources.analyze": booleanCapability() }),
        defineCapabilities({ "resources.analyze": booleanCapability() })
      )
    ).toThrow("Duplicate Capability resources.analyze");
  });

  it("throws when a Bundle names an unknown Capability", () => {
    expect(() =>
      defineBundles(defineCapabilities({ "apps.typeorb": booleanCapability() }), {
        "typeorb@1": ["typeorb.publish"],
      })
    ).toThrow("Bundle typeorb@1 names unknown Capability typeorb.publish");
  });

  it("fails catalog resolve when production names an unknown Bundle even if sandbox is valid", () => {
    expect(() =>
      getEnvironmentPlans(
        plansConfig({ production: [plan(["missing@1"])], sandbox: [plan(["brain@1"])] }),
        "sandbox"
      )
    ).toThrow("Plan pro names unknown Bundle missing@1");
  });

  it("fails catalog resolve when sandbox names an unknown Bundle even if production is valid", () => {
    expect(() =>
      getEnvironmentPlans(
        plansConfig({ production: [plan(["typeorb@1"])], sandbox: [plan(["missing@1"])] }),
        "production"
      )
    ).toThrow("Plan pro names unknown Bundle missing@1");
  });

  it("copies both environment Plan lists onto the resolved catalog", () => {
    const resolved = getEnvironmentPlans(plansConfig(), "sandbox");
    expect(resolved.environment).toBe("sandbox");
    expect(resolved.plans[0]?.bundles).toEqual(["brain@1"]);
    expect(resolved.productionPlans?.[0]?.bundles).toEqual(["typeorb@1"]);
    expect(resolved.sandboxPlans?.[0]?.bundles).toEqual(["brain@1"]);
  });

  it("treats an omitted Plan bundles list as no contribution", () => {
    expect(capabilitiesOfPlan({ plan: plan(), entitlements })).toEqual([]);
  });

  it("unions Capabilities from the Plan's Bundles", () => {
    expect(capabilitiesOfPlan({ plan: plan(["typeorb@1"]), entitlements }).sort()).toEqual([
      "apps.typeorb",
      "resources.analyze",
      "typeorb.publish",
    ]);
  });

  it("lists requested keys missing from a snapshot catalog", () => {
    expect(
      unknownCapabilities({ "apps.typeorb": { allowed: true } }, ["apps.typeorb", "apps.knowledge"])
    ).toEqual(["apps.knowledge"]);
  });

  it("re-composes catalog Capabilities at assert so duplicate fragments cannot boot", () => {
    expect(() =>
      assertEntitlementCatalog({
        production: [plan(["typeorb@1"])],
        sandbox: [plan(["brain@1"])],
        entitlements,
      })
    ).not.toThrow();
  });
});
