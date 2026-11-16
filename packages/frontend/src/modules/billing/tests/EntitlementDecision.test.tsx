import type { EntitlementSnapshot } from "@m5kdev/commons/modules/billing/billing.schema";
import { renderToStaticMarkup } from "react-dom/server";
import { type EntitlementProviderValue, entitlementProviderContext } from "../entitlement.context";
import { useEntitlement } from "../hooks/useEntitlements";

const snapshot: EntitlementSnapshot = {
  organizationId: "org-one",
  allowed: ["reports.publish"],
  capabilities: {
    "reports.publish": { capability: "reports.publish", allowed: true, reason: "allowed" },
  },
};
function Decision() {
  const decision = useEntitlement("reports.publish");
  return <output>{JSON.stringify(decision)}</output>;
}
function decision(overrides: Partial<EntitlementProviderValue> = {}) {
  return renderToStaticMarkup(
    <entitlementProviderContext.Provider
      value={{
        organizationId: "org-one",
        snapshot,
        isPending: false,
        isError: false,
        ...overrides,
      }}
    >
      <Decision />
    </entitlementProviderContext.Provider>
  );
}
it("allows the current successful Organization decision", () =>
  expect(decision()).toContain("&quot;allowed&quot;:true"));
it.each([{ isError: true }, { isPending: true }, { organizationId: "org-two" }])(
  "withholds stale allowance during an error, pending state or Organization switch: %j",
  (state) => {
    expect(decision(state)).toContain("&quot;allowed&quot;:false");
  }
);
