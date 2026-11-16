import { mkdir, writeFile } from "node:fs/promises";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { expect, type Page, test } from "@playwright/test";
import { type ReferenceApp, startReference } from "../server/start";

let app: ReferenceApp;
const topology = process.env.REFERENCE_TOPOLOGY === "shared" ? "shared" : "local";
const artifactRoot = `/tmp/m5kdev-implement-88/99-artifacts/${topology}`;
const results: { title: string; status: string | undefined }[] = [];
let assetPaths: string[] = [];
test.beforeAll(async () => {
  await mkdir(artifactRoot, { recursive: true });
  app = await startReference(topology);
});
test.afterEach(async ({}, info) => {
  results.push({ title: info.title, status: info.status });
});
test.afterAll(async () => {
  if (app)
    try {
      await writeFile(
        `${artifactRoot}/summary.json`,
        JSON.stringify(
          {
            topology,
            origins: app.origins,
            assetPaths,
            results,
            stripe: app.creates.map(({ kind, params }) => ({
              kind,
              experience: params.get("metadata[referenceExperience]"),
              configuration: params.get("configuration"),
              customer: params.get("customer"),
            })),
          },
          null,
          2
        )
      );
    } finally {
      await app.close();
    }
});

async function login(page: Page, brand = "alpha") {
  await page.goto(`${app.origins[brand]}/login`);
  await page.getByLabel("Email", { exact: true }).fill("person@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Reference-Password-123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByTestId("shell")).toBeVisible();
}
test("one compiled artifact preserves selected product before authentication and accepts supplied matching descriptors", async ({
  page,
}) => {
  const assets: string[] = [];
  for (const [id, name, product] of [
    ["alpha", "Alpha Reports", "reports"],
    ["beta", "Beta Assistant", "assistant"],
    ["partner", "Partner Reports", "reports"],
  ]) {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/get-session*", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${app.origins[id]}/login`);
    assets.push((await page.locator("script[src]").first().getAttribute("src")) ?? "");
    await expect(page.getByTestId("brand")).toHaveText(name);
    await expect(page.getByTestId("product")).toHaveText(product);
    await expect(page.getByText("Checking session", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${artifactRoot}/${id}-loading.png`, fullPage: true });
    release();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
  }
  assetPaths = assets;
  expect(new Set(assets).size).toBe(1);
  expect(assets[0]).toMatch(/^\/assets\/index-.*\.js$/);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const supplied = await page.goto(`${app.origins.partner}/supplied`);
  expect(supplied?.headers()["cache-control"]).toBe("private, no-store");
  await expect(page.getByTestId("brand")).toHaveText("Partner Reports");
  await expect(page.getByTestId("shell")).toBeHidden();
  expect(requests.some((url) => url.includes("/app/experience"))).toBe(false);
});
test("mounted Organization switches withhold old allowance and subscription, preserving brand and saved preferences", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "reports", exact: true }).click();
  await expect(page.getByTestId("subscription")).toHaveText("Reports");
  await expect(page.getByTestId("decision")).toContainText('"allowed":true');
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/trpc/**", async (route) => {
    if (
      route.request().url().includes("getEntitlements") ||
      route.request().url().includes("getActiveSubscription")
    )
      await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "unpaid", exact: true }).click();
  await expect(page.getByTestId("active-org")).toHaveText("org_unpaid");
  await expect(page.getByTestId("decision")).toContainText('"allowed":false');
  await expect(page.getByTestId("paid")).toBeHidden();
  release();
  await expect(page.getByTestId("plans")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByTestId("brand")).toHaveText("Alpha Reports");
  await expect(page.getByTestId("locale")).toHaveText("en-GB");
  await expect(page.getByTestId("preferences")).toHaveText('{"compactMode":true}');
  await mkdir("/tmp/m5kdev-implement-88/99-artifacts", { recursive: true });
  await page.screenshot({
    path: `${artifactRoot}/unpaid.png`,
    fullPage: true,
  });
  await writeFile(`${artifactRoot}/unpaid.html`, await page.content());
});

test("the same real operation keeps Actor, Entitlement and Grant authority across brands", async ({
  page,
}) => {
  for (const [brand, name] of [
    ["alpha", "Alpha Reports"],
    ["beta", "Beta Assistant"],
    ["partner", "Partner Reports"],
  ]) {
    await login(page, brand);
    await page
      .getByRole("link", {
        name: brand === "beta" ? "Assistant workspace" : "Reports workspace",
        exact: true,
      })
      .click();
    await expect(page.getByTestId("workflow")).toHaveText(
      brand === "beta" ? "Assistant workflow" : "Reports workflow"
    );
    for (const org of ["reports", "combined", "exempt"]) {
      await page.getByRole("button", { name: org, exact: true }).click();
      await expect(page.getByTestId("active-org")).toHaveText(`org_${org}`);
      await expect(page.getByTestId("decision")).toContainText('"allowed":true');
      await page.getByRole("button", { name: "Publish report", exact: true }).click();
      await expect(page.getByTestId("action")).toHaveText("Published");
      await expect(page.getByTestId("brand")).toHaveText(name);
    }
    await page.getByRole("button", { name: "unpaid", exact: true }).click();
    await expect(page.getByTestId("decision")).toContainText('"allowed":false');
    await expect(page.getByRole("button", { name: "Publish report", exact: true })).toBeHidden();
    const denied = await page.evaluate(
      async ({ url, body }) => {
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body,
        });
        return { status: response.status, body: await response.text() };
      },
      {
        url: `${app.built.config.app.experienceRegistry!.get(brand).apiOrigin}/trpc/reference.publish?batch=1`,
        body: JSON.stringify({ "0": transformer.serialize({ organizationId: "org_unpaid" }) }),
      }
    );
    expect(denied.status).toBe(403);
    expect(denied.body).not.toContain("published");
    await page.getByRole("button", { name: "denied", exact: true }).click();
    await expect(page.getByTestId("decision")).toContainText('"allowed":true');
    await page.getByRole("button", { name: "Publish report", exact: true }).click();
    await expect(page.getByTestId("action")).toHaveText("Action denied");
    await expect(page.getByTestId("brand")).toHaveText(name);
    await page.screenshot({
      path: `${artifactRoot}/${brand}.png`,
      fullPage: true,
    });
  }
});
test("Plan changes and failed refetches retain identity without exposing stale public-hook allowance", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "reports", exact: true }).click();
  await expect(page.getByTestId("assistant")).toContainText('"allowed":false');
  await app.changePlan("reports", "price_combined");
  await page.getByRole("button", { name: "Refresh access", exact: true }).click();
  await expect(page.getByTestId("assistant")).toContainText('"allowed":true');
  await expect(page.getByTestId("subscription")).toHaveText("Combined");
  await page.route("**/trpc/**", async (route) => {
    if (route.request().url().includes("getEntitlements"))
      return route.fulfill({ status: 503, body: "Service unavailable" });
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh access", exact: true }).click();
  await expect(page.getByTestId("decision")).toContainText('"isError":true');
  await expect(page.getByTestId("decision")).toContainText('"allowed":false');
  await expect(page.getByTestId("plans")).toBeHidden();
  await expect(page.getByTestId("brand")).toHaveText("Alpha Reports");
  await expect(page.getByTestId("locale")).toHaveText("en-GB");
  await expect(page.getByTestId("preferences")).toHaveText('{"compactMode":true}');
});

test("shared billing controls POST the initiating Experience before external navigation", async ({
  page,
}) => {
  await page.route("https://recorded-stripe.example.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Recording Stripe boundary" })
  );
  await login(page, "beta");
  await page.getByRole("button", { name: "unpaid", exact: true }).click();
  await expect(page.getByTestId("plans")).toBeVisible();
  const checkout = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("billing.startCheckout")
  );
  await page.getByText("Subscribe", { exact: true }).click();
  const request = await checkout;
  expect(request.headers().origin).toBe(app.origins.beta);
  await expect(page).toHaveURL(/recorded-stripe\.example\.test\/checkout/);
  const created = app.creates.filter((item) => item.kind === "checkout").at(-1);
  expect(created?.params.get("metadata[referenceExperience]")).toBe("beta");
  await page.goto(app.origins.beta);
  await page.getByRole("button", { name: "combined", exact: true }).click();
  await expect(page.getByTestId("subscription")).toHaveText("Combined");
  const portal = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("billing.startPortal")
  );
  await page.getByRole("button", { name: "Manage subscription", exact: true }).click();
  expect((await portal).headers().origin).toBe(app.origins.beta);
  await expect(page).toHaveURL(/recorded-stripe\.example\.test\/portal/);
  expect(
    app.creates
      .filter((item) => item.kind === "portal")
      .at(-1)
      ?.params.get("configuration")
  ).toBe("bpc_beta");
});

test("Subscription-only failures show an error while healthy Entitlements remain separate", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "reports", exact: true }).click();
  await expect(page.getByTestId("paid")).toBeVisible();
  await expect(page.getByTestId("decision")).toContainText('"allowed":true');
  await page.route("**/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname.split("/trpc/")[1]?.split(",") ?? [];
    if (!names.includes("billing.getActiveSubscription")) return route.continue();
    // Preserve real sibling query results when tRPC batches the failing operation.
    const upstream = new URL(route.request().url());
    const authority = upstream.host;
    upstream.hostname = "127.0.0.1";
    const response = await route.fetch({
      url: upstream.href,
      headers: { ...route.request().headers(), host: authority },
    });
    const data = await response.json();
    const result = data.map((item: unknown, index: number) =>
      names[index] === "billing.getActiveSubscription"
        ? {
            error: transformer.serialize({
              message: "Recording subscription failure",
              code: -32603,
              data: {
                code: "INTERNAL_SERVER_ERROR",
                httpStatus: 500,
                path: "billing.getActiveSubscription",
              },
            }),
          }
        : item
    );
    return route.fulfill({ response, status: 207, json: result });
  });
  await page.getByRole("button", { name: "Refresh subscription", exact: true }).click();
  await expect(page.getByTestId("billing-error")).toBeVisible();
  await page.screenshot({ path: `${artifactRoot}/billing-error.png`, fullPage: true });
  await writeFile(`${artifactRoot}/billing-error.html`, await page.content());
  await expect(page.getByTestId("paid")).toBeHidden();
  await expect(page.getByTestId("plans")).toBeHidden();
  await expect(page.getByTestId("decision")).toContainText('"allowed":true');
  await expect(page.getByTestId("decision")).toContainText('"isError":false');
  await expect(page.getByTestId("brand")).toHaveText("Alpha Reports");
});
