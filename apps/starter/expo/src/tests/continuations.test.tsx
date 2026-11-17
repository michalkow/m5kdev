import { EXPERIENCE_FLOW_HEADER } from "@m5kdev/commons/modules/app/experience.constants";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { QueryClient } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import Claim from "../app/claim-account";
import Forgot from "../app/forgot-password";
import Accept from "../app/organization/accept-invitation";
import Reset from "../app/reset-password";
import Signup from "../app/signup";
import { ExperienceBootstrap } from "../components/ExperienceBootstrap";

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
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => params,
  useRouter: () => ({ replace }),
  Redirect: () => null,
  Link: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) => (
    <span data-testid={testID}>{children}</span>
  ),
}));
jest.mock("heroui-native", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Typography: { Paragraph: ({ children }: { children: ReactNode }) => <p>{children}</p> },
  TextField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Input: ({
    testID,
    value,
    onChangeText,
  }: {
    testID: string;
    value: string;
    onChangeText: (s: string) => void;
  }) => <input data-testid={testID} value={value} onChange={(e) => onChangeText(e.target.value)} />,
  Button: ({
    children,
    testID,
    onPress,
    isDisabled,
  }: {
    children: ReactNode;
    testID: string;
    onPress: () => void;
    isDisabled: boolean;
  }) => (
    <button data-testid={testID} onClick={onPress} disabled={isDisabled}>
      {children}
    </button>
  ),
}));
let params: Record<string, string | string[]> = {};
const replace = jest.fn();
let root: Root;
let container: HTMLDivElement;
const resetPassword = jest.fn();
const requestPasswordReset = jest.fn();
const signUp = jest.fn();
const getSession = jest.fn();
const setActive = jest.fn();
const requests: Array<{ url: string; input: unknown }> = [];
const session = {
  user: { id: "user", email: "owner@example.test" },
  session: { id: "session", activeOrganizationId: "org" },
};
const client = {
  getSession,
  resetPassword,
  requestPasswordReset,
  signUp: { email: signUp },
  organization: { setActive },
};
beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: false }));
beforeEach(() => {
  params = {};
  replace.mockClear();
  requests.length = 0;
  getSession.mockResolvedValue({ data: session });
  resetPassword.mockResolvedValue({ data: {}, error: null });
  requestPasswordReset.mockResolvedValue({ data: {}, error: null });
  signUp.mockResolvedValue({ data: {}, error: null });
  setActive.mockResolvedValue({ data: {}, error: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Object.assign(globalThis, {
    fetch: jest.fn(async (url: unknown, options: RequestInit = {}) => {
      const parsed = new URL(String(url));
      const wire = options.body
        ? JSON.parse(String(options.body))
        : JSON.parse(parsed.searchParams.get("input") ?? "{}");
      const input = wire["0"] ? transformer.deserialize(wire["0"]) : undefined;
      requests.push({ url: parsed.pathname, input });
      const data = parsed.pathname.includes("readInvitation")
        ? { email: "invited@example.test" }
        : parsed.pathname.includes("acceptOrganizationInvitation")
          ? { organizationId: "org" }
          : parsed.pathname.includes("getMyAccountClaimStatus")
            ? { claimedEmail: "owner@example.test" }
            : parsed.pathname.includes("validateWaitlistCode")
              ? { status: "VALID" }
              : {};
      return new Response(
        JSON.stringify(
          parsed.pathname.includes("/trpc/")
            ? [{ result: { data: transformer.serialize(data) } }]
            : data
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.clearAllMocks();
});
async function render(screen: ReactNode) {
  await act(async () => {
    root.render(
      <AppConfigProvider
        config={{
          appName: "Selected Native",
          appUrl: "https://selected.test",
          serverUrl: "https://api.test",
        }}
      >
        <AuthProvider authClient={client as never}>
          <AppTrpcQueryProvider queryClient={new QueryClient()}>{screen}</AppTrpcQueryProvider>
        </AuthProvider>
      </AppConfigProvider>
    );
    await new Promise((r) => setTimeout(r, 30));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function input(id: string, value: string) {
  await act(async () => {
    const el = container.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(id: string) {
  await act(async () => {
    (container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));
  });
}
it("carries reset proof and reports resolved SDK failure as recovery", async () => {
  params = { token: "token", experienceFlow: "bound-reset" };
  resetPassword.mockResolvedValue({ error: { message: "internal signature detail" } });
  await render(<Reset />);
  await input("reset-password-new", "Password123!");
  await input("reset-password-confirm", "Password123!");
  await click("reset-password-submit");
  expect(resetPassword).toHaveBeenCalledWith(
    { token: "token", newPassword: "Password123!" },
    { headers: { [EXPERIENCE_FLOW_HEADER]: "bound-reset" } }
  );
  expect(container.textContent).toContain("Request a fresh link from the same website");
  expect(container.textContent).not.toContain("successfully");
});
it("preserves waitlist proof through validation and signup headers", async () => {
  params = { code: "waitlist", experienceFlow: "bound-waitlist", email: "invite@example.test" };
  await render(<Signup />);
  expect(requests).toContainEqual({
    url: expect.stringContaining("validateWaitlistCode"),
    input: { code: "waitlist", experienceFlow: "bound-waitlist" },
  });
  await input("signup-password", "Password123!");
  await click("signup-submit");
  expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({ email: "invite@example.test" }),
    expect.objectContaining({
      headers: expect.objectContaining({ [EXPERIENCE_FLOW_HEADER]: "bound-waitlist" }),
    })
  );
});
it("preserves invitation proof for both resource reads and acceptance", async () => {
  params = { id: "invitation", experienceFlow: "bound-invitation" };
  await render(<Accept />);
  expect(requests).toContainEqual({
    url: expect.stringContaining("readInvitation"),
    input: { id: "invitation", experienceFlow: "bound-invitation" },
  });
  expect(requests).toContainEqual({
    url: expect.stringContaining("acceptOrganizationInvitation"),
    input: { id: "invitation", experienceFlow: "bound-invitation" },
  });
});
it("preserves claim resource and proof through status, email, password and acceptance", async () => {
  params = { claim: "claim", claimFlow: "bound-claim" };
  await render(<Claim />);
  expect(requests).toContainEqual({
    url: expect.stringContaining("getMyAccountClaimStatus"),
    input: { claimId: "claim", experienceFlow: "bound-claim" },
  });
  await click("claim-email-submit");
  await input("claim-password", "Password123!");
  await click("claim-password-submit");
  expect(requests).toContainEqual({
    url: expect.stringContaining("setMyAccountClaimEmail"),
    input: { email: "owner@example.test", claimId: "claim", experienceFlow: "bound-claim" },
  });
  expect(requests).toContainEqual({ url: "/api/auth/set-password", input: undefined });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.test/api/auth/set-password",
    expect.objectContaining({
      body: JSON.stringify({
        newPassword: "Password123!",
        claimId: "claim",
        experienceFlow: "bound-claim",
      }),
    })
  );
  expect(requests).toContainEqual({
    url: expect.stringContaining("acceptMyAccountClaim"),
    input: { claimId: "claim", experienceFlow: "bound-claim" },
  });
});
it("does not report a resolved password recovery error as a sent email", async () => {
  requestPasswordReset.mockResolvedValue({ error: { message: "failed" } });
  await render(<Forgot />);
  await click("forgot-password-submit");
  expect(container.textContent).not.toContain("email sent");
  expect(container.textContent).toContain("Unable to request a reset link");
});
it("rejects duplicated continuation parameters before submitting a reset", async () => {
  params = { token: "token", experienceFlow: ["first", "second"] };
  await render(<Reset />);
  await click("reset-password-submit");
  expect(resetPassword).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Request a fresh link from the same website");
});

it("loads selected native presentation before Auth and supports recovery without mounting Auth early", async () => {
  let release!: (v: unknown) => void;
  const fetcher = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  Object.assign(globalThis, { fetch: fetcher });
  getSession.mockClear();
  await act(async () =>
    root.render(
      <ExperienceBootstrap>
        <AuthProvider authClient={client as never}>
          <p>Native Auth ready</p>
        </AuthProvider>
      </ExperienceBootstrap>
    )
  );
  expect(getSession).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Loading");
  await act(async () => release({ ok: false, status: 503 }));
  expect(getSession).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to load");
  await act(async () => container.querySelector("button")!.click());
  await act(async () =>
    release({
      ok: true,
      json: async () => ({
        id: "native",
        product: "starter",
        brand: { name: "Selected Native" },
        webOrigin: "https://selected.test",
        apiOrigin: "https://api.test",
      }),
    })
  );
  expect(getSession).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Native Auth ready");
});

it("retains invitation proof when an anonymous recipient moves to signup", async () => {
  params = { id: "invitation", experienceFlow: "bound-invitation" };
  getSession.mockResolvedValue({ data: null });
  await render(<Accept />);
  expect(replace).toHaveBeenCalledWith(
    "/signup?invitation=invitation&email=invited%40example.test&experienceFlow=bound-invitation"
  );
  expect(requests.some((r) => r.url.includes("acceptOrganizationInvitation"))).toBe(false);
});
it("rejects duplicate claim references before reading or changing a claim", async () => {
  params = { claim: ["first", "second"], claimFlow: "bound-claim" };
  await render(<Claim />);
  expect(container.textContent).toContain("Request a fresh link from the same website");
  expect(requests.some((r) => r.url.includes("AccountClaim"))).toBe(false);
});
it("uses the explicitly authored one-Experience frontend origin for native recovery and verification destinations", async () => {
  await render(<Forgot />);
  await click("forgot-password-submit");
  expect(requestPasswordReset).toHaveBeenCalledWith({
    email: "",
    redirectTo: "https://selected.test/reset-password",
  });
  await act(async () =>
    root.render(
      <AppConfigProvider
        config={{
          appName: "Native",
          appUrl: "https://selected.test",
          serverUrl: "https://api.test",
        }}
      >
        <AuthProvider authClient={client as never}>
          <AppTrpcQueryProvider queryClient={new QueryClient()}>
            <Signup />
          </AppTrpcQueryProvider>
        </AuthProvider>
      </AppConfigProvider>
    )
  );
  await input("signup-email", "native@example.test");
  await input("signup-password", "Password123!");
  await click("signup-submit");
  expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({ callbackURL: "https://selected.test/login" }),
    expect.anything()
  );
});

it("retries claim acceptance without creating the already committed password again", async () => {
  params = { claim: "claim", claimFlow: "bound-claim" };
  const send = jest.mocked(fetch).getMockImplementation()!;
  let passwordWrites = 0;
  let acceptAttempts = 0;
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (String(url).includes("/set-password")) {
      passwordWrites++;
      if (passwordWrites > 1)
        return new Response(JSON.stringify({ message: "User already has a password" }), {
          status: 400,
        });
    }
    if (String(url).includes("acceptMyAccountClaim") && ++acceptAttempts === 1)
      throw new Error("Temporary acceptance outage");
    if (String(url).includes("getMyAccountClaimStatus") && passwordWrites > 0)
      return new Response(
        JSON.stringify([
          {
            result: {
              data: transformer.serialize({
                claimedEmail: "owner@example.test",
                hasPassword: true,
              }),
            },
          },
        ]),
        { headers: { "content-type": "application/json" } }
      );
    return send(url, options);
  });
  await render(<Claim />);
  await input("claim-password", "Password123!");
  await click("claim-password-submit");
  expect(container.textContent).toContain("Temporary acceptance outage");
  await act(async () => root.unmount());
  root = createRoot(container);
  await render(<Claim />);
  await click("claim-password-submit");
  expect(passwordWrites).toBe(1);
  expect(acceptAttempts).toBe(2);
  expect(container.textContent).toContain("Password set. Account claimed.");
});
