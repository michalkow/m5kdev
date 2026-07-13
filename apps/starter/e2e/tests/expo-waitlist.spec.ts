import { expect, test } from "@playwright/test";
import { createExpoTrpcClient, expoLogin, expoLogout } from "./expo-helpers";
import { clearEmails, emailUrl, getUserState, latestEmail, profiles } from "./helpers";

const profile = "expoWaitlist" as const;

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("public waitlist join stores confirmation email", async ({ page, request }) => {
  const email = `expo.waitlist.${Date.now()}@auth-e2e.local`;

  await page.goto("/signup");
  await page.getByTestId("waitlist-email").fill(email);
  await page.getByTestId("waitlist-submit").click();

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
  const email = `expo.invited.${Date.now()}@auth-e2e.local`;

  await expoLogin(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const waitlist = await trpc.auth.addToWaitlist.mutate({ email });
  await trpc.auth.inviteFromWaitlist.mutate({ id: waitlist.id });

  const invite = await latestEmail(request, profile, { to: email, templateId: "waitlist-invite" });

  await expoLogout(page);
  await page.goto(emailUrl(invite));
  await page.getByTestId("signup-password").fill("password1234");
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("session-email")).toContainText(email);

  const state = await getUserState(request, profile, email);
  expect(state.user.emailVerified).toBe(true);
  expect(state.organizations).toHaveLength(1);

  await expoLogout(page);
  await page.goto(emailUrl(invite));
  await expect(page.getByTestId("waitlist-code-status")).toContainText(
    /invalid|expired|invitation code not found/i
  );
});

test("signed-in user invite skips the waitlist", async ({ page, request }) => {
  const email = `expo.friend.${Date.now()}@auth-e2e.local`;

  await expoLogin(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  await trpc.auth.inviteToWaitlist.mutate({ email });

  const invite = await latestEmail(request, profile, {
    to: email,
    templateId: "waitlist-user-invite",
  });

  await expoLogout(page);
  await page.goto(emailUrl(invite));
  await page.getByTestId("signup-password").fill("password1234");
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("session-email")).toContainText(email);

  const state = await getUserState(request, profile, email);
  expect(state.user.emailVerified).toBe(true);
  expect(state.organizations).toHaveLength(1);
});

test("expired waitlist codes are rejected before signup", async ({ page }) => {
  await page.goto("/signup?code=expired-waitlist-code");
  await expect(page.getByTestId("waitlist-code-status")).toContainText(/expired/i);
});

test("unknown waitlist codes are rejected before signup", async ({ page }) => {
  await page.goto("/signup?code=unknown-waitlist-code");
  await expect(page.getByTestId("waitlist-code-status")).toContainText(
    /invalid|expired|invitation code not found/i
  );
});
