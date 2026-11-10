import { useQuery } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "../../auth/hooks/useSession";
import { EntitlementProvider } from "../components/EntitlementProvider";

jest.mock("../../app/hooks/useAppTrpc", () => ({
  useAppTRPC: jest.fn(),
}));

jest.mock("../../auth/hooks/useSession", () => ({
  useSession: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
}));

const mockedUseAppTRPC = useAppTRPC as unknown as jest.Mock;
const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseQuery = useQuery as unknown as jest.Mock;
const queryOptions = jest.fn();

function renderProvider(): void {
  renderToStaticMarkup(
    <EntitlementProvider>
      <div>Child</div>
    </EntitlementProvider>
  );
}

describe("EntitlementProvider", () => {
  beforeEach(() => {
    queryOptions.mockReset();
    queryOptions.mockReturnValue({ queryKey: ["billing.getEntitlements"] });
    mockedUseAppTRPC.mockReturnValue({
      billing: { getEntitlements: { queryOptions } },
    });
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      isError: false,
    });
  });

  it("keys the snapshot query by Organization id", () => {
    mockedUseSession.mockReturnValue({
      data: { session: { activeOrganizationId: "org-1" } },
    });
    renderProvider();
    expect(queryOptions).toHaveBeenCalledWith(
      { organizationId: "org-1" },
      expect.objectContaining({ enabled: true })
    );
  });

  it("does not reuse the previous Organization snapshot after a switch", () => {
    mockedUseSession.mockReturnValue({
      data: { session: { activeOrganizationId: "org-1" } },
    });
    renderProvider();
    mockedUseSession.mockReturnValue({
      data: { session: { activeOrganizationId: "org-2" } },
    });
    renderProvider();
    expect(queryOptions.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { organizationId: "org-1" },
      { organizationId: "org-2" },
    ]);
  });

  it("does not query until an Organization is active", () => {
    mockedUseSession.mockReturnValue({ data: { session: {} } });
    renderProvider();
    expect(queryOptions).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
  });
});
