import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AuthUserLogoutRoute } from "@m5kdev/web-ui/modules/auth/components/AuthUserLogoutRoute";
import i18n from "i18next";
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { initBrowserPosthog, syncBrowserPosthogIdentity } from "../../../utils/posthog.utils";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

jest.mock("better-auth/react", () => ({ createAuthClient: () => ({}) }), { virtual: true });
jest.mock(
  "better-auth/client/plugins",
  () => ({
    adminClient: () => ({}),
    inferAdditionalFields: () => ({}),
    inferOrgAdditionalFields: () => ({}),
    lastLoginMethodClient: () => ({}),
    organizationClient: () => ({}),
  }),
  { virtual: true }
);

jest.mock(
  "@heroui/react",
  () => ({
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
  }),
  { virtual: true }
);

describe("browser and React error capture", () => {
  const events: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  let client: ReturnType<typeof initBrowserPosthog>;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
    client = initBrowserPosthog({ apiKey: "phc_test", host: "https://posthog.test" });
    client?.set_config({
      before_send: (event) => {
        if (event) events.push(event);
        return null;
      },
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      advanced_disable_decide: true,
    });
  });
  beforeEach(() => {
    events.length = 0;
  });
  afterAll(() => {
    client?.opt_out_capturing();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  beforeAll(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    await i18n.use(initReactI18next).init({
      lng: "en",
      resources: {
        en: {
          "starter-app": {
            errors: {
              title: "Something went wrong",
              body: "Reload the page to try again.",
              reload: "Reload page",
            },
          },
        },
      },
    });
  });

  it("reports a React render failure once with component context and a recovery screen", async () => {
    function Broken(): React.ReactNode {
      throw new Error("render failed");
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, { onCaughtError() {} });
    try {
      await act(async () => {
        root.render(
          <AppErrorBoundary client={client}>
            <Broken />
          </AppErrorBoundary>
        );
      });
      expect(container.textContent).toContain("Something went wrong");
      expect(container.querySelector("button")?.textContent).toBe("Reload page");
      const exceptions = events.filter((event) => event.event === "$exception");
      expect(exceptions).toHaveLength(1);
      expect(JSON.stringify(exceptions[0]?.properties?.$exception_list)).toContain("render failed");
      expect(exceptions[0]?.properties?.componentStack).toContain("Broken");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
  it("captures uncaught browser errors and unhandled rejections", () => {
    window.onerror?.(
      "browser failed",
      "https://app.test/assets/app.js",
      10,
      2,
      new Error("browser failed")
    );
    const rejection = Object.assign(new Event("unhandledrejection"), {
      reason: new Error("promise failed"),
      promise: Promise.resolve(),
    });
    window.onunhandledrejection?.(rejection);
    const exceptions = events.filter((event) => event.event === "$exception");
    expect(exceptions).toHaveLength(2);
    expect(JSON.stringify(exceptions[0]?.properties?.$exception_list)).toContain("browser failed");
    expect(JSON.stringify(exceptions[1]?.properties?.$exception_list)).toContain("promise failed");
  });

  it("keeps captured browser errors aligned with login, Organization switches, and logout", () => {
    syncBrowserPosthogIdentity(client, {
      user: { id: "user-1" },
      session: { activeOrganizationId: "org-1" },
    });
    client?.captureException(new Error("signed-in failure"));
    syncBrowserPosthogIdentity(client, {
      user: { id: "user-1" },
      session: { activeOrganizationId: "org-2" },
    });
    client?.captureException(new Error("switched failure"));
    syncBrowserPosthogIdentity(client, null);
    client?.captureException(new Error("signed-out failure"));
    const exceptions = events.filter((event) => event.event === "$exception");
    expect(exceptions[0]?.properties).toMatchObject({
      distinct_id: "user-1",
      "user.id": "user-1",
      "organization.id": "org-1",
    });
    expect(exceptions[1]?.properties).toMatchObject({
      distinct_id: "user-1",
      "user.id": "user-1",
      "organization.id": "org-2",
    });
    expect(exceptions[2]?.properties?.distinct_id).not.toBe("user-1");
    expect(exceptions[2]?.properties).not.toHaveProperty("user.id");
    expect(exceptions[2]?.properties).not.toHaveProperty("organization.id");
  });

  it("updates captured identity through actual AuthProvider refresh and sign-out", async () => {
    const authClient = {
      getSession: jest.fn().mockResolvedValue({
        data: { user: { id: "auth-user" }, session: { activeOrganizationId: "auth-org-1" } },
      }),
      signOut: jest.fn().mockResolvedValue(undefined),
    };
    function SessionActions() {
      const { registerSession } = useSession();
      const navigate = useNavigate();
      return (
        <>
          <button
            type="button"
            data-action="refresh"
            onClick={() => {
              void registerSession();
            }}
          >
            Refresh
          </button>
          <button type="button" data-action="logout" onClick={() => navigate("/logout")}>
            Sign out
          </button>
        </>
      );
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <AuthProvider
            authClient={authClient as unknown as ComponentProps<typeof AuthProvider>["authClient"]}
            onSession={(session) => syncBrowserPosthogIdentity(client, session)}
          >
            <MemoryRouter>
              <Routes>
                <Route path="/" element={<SessionActions />} />
                <Route
                  path="/logout"
                  element={<AuthUserLogoutRoute loader={<span>Signing out</span>} />}
                />
                <Route path="/login" element={<span>Signed out</span>} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        );
      });
      client?.captureException(new Error("authenticated failure"));
      authClient.getSession.mockResolvedValue({
        data: { user: { id: "auth-user" }, session: { activeOrganizationId: "auth-org-2" } },
      });
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.click();
      });
      client?.captureException(new Error("organization changed"));
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-action="logout"]')?.click();
      });
      expect(container.textContent).toBe("Signed out");
      client?.captureException(new Error("after logout"));
      const exceptions = events.filter((event) => event.event === "$exception");
      expect(exceptions[0]?.properties).toMatchObject({
        distinct_id: "auth-user",
        "organization.id": "auth-org-1",
      });
      expect(exceptions[1]?.properties).toMatchObject({
        distinct_id: "auth-user",
        "organization.id": "auth-org-2",
      });
      expect(exceptions[2]?.properties?.distinct_id).not.toBe("auth-user");
      expect(exceptions[2]?.properties).not.toHaveProperty("organization.id");
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it.each([undefined, "", "demo", " demo "])(
    "does not initialize without a configured key (%s)",
    (apiKey) => {
      expect(initBrowserPosthog({ apiKey })).toBeUndefined();
    }
  );
});
