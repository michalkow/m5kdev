import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { AuthSession } from "@m5kdev/frontend/modules/auth/auth.context";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AuthPublicLoginForm } from "@m5kdev/web-ui/modules/auth/components/AuthPublicLoginForm";
import { AuthPublicSignupForm } from "@m5kdev/web-ui/modules/auth/components/AuthPublicSignupFormRoute";
import i18n from "i18next";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";

// Substitute the external SDK and UI primitives; all project auth code runs unchanged.
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
  () => {
    const React = jest.requireActual("react");
    return {
      Form: ({ children, onSubmit }: ComponentProps<"form">) =>
        React.createElement("form", { onSubmit }, children),
      TextField: ({ children, name, type }: ComponentProps<"input">) =>
        React.createElement(
          "label",
          null,
          name,
          React.createElement("input", { name, type }),
          children
        ),
      Label: ({ children }: ComponentProps<"span">) => React.createElement("span", null, children),
      Input: () => null,
      FieldError: () => null,
      Button: ({
        children,
        type,
        onPress,
      }: {
        children: React.ReactNode;
        type?: string;
        onPress?: () => void;
      }) => React.createElement("button", { type, onClick: onPress }, children),
      Alert: Object.assign(
        ({ children }: ComponentProps<"div">) => React.createElement("div", null, children),
        Object.fromEntries(
          ["Indicator", "Content", "Title", "Description"].map((name) => [
            name,
            ({ children }: ComponentProps<"span">) => React.createElement("span", null, children),
          ])
        )
      ),
      toast: { danger: jest.fn() },
    };
  },
  { virtual: true }
);

const signedInSession = {
  user: { id: "user-1", name: "Test User", email: "user@example.com", emailVerified: true },
  session: { id: "session-1", userId: "user-1", activeOrganizationId: "org-1" },
} as NonNullable<AuthSession>;

let container: HTMLDivElement;
let root: Root;
let currentSession: AuthSession = null;
let client: {
  getSession: jest.Mock;
  signIn: { email: jest.Mock };
  signUp: { email: jest.Mock };
  signOut: jest.Mock;
  getLastUsedLoginMethod: () => null;
};

beforeAll(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.use(initReactI18next).init({ lng: "en", fallbackLng: "en", resources: {} });
});

beforeEach(() => {
  currentSession = null;
  client = {
    getSession: jest.fn(async () => ({ data: currentSession })),
    signIn: {
      email: jest.fn(async () => {
        currentSession = signedInSession;
        return { data: { user: signedInSession.user }, error: null };
      }),
    },
    signUp: { email: jest.fn(async () => ({ data: { user: signedInSession.user }, error: null })) },
    signOut: jest.fn(async () => {
      currentSession = null;
    }),
    getLastUsedLoginMethod: () => null,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

function SessionActions() {
  const { registerSession, signOut } = useSession();
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
      <button
        type="button"
        data-action="logout"
        onClick={() => {
          void signOut();
        }}
      >
        Logout
      </button>
    </>
  );
}

async function renderLogin(
  props: Omit<ComponentProps<typeof AuthProvider>, "children" | "authClient"> = {},
  form = <AuthPublicLoginForm />
) {
  await act(async () => {
    root.render(
      <AppConfigProvider
        config={{ appName: "Test", appUrl: "http://localhost", serverUrl: "http://localhost" }}
      >
        <AuthProvider
          authClient={client as unknown as ComponentProps<typeof AuthProvider>["authClient"]}
          {...props}
        >
          <SessionActions />
          <MemoryRouter initialEntries={["/login?returnTo=%2Freports"]}>
            <Routes>
              <Route path="/login" element={form} />
              <Route path="/" element={<span>Signed-in destination</span>} />
              <Route path="/reports" element={<span>Signed-in destination</span>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </AppConfigProvider>
    );
  });
}

async function submitLogin(prefix = "login") {
  const email = container.querySelector<HTMLInputElement>(`input[name="${prefix}-email"]`);
  const password = container.querySelector<HTMLInputElement>(`input[name="${prefix}-password"]`);
  if (!email || !password) throw new Error("Login fields are missing");
  email.value = "user@example.com";
  password.value = "correct-password";
  await act(async () => {
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it("reports the authenticated session once after successful email sign-in, before navigating", async () => {
  const onSignIn = jest.fn(() => {
    expect(container.querySelector("form")).not.toBeNull();
  });
  await renderLogin({ onSignIn });
  expect(onSignIn).not.toHaveBeenCalled();
  await submitLogin();
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(onSignIn).toHaveBeenCalledWith(signedInSession);
  expect(container.textContent).toContain("Signed-in destination");
});

it("does not record restored sessions, refreshes, Organization changes, or logout, while preserving onSession", async () => {
  currentSession = signedInSession;
  const onSignIn = jest.fn();
  const onSession = jest.fn();
  await renderLogin({ onSignIn, onSession });
  expect(onSession).toHaveBeenLastCalledWith(signedInSession);
  currentSession = {
    ...signedInSession,
    session: { ...signedInSession.session, activeOrganizationId: "org-2" },
  };
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.click();
  });
  expect(onSession).toHaveBeenLastCalledWith(currentSession);
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-action="logout"]')?.click();
  });
  expect(onSession).toHaveBeenLastCalledWith(null);
  expect(onSignIn).not.toHaveBeenCalled();
});

it("does not record failed email authentication", async () => {
  client.signIn.email.mockResolvedValue({ data: null, error: { message: "Invalid password" } });
  const onSignIn = jest.fn();
  await renderLogin({ onSignIn });
  await submitLogin();
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.querySelector("form")).not.toBeNull();
});

it("requires a confirmed session even after a successful credential response", async () => {
  client.signIn.email.mockResolvedValue({ data: { user: signedInSession.user }, error: null });
  const onSignIn = jest.fn();
  await renderLogin({ onSignIn });
  await submitLogin();
  expect(onSignIn).not.toHaveBeenCalled();
});

it.each(["throw", "reject"])(
  "keeps successful login usable when the callback fails (%s)",
  async (failure) => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const onSignIn = jest.fn(() => {
      if (failure === "throw") throw new Error("Recording failed");
      return Promise.reject(new Error("Recording failed"));
    });
    await renderLogin({ onSignIn });
    await submitLogin();
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Signed-in destination");
  }
);

it("preserves login navigation when no recording callback is configured", async () => {
  await renderLogin();
  await submitLogin();
  expect(container.textContent).toContain("Signed-in destination");
});

it.each([{ waitlist: true }, { invitation: "invite-1" }])(
  "records signup only when it explicitly signs in (%j)",
  async (signupProps) => {
    const onSignIn = jest.fn();
    await renderLogin({ onSignIn }, <AuthPublicSignupForm {...signupProps} />);
    await submitLogin("signup");
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledWith(signedInSession);
    expect(container.textContent).toContain("Signed-in destination");
  }
);

it("does not record signup that waits for email verification", async () => {
  const onSignIn = jest.fn();
  await renderLogin({ onSignIn }, <AuthPublicSignupForm />);
  await submitLogin("signup");
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.textContent).toContain("verificationEmailSent");
});
