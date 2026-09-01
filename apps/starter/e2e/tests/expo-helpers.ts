import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createTrpcClient } from "./helpers";

export const createExpoTrpcClient = createTrpcClient;

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
