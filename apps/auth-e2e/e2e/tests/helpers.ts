import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

type Profile = "standard" | "waitlist";

export type StoredEmail = {
  id: string;
  to: string | string[];
  templateId: string;
  subject: string;
  previewText: string;
  props: Record<string, unknown>;
  html?: string;
};

export type UserHarnessState = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string | null;
    banned: boolean | null;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string | null;
    type: string | null;
    parentId: string | null;
    role: string;
  }>;
  credentialAccount: boolean;
  accountClaims: Array<{
    id: string;
    status: string;
    claimUserId: string | null;
    claimedEmail: string | null;
    claimedAt: string | null;
    expiresAt: string | null;
  }>;
  pendingAccountClaims: number;
  acceptedAccountClaims: number;
  latestSession: {
    id: string;
    userId: string;
    activeOrganizationId: string | null;
    activeOrganizationMemberId: string | null;
    activeOrganizationRole: string | null;
    activeOrganizationType: string | null;
    activeTeamId: string | null;
    impersonatedBy: string | null;
    createdAt: string;
  } | null;
};

type AuthFetchOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export type AuthFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  json: unknown;
};

export const profiles = {
  standard: {
    webUrl: "http://127.0.0.1:15173",
    serverUrl: "http://127.0.0.1:18180",
    adminEmail: "admin.standard@auth-e2e.local",
    adminPassword: "password1234",
  },
  waitlist: {
    webUrl: "http://127.0.0.1:15174",
    serverUrl: "http://127.0.0.1:18181",
    adminEmail: "admin.waitlist@auth-e2e.local",
    adminPassword: "password1234",
  },
} as const satisfies Record<
  Profile,
  { webUrl: string; serverUrl: string; adminEmail: string; adminPassword: string }
>;

export function profileFrom(testInfo: TestInfo): Profile {
  return testInfo.project.name === "waitlist" ? "waitlist" : "standard";
}

export async function clearEmails(request: APIRequestContext, profile: Profile) {
  const response = await request.delete(`${profiles[profile].serverUrl}/__emails`);
  expect(response.ok()).toBe(true);
}

export async function latestEmail(
  request: APIRequestContext,
  profile: Profile,
  filter: { to?: string; templateId?: string }
) {
  const url = new URL(`${profiles[profile].serverUrl}/__emails/latest.json`);
  if (filter.to) url.searchParams.set("to", filter.to);
  if (filter.templateId) url.searchParams.set("templateId", filter.templateId);
  await expect
    .poll(async () => {
      const response = await request.get(url.toString());
      return response.ok();
    })
    .toBe(true);

  const response = await request.get(url.toString());
  expect(response.ok()).toBe(true);
  return (await response.json()) as StoredEmail;
}

export async function getUserState(request: APIRequestContext, profile: Profile, email: string) {
  const url = new URL(`${profiles[profile].serverUrl}/__auth-e2e/user.json`);
  url.searchParams.set("email", email);
  const response = await request.get(url.toString());
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()}: ${await response.text()}`);
  }
  return (await response.json()) as UserHarnessState;
}

export async function createProvisionedClaimUser(
  request: APIRequestContext,
  profile: Profile,
  email: string,
  options: { expiresInHours?: number } = {}
) {
  const response = await request.post(
    `${profiles[profile].serverUrl}/__auth-e2e/provisioned-claim-user`,
    {
      data: {
        email,
        expiresInHours: options.expiresInHours,
      },
    }
  );
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()}: ${await response.text()}`);
  }
  return (await response.json()) as {
    user: { id: string; email: string };
    organization: { id: string };
    claim: { id: string } | null;
  };
}

export async function seedOrganizations(
  request: APIRequestContext,
  profile: Profile,
  input: { prefix: string; count: number }
) {
  const response = await request.post(`${profiles[profile].serverUrl}/__auth-e2e/organizations`, {
    data: input,
  });
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()}: ${await response.text()}`);
  }
  return (await response.json()) as {
    organizations: Array<{ id: string; name: string; slug: string }>;
  };
}

export async function verifyLatestEmail(
  request: APIRequestContext,
  profile: Profile,
  email: string
) {
  const verification = await latestEmail(request, profile, {
    to: email,
    templateId: "verification",
  });
  const response = await request.get(emailUrl(verification), { maxRedirects: 0 });
  expect(
    response.ok() || (response.status() >= 300 && response.status() < 400),
    `${response.status()} ${response.statusText()}: ${await response.text()}`
  ).toBe(true);
}

export function emailUrl(email: StoredEmail) {
  const url = email.props.url;
  if (typeof url !== "string") {
    throw new Error(`Stored email ${email.id} does not include props.url`);
  }
  return url;
}

export async function signUp(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.locator('[name="signup-email"]').fill(email);
  await page.locator('[name="signup-password"]').fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('[name="login-email"]').fill(email);
  await page.locator('[name="login-password"]').fill(password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(page.getByTestId("session-email")).toContainText(email);
}

export async function expectLoginRejected(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('[name="login-email"]').fill(email);
  await page.locator('[name="login-password"]').fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^login$/i }).click();
  const response = await responsePromise;
  expect(
    response.ok(),
    `${response.status()} ${response.statusText()}: ${await response.text()}`
  ).toBe(false);
}

export async function authFetch(
  page: Page,
  profile: Profile,
  path: string,
  options: AuthFetchOptions = {}
): Promise<AuthFetchResult> {
  return page.evaluate(
    async ({ options, path, serverUrl }) => {
      const headers = { ...(options.headers ?? {}) };
      const init: RequestInit = {
        method: options.method ?? "GET",
        credentials: "include",
        headers,
      };
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${serverUrl}${path}`, init);
      const text = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        json,
      };
    },
    { options, path, serverUrl: profiles[profile].serverUrl }
  );
}

export async function logout(page: Page) {
  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login/);
}

export function resetTokenFrom(url: string) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/");
  const token = parts.at(-1);
  if (!token) throw new Error(`Could not read reset token from ${url}`);
  return token;
}
