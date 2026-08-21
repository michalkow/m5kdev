import { expect, test } from "@playwright/test";
import { clearEmails, login, signUp, verifyLatestEmail } from "./helpers";

const profile = "standard" as const;

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("open the agent conversation and see an empty transcript", async ({ page, request }) => {
  const email = `conversation.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await signUp(page, email, password);
  await verifyLatestEmail(request, profile, email);
  await login(page, email, password);

  await page.goto("/conversation");
  await expect(page.getByTestId("conversation-route")).toBeVisible();
  await expect(page.getByText("No messages yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
