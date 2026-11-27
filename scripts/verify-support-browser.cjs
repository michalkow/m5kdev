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
    `${root}/scripts/support-native-reference.mjs`
  );
  const customer = createSupportReferenceClient(base);
  const staff = createSupportReferenceClient(base);
  await customer.signIn("support-customer@fixture.test", "Local-Support-Password-123");
  await staff.signIn("support-staff@fixture.test", "Local-Support-Password-123");
  const prefs = await staff.call("getSettings");
  await staff.call("saveSettings", { ...prefs, expectedVersion: prefs.version, csatEnabled: true });
  const title = `Browser support ${Date.now()}`;
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
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  activeBrowser = browser;
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const userContext = await browser.newContext({ viewport: { width: 420, height: 900 } });
  for (const [context, who] of [
    [adminContext, "support-staff"],
    [userContext, "support-customer"],
  ]) {
    const response = await context.request.post(`${base}/api/auth/sign-in/email`, {
      headers: { Origin: base },
      data: { email: `${who}@fixture.test`, password: "Local-Support-Password-123" },
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
  await admin.goto(`${base}/admin/support`);
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
  await user.goto(`${base}/`);
  await user.getByRole("button", { name: /Contact support|Support: \d+ unread/ }).focus();
  await user.keyboard.press("Enter");
  const dialog = user.getByRole("dialog", { name: "Contact support" });
  await dialog.getByRole("button", { name: new RegExp(title) }).click();
  await dialog.getByText("pl: A public staff answer", { exact: true }).first().waitFor();
  if ((await dialog.innerText()).includes("PRIVATE STAFF NOTE"))
    throw new Error("Widget note leak");
  const composer = dialog.getByRole("textbox", { name: /^Message/ });
  let releaseSend;
  let sendEntered;
  const enteredSend = new Promise((resolve) => {
    sendEntered = resolve;
  });
  const sendGate = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const pendingHandler = async (route) => {
    const response = await route.fetch();
    sendEntered();
    await sendGate;
    await route.fulfill({ response });
  };
  await user.route("**/trpc/support.sendMessage*", pendingHandler);
  await composer.fill("Submitted while waiting");
  await dialog.getByRole("button", { name: "Send message", exact: true }).click();
  await enteredSend;
  await composer.fill("New draft typed during send");
  releaseSend();
  await expect(dialog.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  await expect(composer).toHaveValue("New draft typed during send");
  await user.unroute("**/trpc/support.sendMessage*", pendingHandler);
  const submittedRequests = [];
  const lostResponseHandler = async (route) => {
    submittedRequests.push(route.request().postData());
    const response = await route.fetch();
    if (submittedRequests.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  };
  await user.route("**/trpc/support.sendMessage*", lostResponseHandler);
  await composer.fill("Recover this exact failed send");
  await dialog.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Close support", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await user.getByRole("button", { name: /Contact support|Support: \d+ unread/ }).click();
  await expect(composer).toHaveValue("Recover this exact failed send");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  if (submittedRequests.length !== 2 || submittedRequests[0] !== submittedRequests[1])
    throw new Error("Close/reopen Retry changed the failed command identity or payload");
  const recovered = await customer.call("getCase", { id: item.id });
  if (
    recovered.messages.filter((message) => message.body === "Recover this exact failed send")
      .length !== 1
  )
    throw new Error("Lost-response Retry duplicated a message");
  await user.unroute("**/trpc/support.sendMessage*", lostResponseHandler);
  await dialog.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect
    .poll(async () => (await customer.call("getCase", { id: item.id })).case.unreadCount)
    .toBe(0);
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
    draftRecovery:
      "new text survived pending success; close/reopen retained draft and exact failed command; Retry avoided duplicate",
    readAcknowledgement: "displayed published message IDs cleared unread",
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
