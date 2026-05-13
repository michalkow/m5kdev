import { expect, test } from "@playwright/test";
import {
  clearEmails,
  emailUrl,
  getUserState,
  latestEmail,
  login,
  logout,
  profiles,
} from "./helpers";

const profile = "waitlist" as const;

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("public waitlist join stores confirmation email", async ({ page, request }) => {
  const email = `waitlist.${Date.now()}@auth-e2e.local`;

  await page.goto("/signup");
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: /join the waitlist/i }).click();

  const confirmation = await latestEmail(request, profile, {
    to: email,
    templateId: "waitlist-confirmation",
  });
  expect(confirmation.subject).toContain("waitlist");

  const systemNotification = await latestEmail(request, profile, {
    to: "ops@auth-e2e.local",
    templateId: "system-waitlist-notification",
  });
  expect(systemNotification.props.email).toBe(email);
});

test("admin waitlist invitation creates a signup link that can be accepted", async ({
  page,
  request,
}) => {
  const email = `invited.${Date.now()}@auth-e2e.local`;

  await login(page, profiles.waitlist.adminEmail, profiles.waitlist.adminPassword);
  await page.goto("/admin/waitlist");
  await page
    .getByRole("button", { name: /add to waitlist/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="email"]').fill(email);
  await dialog.getByRole("button", { name: /^add to waitlist$/i }).click();
  await expect(page.getByText(email)).toBeVisible();
  const waitlistRow = page.getByRole("row").filter({ hasText: email });
  await waitlistRow.getByLabel("Waitlist row actions").first().click();
  await page.getByRole("menuitem", { name: /send invitation/i }).click();

  const invite = await latestEmail(request, profile, { to: email, templateId: "waitlist-invite" });

  await logout(page);
  await page.goto(emailUrl(invite));
  await page.locator('[name="signup-password"]').fill("password1234");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByTestId("session-email")).toContainText(email);

  const state = await getUserState(request, profile, email);
  expect(state.user.emailVerified).toBe(true);
  expect(state.organizations).toHaveLength(1);

  await logout(page);
  await page.goto(emailUrl(invite));
  await expect(page.getByText(/invalid|expired|invitation code not found/i)).toBeVisible();
});

test("signed-in user invite skips the waitlist", async ({ page, request }) => {
  const email = `friend.${Date.now()}@auth-e2e.local`;

  await login(page, profiles.waitlist.adminEmail, profiles.waitlist.adminPassword);
  await page.goto("/user/invite");
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: /send invitation/i }).click();

  const invite = await latestEmail(request, profile, {
    to: email,
    templateId: "waitlist-user-invite",
  });

  await logout(page);
  await page.goto(emailUrl(invite));
  await page.locator('[name="signup-password"]').fill("password1234");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByTestId("session-email")).toContainText(email);

  const state = await getUserState(request, profile, email);
  expect(state.user.emailVerified).toBe(true);
  expect(state.organizations).toHaveLength(1);
});

test("expired waitlist codes are rejected before signup", async ({ page }) => {
  await page.goto("/signup?code=expired-waitlist-code");
  await expect(page.getByText(/expired|invitation code not found/i)).toBeVisible();
});

test("unknown waitlist codes are rejected before signup", async ({ page }) => {
  await page.goto("/signup?code=unknown-waitlist-code");
  await expect(page.getByText(/invalid|expired|invitation code not found/i)).toBeVisible();
});
