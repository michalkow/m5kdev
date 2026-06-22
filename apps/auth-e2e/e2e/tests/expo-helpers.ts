import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { transformer } from "@m5kdev/commons/utils/trpc";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { type Profile, profiles } from "./helpers";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

async function cookieHeader(page: Page, profile: Profile) {
  const cookies = await page.context().cookies(profiles[profile].serverUrl);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function createExpoTrpcClient(page: Page, profile: Profile) {
  const cookie = await cookieHeader(page, profile);

  return createTRPCClient<BackendTRPCRouter>({
    links: [
      httpBatchLink({
        url: `${profiles[profile].serverUrl}/trpc`,
        fetch(url, options) {
          const headers = new Headers(options?.headers);
          if (cookie) {
            headers.set("cookie", cookie);
          }
          return fetch(url, {
            ...options,
            body: options?.body ? (options.body as FetchInit["body"]) : undefined,
            headers,
          });
        },
        transformer,
      }),
    ],
  });
}

export async function expoSignUp(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill(password);
  await page.getByTestId("signup-submit").click();
}

export async function expoLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("session-email")).toContainText(email);
}

export async function expoLogout(page: Page) {
  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login/);
}

export async function expectExpoLoginRejected(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST"
  );
  await page.getByTestId("login-submit").click();
  const response = await responsePromise;
  expect(
    response.ok(),
    `${response.status()} ${response.statusText()}: ${await response.text()}`
  ).toBe(false);
}
