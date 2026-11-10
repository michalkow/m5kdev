import type { EntitlementSnapshot } from "@m5kdev/commons/modules/billing/billing.schema";
import { useEntitlements } from "@m5kdev/frontend/modules/billing/hooks/useEntitlements";
import { renderToStaticMarkup } from "react-dom/server";
import { EntitlementGate } from "../components/EntitlementGate";

jest.mock(
  "@m5kdev/frontend/modules/billing/hooks/useEntitlements",
  () => ({
    useEntitlements: jest.fn(),
  }),
  { virtual: true }
);

const mockedUseEntitlements = useEntitlements as unknown as jest.Mock;

function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    organizationId: "org-1",
    allowed: ["apps.typeorb"],
    capabilities: {
      "apps.typeorb": {
        capability: "apps.typeorb",
        allowed: true,
        reason: "allowed",
      },
      "apps.knowledge": {
        capability: "apps.knowledge",
        allowed: false,
        reason: "missing_capability",
      },
    },
    ...overrides,
  };
}

function stubEntitlements(value: {
  snapshot?: EntitlementSnapshot;
  isPending?: boolean;
  isError?: boolean;
  organizationId?: string;
}): void {
  mockedUseEntitlements.mockReturnValue({
    organizationId: value.organizationId ?? "org-1",
    snapshot: value.snapshot,
    isPending: value.isPending ?? false,
    isError: value.isError ?? false,
  });
}

function renderGate(capabilities: readonly string[] = ["apps.typeorb"]): string {
  return renderToStaticMarkup(
    <EntitlementGate
      capabilities={capabilities}
      pending={<div>Pending</div>}
      error={<div>Error</div>}
      denied={<div>Denied</div>}
    >
      <div>Allowed</div>
    </EntitlementGate>
  );
}

describe("EntitlementGate", () => {
  it("renders pending while the snapshot is loading", () => {
    stubEntitlements({ isPending: true });
    expect(renderGate()).toContain("Pending");
    expect(renderGate()).not.toContain("Allowed");
  });

  it("renders error when the snapshot query fails instead of denied", () => {
    stubEntitlements({ isError: true });
    expect(renderGate()).toContain("Error");
    expect(renderGate()).not.toContain("Denied");
    expect(renderGate()).not.toContain("Allowed");
  });

  it("renders error when a Capability is missing from the snapshot", () => {
    stubEntitlements({ snapshot: snapshot() });
    expect(renderGate(["not.a.capability"])).toContain("Error");
    expect(renderGate(["not.a.capability"])).not.toContain("Denied");
  });

  it("renders denied when any listed Capability is missing", () => {
    stubEntitlements({ snapshot: snapshot() });
    expect(renderGate(["apps.typeorb", "apps.knowledge"])).toContain("Denied");
    expect(renderGate(["apps.typeorb", "apps.knowledge"])).not.toContain("Allowed");
  });

  it("renders children when every listed Capability is allowed", () => {
    stubEntitlements({ snapshot: snapshot() });
    expect(renderGate(["apps.typeorb"])).toContain("Allowed");
    expect(renderGate(["apps.typeorb"])).not.toContain("Denied");
  });

  it("does not treat skipPlanCheck as every Capability allowed", () => {
    stubEntitlements({ snapshot: snapshot() });
    const markup = renderToStaticMarkup(
      <EntitlementGate capabilities={["apps.knowledge"]} denied={<div>Denied</div>}>
        <div>Allowed despite skipPlanCheck</div>
      </EntitlementGate>
    );
    expect(markup).toContain("Denied");
    expect(markup).not.toContain("Allowed despite skipPlanCheck");
  });
});
