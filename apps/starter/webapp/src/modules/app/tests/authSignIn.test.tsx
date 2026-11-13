import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { AuthSession } from "@m5kdev/frontend/modules/auth/auth.context";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AuthPublicLoginForm } from "@m5kdev/web-ui/modules/auth/components/AuthPublicLoginForm";
import { AuthPublicProviders } from "@m5kdev/web-ui/modules/auth/components/AuthPublicProviders";
import { AuthPublicSignInCallbackRoute } from "@m5kdev/web-ui/modules/auth/components/AuthPublicSignInCallbackRoute";
import { AuthPublicSignupForm } from "@m5kdev/web-ui/modules/auth/components/AuthPublicSignupFormRoute";
import i18n from "i18next";
import { act, type ComponentProps, type ReactElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

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
      Spinner: () => null,
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
let currentSession: AuthSession | null = null;
let client: {
  getSession: jest.Mock;
  signIn: { email: jest.Mock; social: jest.Mock };
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
  sessionStorage.clear();
  client = {
    getSession: jest.fn(async () => ({ data: currentSession })),
    signIn: {
      social: jest.fn(async () => ({
        data: { url: "https://provider.example/signin", redirect: true },
        error: null,
      })),
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

function CurrentLocation(): ReactElement {
  const location = useLocation();
  return (
    <output data-location>
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function SessionActions(): ReactElement {
  const { registerSession, signOut } = useSession();
  return (
    <>
      <button
        type="button"
        data-action="complete-sign-in"
        onClick={() => {
          void registerSession(undefined, { signIn: true });
        }}
      >
        Complete sign-in
      </button>
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

async function renderLogin({
  props = {},
  form = <AuthPublicLoginForm />,
  initialEntry = "/login?returnTo=%2Freports",
}: {
  props?: Omit<ComponentProps<typeof AuthProvider>, "children" | "authClient">;
  form?: ReactElement;
  initialEntry?: string;
} = {}): Promise<void> {
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
          <MemoryRouter initialEntries={[initialEntry]}>
            <CurrentLocation />
            <Routes>
              <Route path="/login" element={form} />
              <Route
                path="/auth/sign-in/:attemptId"
                element={
                  <StrictMode>
                    <AuthPublicSignInCallbackRoute />
                  </StrictMode>
                }
              />
              <Route path="/" element={<span>Signed-in destination</span>} />
              <Route path="/reports" element={<span>Signed-in destination</span>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </AppConfigProvider>
    );
  });
}

async function submitLogin(prefix = "login"): Promise<void> {
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
  let loginFormVisibleOnSignIn = false;
  const onSignIn = jest.fn(() => {
    loginFormVisibleOnSignIn = container.querySelector("form") !== null;
  });
  await renderLogin({ props: { onSignIn } });
  expect(onSignIn).not.toHaveBeenCalled();
  await submitLogin();
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(onSignIn).toHaveBeenCalledWith(signedInSession);
  expect(loginFormVisibleOnSignIn).toBe(true);
  expect(container.textContent).toContain("Signed-in destination");
});

it("does not record restored sessions, refreshes, Organization changes, or logout, while preserving onSession", async () => {
  currentSession = signedInSession;
  const onSignIn = jest.fn();
  const onSession = jest.fn();
  await renderLogin({ props: { onSignIn, onSession } });
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
  await renderLogin({ props: { onSignIn } });
  await submitLogin();
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.querySelector("form")).not.toBeNull();
});

it("requires a confirmed session even after a successful credential response", async () => {
  client.signIn.email.mockResolvedValue({ data: { user: signedInSession.user }, error: null });
  const onSignIn = jest.fn();
  await renderLogin({ props: { onSignIn } });
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
    await renderLogin({ props: { onSignIn } });
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
    await renderLogin({ props: { onSignIn }, form: <AuthPublicSignupForm {...signupProps} /> });
    await submitLogin("signup");
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledWith(signedInSession);
    expect(container.textContent).toContain("Signed-in destination");
  }
);

it("does not record signup that waits for email verification", async () => {
  const onSignIn = jest.fn();
  await renderLogin({ props: { onSignIn }, form: <AuthPublicSignupForm /> });
  await submitLogin("signup");
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.textContent).toContain("verificationEmailSent");
});

it("records a correlated successful OAuth return once and preserves its destination", async () => {
  const onSignIn = jest.fn();
  await renderLogin({
    props: { onSignIn },
    form: <AuthPublicProviders providers={["google"]} returnTo="/reports?tab=recent#summary" />,
  });
  await act(async () => {
    container
      .querySelector("button:not([data-action])")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(client.signIn.social).toHaveBeenCalledTimes(1);
  expect(onSignIn).not.toHaveBeenCalled();
  const callbackURL = client.signIn.social.mock.calls[0][0].callbackURL;
  expect(callbackURL).toMatch(/\/auth\/sign-in\//);
  currentSession = signedInSession;
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderLogin({ props: { onSignIn }, initialEntry: new URL(callbackURL).pathname });
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(onSignIn).toHaveBeenCalledWith(signedInSession);
  expect(container.textContent).toContain("Signed-in destination");
  expect(container.querySelector("[data-location]")?.textContent).toBe(
    "/reports?tab=recent#summary"
  );
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderLogin({ props: { onSignIn }, initialEntry: new URL(callbackURL).pathname });
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

async function startOAuth({
  onSignIn = jest.fn(),
  props = {},
}: {
  onSignIn?: jest.Mock;
  props?: ComponentProps<typeof AuthPublicProviders>;
} = {}): Promise<string> {
  await renderLogin({
    props: { onSignIn },
    form: <AuthPublicProviders providers={["google"]} returnTo="/reports" {...props} />,
  });
  await act(async () => {
    container
      .querySelector("button:not([data-action])")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return client.signIn.social.mock.calls[0][0].callbackURL as string;
}

async function returnFromOAuth({
  callbackURL,
  onSignIn,
}: {
  callbackURL: string;
  onSignIn: jest.Mock;
}): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderLogin({ props: { onSignIn }, initialEntry: new URL(callbackURL).pathname });
}

it.each(["google", "linkedin", "microsoft"])(
  "preserves provider signup data and records only successful completion (%s)",
  async (provider) => {
    const onSignIn = jest.fn();
    const callbackURL = await startOAuth({
      onSignIn,
      props: {
        providers: [provider],
        requestSignUp: true,
        code: "waitlist-1",
        invitation: "invitation-1",
        trialPriceId: "price-1",
      },
    });
    expect(client.signIn.social).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        requestSignUp: true,
        additionalData: {
          waitlistInvitationCode: "waitlist-1",
          organizationInvitationCode: "invitation-1",
          userPriceId: "price-1",
        },
      })
    );
    expect(onSignIn).not.toHaveBeenCalled();
    currentSession = signedInSession;
    await returnFromOAuth({ callbackURL, onSignIn });
    expect(onSignIn).toHaveBeenCalledTimes(1);
  }
);

it("does not record a provider return that merely restores the previous session", async () => {
  currentSession = signedInSession;
  const onSignIn = jest.fn();
  const callbackURL = await startOAuth({ onSignIn });
  await returnFromOAuth({ callbackURL, onSignIn });
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.querySelector("[data-location]")?.textContent).toBe("/reports");
});

it("does not record a provider return without an authenticated session", async () => {
  const onSignIn = jest.fn();
  const callbackURL = await startOAuth({ onSignIn });
  await returnFromOAuth({ callbackURL, onSignIn });
  expect(onSignIn).not.toHaveBeenCalled();
});

it("does not record an uncorrelated provider return even with an existing session", async () => {
  currentSession = signedInSession;
  const onSignIn = jest.fn();
  await renderLogin({ props: { onSignIn }, initialEntry: "/auth/sign-in/unknown-attempt" });
  expect(onSignIn).not.toHaveBeenCalled();
  expect(container.querySelector("[data-location]")?.textContent).toBe("/");
});

it.each(["error", "reject"])(
  "clears failed OAuth initiation so it cannot later count a session (%s)",
  async (failure) => {
    if (failure === "error")
      client.signIn.social.mockResolvedValue({ data: null, error: { message: "Not allowed" } });
    else client.signIn.social.mockRejectedValue(new Error("Network unavailable"));
    const onSignIn = jest.fn();
    const callbackURL = await startOAuth({ onSignIn });
    currentSession = signedInSession;
    await returnFromOAuth({ callbackURL, onSignIn });
    expect(onSignIn).not.toHaveBeenCalled();
  }
);

it("does not count cancelled OAuth when the User later reloads with a session", async () => {
  const onSignIn = jest.fn();
  await startOAuth({ onSignIn });
  currentSession = signedInSession;
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderLogin({ props: { onSignIn } });
  expect(onSignIn).not.toHaveBeenCalled();
});

it("does not count expired OAuth attempts", async () => {
  const onSignIn = jest.fn();
  const callbackURL = await startOAuth({ onSignIn });
  currentSession = signedInSession;
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
  await returnFromOAuth({ callbackURL, onSignIn });
  expect(onSignIn).not.toHaveBeenCalled();
});

it("keeps redirects local even if a caller supplies an external destination", async () => {
  const onSignIn = jest.fn();
  const callbackURL = await startOAuth({
    onSignIn,
    props: { returnTo: "//external.example/path" },
  });
  currentSession = signedInSession;
  await returnFromOAuth({ callbackURL, onSignIn });
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(container.querySelector("[data-location]")?.textContent).toBe("/");
});

it("retains the original OAuth redirect without a recording handler", async () => {
  await renderLogin({
    props: {},
    form: <AuthPublicProviders providers={["google"]} returnTo="/reports?tab=recent#summary" />,
  });
  await act(async () => {
    container
      .querySelector("button:not([data-action])")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(client.signIn.social).toHaveBeenCalledWith(
    expect.objectContaining({ callbackURL: "http://localhost/reports?tab=recent#summary" })
  );
});

it("keeps OAuth usable when browser storage is unavailable", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage denied");
  });
  const onSignIn = jest.fn();
  const callbackURL = await startOAuth({ onSignIn });
  expect(callbackURL).toBe("http://localhost/reports");
  expect(onSignIn).not.toHaveBeenCalled();
});

it("does not record the same session again after another sign-in registration", async () => {
  const anotherSession = {
    ...signedInSession,
    session: { ...signedInSession.session, id: "session-2" },
  };
  const onSignIn = jest.fn();
  await renderLogin({ props: { onSignIn } });
  for (const session of [signedInSession, anotherSession, signedInSession]) {
    currentSession = session;
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="complete-sign-in"]')?.click();
    });
  }
  expect(onSignIn.mock.calls.map(([session]) => session.session.id)).toEqual([
    "session-1",
    "session-2",
  ]);
});
