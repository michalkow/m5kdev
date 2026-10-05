import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useUserOrganizations } from "@m5kdev/frontend/modules/auth/hooks/useUserOrganizations";
import { BillingProvider } from "@m5kdev/frontend/modules/billing/components/BillingProvider";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { BillingPaywallProvider } from "../components/BillingPaywallProvider";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock(
  "@m5kdev/frontend/modules/billing/components/BillingProvider",
  () => ({
    BillingProvider: jest.fn(
      ({
        planPage,
        children,
        skipPlanCheck,
      }: {
        planPage: ReactNode;
        children: ReactNode;
        skipPlanCheck?: boolean;
      }) => (skipPlanCheck ? children : planPage)
    ),
  }),
  { virtual: true }
);

jest.mock("@m5kdev/frontend/modules/auth/hooks/useSession", () => ({
  useSession: jest.fn(),
}));

jest.mock("@m5kdev/frontend/modules/auth/hooks/useUserOrganizations", () => ({
  useUserOrganizations: jest.fn(),
}));

jest.mock("@m5kdev/frontend/modules/auth/auth.lib", () => ({
  authClient: {
    organization: { setActive: jest.fn() },
    admin: { stopImpersonating: jest.fn() },
  },
}));

jest.mock(
  "@heroui/react",
  () => {
    function Select({ children }: { children?: ReactNode }) {
      return <div data-organization-select="true">{children}</div>;
    }
    Select.Trigger = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Select.Value = () => <span />;
    Select.Indicator = () => <span />;
    Select.Popover = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    function ListBox({ children }: { children?: ReactNode }) {
      return <div>{children}</div>;
    }
    ListBox.Item = ({ children, textValue }: { children?: ReactNode; textValue?: string }) => (
      <div>{textValue ?? children}</div>
    );
    ListBox.ItemIndicator = () => <span />;
    function Avatar({ children }: { children?: ReactNode }) {
      return <div>{children}</div>;
    }
    Avatar.Image = () => null;
    Avatar.Fallback = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    function Button({ children }: { children?: ReactNode }) {
      return <button type="button">{children}</button>;
    }
    return {
      Select,
      ListBox,
      Avatar,
      Button,
      Description: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
      Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
      Spinner: () => <span>loading</span>,
      toast: { success: jest.fn(), danger: jest.fn() },
    };
  },
  { virtual: true }
);

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseUserOrganizations = useUserOrganizations as unknown as jest.Mock;
const mockedBillingProvider = BillingProvider as unknown as jest.Mock;

function stubSession(options: { role?: string; impersonatedBy?: string | null }): void {
  mockedUseSession.mockReturnValue({
    data: {
      user: {
        name: "Ada",
        email: "ada@example.com",
        role: options.role ?? "user",
      },
      session: {
        userId: "user-1",
        activeOrganizationId: "org-unpaid",
        impersonatedBy: options.impersonatedBy ?? null,
      },
    },
    isLoading: false,
  });
}

function stubOrganizations(count: 1 | 2): void {
  const organizations = [
    { id: "org-unpaid", name: "Unpaid Co", type: "workspace", logo: null },
    { id: "org-paid", name: "Paid Co", type: "workspace", logo: null },
  ].slice(0, count);
  mockedUseUserOrganizations.mockReturnValue({
    data: organizations,
    isLoading: false,
  });
}

function renderPaywall(options?: { skipPlanCheck?: boolean }): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <BillingPaywallProvider
        skipPlanCheck={options?.skipPlanCheck}
        planPage={<div>Plan page</div>}
      >
        <div>App shell</div>
      </BillingPaywallProvider>
    </MemoryRouter>
  );
}

describe("BillingPaywallProvider", () => {
  beforeEach(() => {
    mockedBillingProvider.mockImplementation(
      ({
        planPage,
        children,
        skipPlanCheck,
      }: {
        planPage: ReactNode;
        children: ReactNode;
        skipPlanCheck?: boolean;
      }) => (skipPlanCheck ? children : planPage)
    );
    stubSession({ role: "user" });
    stubOrganizations(2);
  });

  it("shows Organization Select and the Plan page when the paywall is up", () => {
    const markup = renderPaywall();
    expect(markup).toContain("Plan page");
    expect(markup).toContain("Unpaid Co");
    expect(markup).toContain("Paid Co");
    expect(markup).not.toContain("App shell");
  });

  it("hides Organization Select when the User has one Membership", () => {
    stubOrganizations(1);
    const markup = renderPaywall();
    expect(markup).toContain("Plan page");
    expect(markup).not.toContain("Unpaid Co");
  });

  it("renders children without Plan-page chrome when skipPlanCheck is set", () => {
    const markup = renderPaywall({ skipPlanCheck: true });
    expect(markup).toContain("App shell");
    expect(markup).not.toContain("Plan page");
    expect(markup).not.toContain("Unpaid Co");
    expect(markup).not.toContain("/admin");
  });

  it("renders children without Plan-page chrome when BillingProvider would show the app", () => {
    mockedBillingProvider.mockImplementation(({ children }: { children: ReactNode }) => children);
    stubSession({ role: "admin" });
    const markup = renderPaywall();
    expect(markup).toContain("App shell");
    expect(markup).not.toContain("Plan page");
    expect(markup).not.toContain("Unpaid Co");
    expect(markup).not.toContain('href="/admin"');
  });

  it("shows an Admin panel link for User-role admin on their own session", () => {
    stubSession({ role: "admin" });
    const markup = renderPaywall();
    expect(markup).toContain('href="/admin"');
    expect(markup).toContain("web-ui:billing.paywall.admin");
    expect(markup).not.toContain("web-ui:impersonating.message");
  });

  it("hides the Admin panel link for a Member", () => {
    stubSession({ role: "user" });
    const markup = renderPaywall();
    expect(markup).not.toContain('href="/admin"');
  });

  it("shows the impersonation banner and hides the Admin panel link while impersonating", () => {
    stubSession({ role: "admin", impersonatedBy: "admin-1" });
    const markup = renderPaywall();
    expect(markup).toContain("web-ui:impersonating.message");
    expect(markup).not.toContain('href="/admin"');
  });
});
