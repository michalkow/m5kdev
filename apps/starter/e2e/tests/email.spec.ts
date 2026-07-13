import { expect, test } from "@playwright/test";
import { clearEmails, latestEmail, profileFrom, profiles } from "./helpers";

test("stored email inbox renders and exposes JSON helpers", async ({ page, request }, testInfo) => {
  const profile = profileFrom(testInfo);
  await clearEmails(request, profile);

  await page.goto("/forgot-password");
  await page.locator('[name="forgot-password-email"]').fill(profiles[profile].adminEmail);
  const resetRequestPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/request-password-reset") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /reset password/i }).click();
  const resetRequest = await resetRequestPromise;
  expect(
    resetRequest.ok(),
    `${resetRequest.status()} ${resetRequest.statusText()}: ${await resetRequest.text()}`
  ).toBe(true);

  const email = await latestEmail(request, profile, {
    to: profiles[profile].adminEmail,
    templateId: "password-reset",
  });
  expect(email.subject).toContain("Reset");
  expect(email.html).toContain("Reset your password");

  await page.goto(`${profiles[profile].serverUrl}/__emails`);
  await expect(page.getByRole("heading", { name: "Stored emails" })).toBeVisible();
  await page.goto(`${profiles[profile].serverUrl}/__emails/${email.id}`);
  await expect(page.getByRole("heading", { name: email.subject })).toBeVisible();

  const rawResponse = await request.get(
    `${profiles[profile].serverUrl}/__emails/${email.id}/raw.html`
  );
  expect(rawResponse.ok()).toBe(true);
  expect(await rawResponse.text()).toContain("Reset your password");

  const jsonResponse = await request.get(
    `${profiles[profile].serverUrl}/__emails/${email.id}.json`
  );
  expect(jsonResponse.ok()).toBe(true);
  const payload = await jsonResponse.json();
  expect(payload.props).toEqual(expect.objectContaining({ url: expect.any(String) }));
  expect(payload.html).toContain("Reset your password");
});
