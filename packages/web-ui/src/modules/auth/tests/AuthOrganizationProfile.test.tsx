import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthOrganizationProfile } from "../components/AuthOrganizationProfile";

let mockQueryOptions: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled: boolean;
};
let mockSubmit: (event: FormEvent<HTMLFormElement>) => void;
let mockSession = {
  data: { session: { activeOrganizationId: "org-1", activeOrganizationRole: "owner" } },
  isLoading: false,
};
const mockOrganization = { name: "Acme", slug: "acme", logo: null };
const mockGetOrganization = jest.fn();
const mockGetFullOrganization = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@tanstack/react-query", () => {
  const actual =
    jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: typeof mockQueryOptions) => {
      mockQueryOptions = options;
      return actual.useQuery(options);
    },
  };
});
jest.mock("@m5kdev/frontend/modules/auth/hooks/useAuthClient", () => ({
  useAuthClient: () => ({
    organization: {
      getOrganization: mockGetOrganization,
      getFullOrganization: mockGetFullOrganization,
      update: mockUpdate,
    },
  }),
}));
jest.mock("@m5kdev/frontend/modules/auth/hooks/useSession", () => ({
  useSession: () => mockSession,
}));
jest.mock("@m5kdev/frontend/modules/app/hooks/useAppRoles", () => ({
  useAppRoles: () => ({ managerRoles: ["owner", "admin"] }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("../../../components/AvatarUpload", () => ({ AvatarUpload: () => null }));
jest.mock(
  "@heroui/react",
  () => {
    const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
    return {
      Card: Object.assign(Container, {
        Header: Container,
        Title: Container,
        Description: Container,
      }),
      Form: ({ children, onSubmit }: { children: ReactNode; onSubmit: typeof mockSubmit }) => {
        mockSubmit = onSubmit;
        return <form>{children}</form>;
      },
      Button: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
      TextField: ({
        children,
        ...props
      }: {
        children: ReactNode;
        name: string;
        defaultValue: string;
      }) => (
        <div data-field={props.name} data-value={props.defaultValue}>
          {children}
        </div>
      ),
      Input: () => <input />,
      Label: Container,
      FieldError: () => null,
      Spinner: () => <div>Loading organization</div>,
      toast: { success: jest.fn(), danger: jest.fn() },
    };
  },
  { virtual: true }
);

describe("organization profile", () => {
  let queryClient: QueryClient;

  function render(props = {}) {
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthOrganizationProfile {...props} />
      </QueryClientProvider>
    );
  }

  async function load() {
    render();
    await queryClient.fetchQuery(mockQueryOptions);
    return render();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          retryOnMount: false,
          staleTime: Number.POSITIVE_INFINITY,
          gcTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    mockSession = {
      data: { session: { activeOrganizationId: "org-1", activeOrganizationRole: "owner" } },
      isLoading: false,
    };
    mockGetOrganization.mockResolvedValue({ data: mockOrganization, error: null });
    // Full hydration cannot represent a legitimate pending Membership without a User.
    mockGetFullOrganization.mockRejectedValue(
      new Error("Unexpected error: User not found for member")
    );
    mockUpdate.mockResolvedValue({ data: mockOrganization, error: null });
  });

  afterEach(() => queryClient.clear());

  it("loads profile metadata without hydrating invited or retained Memberships", async () => {
    expect(await load()).toContain('data-value="Acme"');
    expect(mockGetOrganization).toHaveBeenCalledWith({ query: { organizationId: "org-1" } });
    expect(mockGetFullOrganization).not.toHaveBeenCalled();
  });

  it("shows query failures separately from no active organization", async () => {
    mockGetOrganization.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    await expect(load()).rejects.toThrow("Unavailable");
    expect(render()).toContain("web-ui:organization.settings.loadError");
    expect(render()).not.toContain("web-ui:organization.settings.noActive");
  });

  it("keeps the loading state while the session is loading", () => {
    mockSession.isLoading = true;
    mockSession.data.session.activeOrganizationId = "";
    expect(render()).toContain("Loading organization");
    expect(mockQueryOptions.enabled).toBe(false);
  });

  it("shows no active organization when none is selected", () => {
    mockSession.data.session.activeOrganizationId = "";
    expect(render()).toContain("web-ui:organization.settings.noActive");
    expect(mockQueryOptions.enabled).toBe(false);
  });

  it("shows no active organization when the metadata endpoint returns none", async () => {
    mockGetOrganization.mockResolvedValue({ data: null, error: null });
    expect(await load()).toContain("web-ui:organization.settings.noActive");
  });

  it("shows the access message for a non-manager without fetching", () => {
    mockSession.data.session.activeOrganizationRole = "member";
    expect(render()).toContain("web-ui:organization.settings.manageOnly");
    expect(mockQueryOptions.enabled).toBe(false);
  });

  it("honors custom manager roles", async () => {
    mockSession.data.session.activeOrganizationRole = "coordinator";
    render({ managerRoles: ["coordinator"] });
    expect(mockQueryOptions.enabled).toBe(true);
    await queryClient.fetchQuery(mockQueryOptions);
    expect(render({ managerRoles: ["coordinator"] })).toContain('data-value="Acme"');
  });

  it("refreshes the profile after saving", async () => {
    await load();
    mockGetOrganization.mockResolvedValue({
      data: { ...mockOrganization, name: "Renamed" },
      error: null,
    });
    // Use a real FormData payload; only the browser form element is absent in this renderer.
    const payload = new FormData();
    payload.set("name", "Renamed");
    const formData = jest.spyOn(globalThis, "FormData").mockImplementation(() => payload);
    try {
      mockSubmit({ preventDefault() {}, currentTarget: {} } as FormEvent<HTMLFormElement>);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockUpdate).toHaveBeenCalledWith({
        organizationId: "org-1",
        data: { name: "Renamed", slug: "acme", logo: undefined },
      });
      await queryClient.fetchQuery(mockQueryOptions);
      expect(render()).toContain('data-value="Renamed"');
    } finally {
      formData.mockRestore();
    }
  });
});
