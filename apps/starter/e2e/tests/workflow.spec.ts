import { expect, test } from "@playwright/test";
import { clearEmails, login, signUp, verifyLatestEmail } from "./helpers";

const profile = "standard" as const;

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("trigger a demo workflow and observe it complete", async ({ page, request }) => {
  const email = `workflow.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await signUp(page, email, password);
  await verifyLatestEmail(request, profile, email);
  await login(page, email, password);

  await page.goto("/workflows");
  await expect(page.getByTestId("workflows-route")).toBeVisible();

  await page.getByTestId("workflow-trigger").click();
  await expect(page.getByTestId("workflow-run").first()).toBeVisible();
  await expect(page.getByTestId("workflow-run-status").first()).toHaveText(/completed/i, {
    timeout: 20_000,
  });
});
