// Requires the isolated local runtime described in docs/customer-support-verification.md.
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const requireE2E = createRequire(path.join(root, "apps/starter/e2e/package.json"));
const { chromium, expect } = requireE2E("@playwright/test");
const { writeFile, mkdir } = require("node:fs/promises");
const base = "http://127.0.0.1:43191";
let activeBrowser;
async function main() {
  await mkdir("/tmp/m5kdev-support-execution", { recursive: true });
  const { createSupportReferenceClient } = await import(
    root + "/scripts/support-native-reference.mjs"
  );
  const customer = createSupportReferenceClient(base);
  const staff = createSupportReferenceClient(base);
  await customer.signIn("support-customer@fixture.test", "Local-Support-Password-123");
  await staff.signIn("support-staff@fixture.test", "Local-Support-Password-123");
  const prefs = await staff.call("getSettings");
  await staff.call("saveSettings", { ...prefs, expectedVersion: prefs.version, csatEnabled: true });
  const title = "Browser support " + Date.now();
  const item = await customer.call("createCase", {
    clientId: crypto.randomUUID(),
    subject: title,
    body: "password reset",
    uiLocale: "en",
  });
  let current;
  for (let i = 0; i < 60; i++) {
    current = await customer.call("getCase", { id: item.id });
    if (current.messages.some((m) => m.authorKind === "ai")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!current.messages.some((m) => m.authorKind === "ai"))
    throw new Error("Real Workflow did not publish AI reply");
  console.log("Real Redis worker published cited AI answer", current.messages.at(-1).citations);
  await customer.call("requestHuman", { id: item.id });
  await customer.call("setLanguage", { id: item.id, locale: "pl" });
  const browser = (activeBrowser = await chromium.launch({ channel: "chrome", headless: true }));
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const userContext = await browser.newContext({ viewport: { width: 420, height: 900 } });
  for (const [context, who] of [
    [adminContext, "support-staff"],
    [userContext, "support-customer"],
  ]) {
    const response = await context.request.post(base + "/api/auth/sign-in/email", {
      headers: { Origin: base },
      data: { email: who + "@fixture.test", password: "Local-Support-Password-123" },
    });
    if (!response.ok()) throw new Error(await response.text());
  }
  const admin = await adminContext.newPage();
  const user = await userContext.newPage();
  admin.setDefaultTimeout(8000);
  user.setDefaultTimeout(8000);
  const errors = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  user.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(base + "/admin/support");
  await admin.getByRole("button", { name: new RegExp(title) }).click();

  await admin.getByText("Internal note (staff only)", { exact: true }).click();

  await admin.getByRole("textbox", { name: /^Internal note/ }).fill("PRIVATE STAFF NOTE");

  await admin.getByRole("button", { name: "Add note", exact: true }).click();
  await admin.getByText("PRIVATE STAFF NOTE", { exact: true }).waitFor();
  if (
    (await customer.call("getCase", { id: item.id })).messages.some((m) =>
      m.body.includes("PRIVATE")
    )
  )
    throw new Error("Note leaked");
  await admin.getByRole("textbox", { name: /^Message/ }).fill("A public staff answer");
  await admin.getByRole("button", { name: "Send message", exact: true }).click();
  await admin.getByText("pl: A public staff answer", { exact: true }).first().waitFor();
  await admin.screenshot({ path: "/tmp/m5kdev-support-execution/admin.png", fullPage: true });
  await user.goto(base + "/");
  await user.getByRole("button", { name: /Contact support/ }).focus();
  await user.keyboard.press("Enter");
  const dialog = user.getByRole("dialog", { name: "Contact support" });
  await dialog.getByRole("button", { name: new RegExp(title) }).click();
  await dialog.getByText("pl: A public staff answer", { exact: true }).first().waitFor();
  if ((await dialog.innerText()).includes("PRIVATE STAFF NOTE"))
    throw new Error("Widget note leak");
  await dialog.getByRole("button", { name: "Resolve", exact: true }).click();
  await dialog.getByRole("button", { name: "Happy", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Happy", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await user.screenshot({ path: "/tmp/m5kdev-support-execution/widget.png", fullPage: true });
  await user.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const result = {
    caseId: item.id,
    title,
    worker: "Redis published cited AI response",
    staffNote: "hidden from customer",
    translation: "pl rendition published",
    csat: "smiley click selected",
    keyboard: "Escape closed widget",
    pageErrors: errors,
  };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(
    "/tmp/m5kdev-support-execution/browser-result.json",
    JSON.stringify(result, null, 2)
  );
  await browser.close();
  await customer.signOut();
  await staff.signOut();
}
main().catch(async (e) => {
  console.error(e);
  await activeBrowser?.close();
  process.exitCode = 1;
});
