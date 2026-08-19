import { expect, test } from "@playwright/test";
import { clearEmails, login, signUp, verifyLatestEmail } from "./helpers";

const profile = "standard" as const;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("upload a file and see it inventoried", async ({ page, request }) => {
  const email = `files.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await signUp(page, email, password);
  await verifyLatestEmail(request, profile, email);
  await login(page, email, password);

  await page.goto("/files");
  await expect(page.getByTestId("files-route")).toBeVisible();

  await page.getByTestId("file-upload-input").setInputFiles({
    name: "hello.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByTestId("file-row").first()).toContainText("hello.png", {
    timeout: 15_000,
  });
});
