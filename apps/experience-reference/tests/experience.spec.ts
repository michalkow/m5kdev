import { mkdir, writeFile } from "node:fs/promises";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { expect, type Page, test } from "@playwright/test";
import { type ReferenceApp, startReference } from "../server/start";

let app: ReferenceApp;
const topology = process.env.REFERENCE_TOPOLOGY === "shared" ? "shared" : "local";
const artifactRoot = `${process.env.REFERENCE_ARTIFACT_ROOT ?? "/tmp/m5kdev-implement-88/99-artifacts"}/${topology}`;
const results: { title: string; status: string | undefined }[] = [];
let assetPaths: string[] = [];
const cookieEvidence: Record<string, unknown>[] = [];
const descriptors: Record<string, unknown>[] = [];
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
            descriptors,
            cookies: cookieEvidence,
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
  cookieEvidence.push({
    brand,
    cookies: (await page.context().cookies(app.definitions[brand].apiOrigin)).map(
      ({ name, domain, path, httpOnly, sameSite, secure }) => ({
        name,
        domain,
        path,
        httpOnly,
        sameSite,
        secure,
      })
    ),
  });
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
    const descriptorResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/app/experience"
    );
    await page.goto(`${app.origins[id]}/login`);
    const response = await descriptorResponse;
    descriptors.push({
      entered: id,
      value: await response.json(),
      cacheControl: response.headers()["cache-control"],
      vary: response.headers().vary,
    });
    assets.push((await page.locator("script[src]").first().getAttribute("src")) ?? "");
    await expect(page.getByTestId("brand")).toHaveText(name);
    await expect(page.getByTestId("product")).toHaveText(product);
    await expect(page.getByText("Checking session", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${artifactRoot}/${id}-loading.png`,
      fullPage: true,
    });
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
        body: JSON.stringify({
          "0": transformer.serialize({ organizationId: "org_unpaid" }),
        }),
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
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "Recording Stripe boundary",
    })
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
  await page.screenshot({
    path: `${artifactRoot}/billing-error.png`,
    fullPage: true,
  });
  await writeFile(`${artifactRoot}/billing-error.html`, await page.content());
  await expect(page.getByTestId("paid")).toBeHidden();
  await expect(page.getByTestId("plans")).toBeHidden();
  await expect(page.getByTestId("decision")).toContainText('"allowed":true');
  await expect(page.getByTestId("decision")).toContainText('"isError":false');
  await expect(page.getByTestId("brand")).toHaveText("Alpha Reports");
});

test("Organization read screens keep members scoped across an in-place switch", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${app.origins.alpha}/members`);
  await page.getByRole("button", { name: "reports", exact: true }).click();
  await expect(page.getByText("reports guest", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "combined", exact: true }).click();
  await expect(page.getByTestId("active-org")).toHaveText("org_combined");
  await expect(page.getByText("combined guest", { exact: true })).toBeVisible();
  await expect(page.getByText("reports guest", { exact: true })).toBeHidden();
});
test("Organization read screens keep preferences scoped across an in-place switch", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${app.origins.alpha}/organization-preferences`);
  await page.getByRole("button", { name: "reports", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Reference office" })).toBeChecked();
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("auth.setOrganizationPreferences")
  );
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  const request = await sent;
  const body = request.postDataJSON();
  expect(transformer.deserialize(body["0"])).toMatchObject({
    organizationId: "org_reports",
    referenceOffice: true,
  });
  await page.getByRole("button", { name: "combined", exact: true }).click();
  await expect(page.getByTestId("active-org")).toHaveText("org_combined");
  await expect(page.getByRole("switch", { name: "Reference office" })).not.toBeChecked();
});

test("local File browser upload and download stay reachable from the initiating unrelated product", async ({
  page,
}) => {
  await login(page, "beta");
  const apiOrigin = app.built.config.app.experienceRegistry!.get("beta").apiOrigin;
  const input = transformer.serialize({
    originalName: "from-beta.png",
    contentType: "image/png",
    sizeBytes: 9,
  });
  const started = await page.evaluate(
    async ({ apiOrigin, input }) => {
      const response = await fetch(`${apiOrigin}/trpc/file.user.initiate?batch=1`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "0": input }),
      });
      return { status: response.status, body: await response.json() };
    },
    { apiOrigin, input }
  );
  expect(started.status).toBe(200);
  const { fileSchemas } = await import("@m5kdev/backend/modules/file/file.dto");
  const file = fileSchemas.output.initiate.parse(
    transformer.deserialize(started.body[0].result.data)
  );
  const put = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: "PUT",
      body: "from beta",
      headers: { "content-type": "image/png" },
    });
    return { status: response.status, body: await response.text() };
  }, file.url);
  expect(put.status).toBe(200);
  const finalized = await page.evaluate(
    async ({ apiOrigin, input }) => {
      const response = await fetch(`${apiOrigin}/trpc/file.user.finalize?batch=1`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "0": input }),
      });
      return response.status;
    },
    { apiOrigin, input: transformer.serialize({ fileId: file.fileId }) }
  );
  expect(finalized).toBe(200);
  const fetched = await page.evaluate(
    async ({ apiOrigin, input }) => {
      const response = await fetch(
        `${apiOrigin}/trpc/file.user.getDownloadUrl?input=${encodeURIComponent(JSON.stringify(input))}`,
        { credentials: "include" }
      );
      return { status: response.status, body: await response.json() };
    },
    { apiOrigin, input: transformer.serialize({ fileId: file.fileId }) }
  );
  expect(fetched.status).toBe(200);
  const download = fileSchemas.output.downloadUrl.parse(
    transformer.deserialize(fetched.body.result.data)
  );
  const actual = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, text: await response.text() };
  }, download.url);
  expect(actual).toEqual({ status: 200, text: "from beta" });
  const redirect = await visitWithBrowserCookie(page, `${apiOrigin}/files/${file.fileId}`, {
    origin: app.origins.beta,
  });
  expect(redirect.status).toBe(302);
  expect(redirect.headers["cache-control"]).toBe("private, no-store");
  const missing = await visitWithBrowserCookie(page, `${apiOrigin}/files/missing-file`, {
    origin: app.origins.beta,
  });
  expect(missing.status).toBe(404);
  expect(missing.headers["cache-control"]).toBe("private, no-store");
});

async function authRequest(
  page: Page,
  brand: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return page.evaluate(
    async ({ url, body, headers }) => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
    {
      url: `${app.definitions[brand].apiOrigin}/api/auth/${path}`,
      body,
      headers,
    }
  );
}
async function trpcRequest(
  page: Page,
  brand: string,
  path: string,
  input: unknown,
  method: "GET" | "POST" = "POST"
) {
  const serialized = transformer.serialize(input);
  const result = await page.evaluate(
    async ({ url, input, method }) => {
      const payload = JSON.stringify({ "0": input });
      const response = await fetch(
        method === "GET" ? `${url}?batch=1&input=${encodeURIComponent(payload)}` : `${url}?batch=1`,
        {
          method,
          credentials: "include",
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: payload } : {}),
        }
      );
      return {
        status: response.status,
        cache: response.headers.get("cache-control"),
        data: await response.json(),
      };
    },
    {
      url: `${app.definitions[brand].apiOrigin}/trpc/${path}`,
      input: serialized,
      method,
    }
  );
  return {
    ...result,
    data: result.data.map((row: { result?: { data: unknown }; error?: unknown }) =>
      row.result ? { result: transformer.deserialize(row.result.data) } : row
    ),
  };
}
async function storedEmail(to: string) {
  await expect.poll(async () => Boolean(await app.email.findLatestStoredEmail({ to }))).toBe(true);
  return (await app.email.findLatestStoredEmail({ to }))!;
}
function expectMail(
  mail: Awaited<ReturnType<typeof storedEmail>>,
  brand: string,
  authLink = false
) {
  expect(mail.from).toBe(`${brand} <${brand}@example.test>`);
  expect(mail.props.experience).toMatchObject({ id: brand });
  expect(mail.html).toContain(brand === "beta" ? "Beta Assistant" : "Alpha Reports");
  expect(mail.html).toContain('lang="en-GB"');
  expect(new URL(String(mail.props.url)).origin).toBe(
    authLink ? app.definitions[brand].apiOrigin : app.origins[brand]
  );
}

test("integrated A/B verification and recovery use real branded email, browser callbacks and final credential effects", async ({
  page,
}) => {
  for (const brand of ["alpha", "beta"]) {
    await page.context().clearCookies();
    await page.goto(`${app.origins[brand]}/login`);
    const email = `verified-${brand}@example.test`;
    const signup = await authRequest(
      page,
      brand,
      "sign-up/email",
      {
        name: "Verified",
        email,
        password: "Original-Password-123",
        callbackURL: `${app.origins[brand]}/login`,
      },
      { "User-Locale": "en_GB" }
    );
    expect(signup.status).toBe(200);
    const verification = await storedEmail(email);
    expectMail(verification, brand, true);
    await page.goto(String(verification.props.url));
    await expect(page).toHaveURL(
      new RegExp(`^${app.origins[brand].replaceAll(".", "\\.")}/login\\?experienceFlow=`)
    );
    const { eq } = await import("drizzle-orm");
    const { users } = await import("@m5kdev/backend/modules/auth/auth.db");
    expect((await app.orm.select().from(users).where(eq(users.email, email)))[0]).toMatchObject({
      emailVerified: true,
      locale: "en_GB",
    });
    expect(
      (
        await authRequest(page, brand, "sign-in/email", {
          email,
          password: "Original-Password-123",
        })
      ).status
    ).toBe(200);
    expect(
      (
        await authRequest(page, brand, "request-password-reset", {
          email,
          redirectTo: `${app.origins[brand]}/reset-password`,
        })
      ).status
    ).toBe(200);
    const recovery = await storedEmail(email);
    expect(recovery.templateId).toBe(`${brand}-passwordReset`);
    expectMail(recovery, brand, true);
    await page.goto(String(recovery.props.url));
    await expect(page).toHaveURL(/\/reset-password\?/);
    const callback = new URL(page.url());
    expect(callback.origin).toBe(app.origins[brand]);
    expect(callback.searchParams.get("experienceFlow")).toBeTruthy();
    const proof = callback.searchParams.get("experienceFlow")!;
    const token = callback.searchParams.get("token")!;
    expect(
      (
        await authRequest(
          page,
          brand,
          "reset-password",
          { token, newPassword: "Changed-Password-123" },
          { "X-M5kdev-Experience-Flow": proof }
        )
      ).status
    ).toBe(200);
    expect(
      (
        await authRequest(
          page,
          brand,
          "reset-password",
          { token, newPassword: "Replay-Password-123" },
          { "X-M5kdev-Experience-Flow": proof }
        )
      ).status
    ).toBe(400);
    expect(
      (
        await authRequest(page, brand, "sign-in/email", {
          email,
          password: "Changed-Password-123",
        })
      ).status
    ).toBe(200);
    await page.screenshot({
      path: `${artifactRoot}/${brand}-recovery.png`,
      fullPage: true,
    });
  }
});

test("integrated invitation, waitlist and exact account claim retain resource proof through actual browser and tRPC effects", async ({
  page,
}) => {
  const brand = "beta";
  await page.goto(`${app.origins[brand]}/login`);
  const invitation = (
    await app.auth.inviteOrganizationMember(
      { email: "integrated-invite@example.test", role: "member" },
      app.ownerContext(brand)
    )
  )._unsafeUnwrap();
  const inviteMail = await storedEmail("integrated-invite@example.test");
  expectMail(inviteMail, brand);
  const inviteUrl = new URL(String(inviteMail.props.url));
  const inviteInput = {
    id: inviteUrl.searchParams.get("id")!,
    experienceFlow: inviteUrl.searchParams.get("experienceFlow")!,
  };
  const read = await trpcRequest(page, brand, "auth.readInvitation", inviteInput, "GET");
  expect(read.status).toBe(200);
  expect(read.cache).toBe("private, no-store");
  const invited = await authRequest(
    page,
    brand,
    "sign-up/email",
    {
      name: "Invitee",
      email: "integrated-invite@example.test",
      password: "Invited-Password-123",
    },
    {
      "Organization-Invitation-Code": inviteInput.id,
      "X-M5kdev-Experience-Flow": inviteInput.experienceFlow,
    }
  );
  expect(invited.status).toBe(200);
  expect(
    (await app.auth.repository.organization.listOrganizationMembers("org_reports"))
      ._unsafeUnwrap()
      .find((m) => m.id === invitation.member.id)?.userId
  ).toBe(invited.data.user.id);
  const waitlist = (
    await app.auth.inviteToWaitlist(
      { email: "integrated-waitlist@example.test", name: "Waiting" },
      app.ownerContext("alpha")
    )
  )._unsafeUnwrap();
  await page.context().clearCookies();
  await page.goto(`${app.origins.alpha}/login`);
  const waitMail = await storedEmail("integrated-waitlist@example.test");
  expectMail(waitMail, "alpha");
  const waitUrl = new URL(String(waitMail.props.url));
  const waitInput = {
    code: waitUrl.searchParams.get("code")!,
    experienceFlow: waitUrl.searchParams.get("experienceFlow")!,
  };
  expect(
    (await trpcRequest(page, "alpha", "auth.validateWaitlistCode", waitInput, "GET")).data[0].result
  ).toMatchObject({ status: "VALID" });
  expect(
    (
      await authRequest(
        page,
        "alpha",
        "sign-up/email",
        {
          name: "Waiting",
          email: "integrated-waitlist@example.test",
          password: "Waitlist-Password-123",
        },
        {
          "Waitlist-Invitation-Code": waitInput.code,
          "X-M5kdev-Experience-Flow": waitInput.experienceFlow,
        }
      )
    ).status
  ).toBe(200);
  expect(waitlist.code).toBe(waitInput.code);
  const { users, accountClaims } = await import("@m5kdev/backend/modules/auth/auth.db");
  const { eq } = await import("drizzle-orm");
  await app.orm.insert(users).values({
    id: "integrated-provisioned",
    name: "Provisioned",
    email: "provisioned@example.test",
    emailVerified: false,
    role: "user",
    locale: "en_GB",
  });
  const claim = (
    await app.auth.createAccountClaimCode(
      { userId: "integrated-provisioned" },
      app.adminContext(brand)
    )
  )._unsafeUnwrap();
  const magic = (
    await app.auth.generateAccountClaimMagicLink(
      { claimId: claim.id, email: "claimed@example.test" },
      app.adminContext(brand)
    )
  )._unsafeUnwrap();
  await page.context().clearCookies();
  await page.goto(magic.url);
  await expect(page).toHaveURL(/\/claim-account\?/);
  const claimUrl = new URL(page.url());
  const continuation = {
    claimId: claim.id,
    experienceFlow: claimUrl.searchParams.get("claimFlow")!,
  };
  expect(claimUrl.origin).toBe(app.origins.beta);
  expect(continuation.experienceFlow).toBeTruthy();
  expect(
    (await trpcRequest(page, brand, "auth.getMyAccountClaimStatus", continuation, "GET")).data[0]
      .result
  ).toMatchObject({ id: claim.id });
  expect(
    (
      await authRequest(page, brand, "set-password", {
        newPassword: "Claimed-Password-123",
        ...continuation,
      })
    ).status
  ).toBe(200);
  expect((await trpcRequest(page, brand, "auth.acceptMyAccountClaim", continuation)).status).toBe(
    200
  );
  expect(
    (await app.orm.select().from(accountClaims).where(eq(accountClaims.id, claim.id)))[0].status
  ).toBe("ACCEPTED");
  await page.screenshot({
    path: `${artifactRoot}/beta-claim.png`,
    fullPage: true,
  });
});

async function visitWithBrowserCookie(
  page: Page,
  url: string,
  options: {
    origin?: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const { request } = await import("node:http");
  const parsed = new URL(url);
  const cookies = (await page.context().cookies(url)).map((c) => `${c.name}=${c.value}`).join("; ");
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: app.port,
        path: parsed.pathname + parsed.search,
        method: options.method ?? "GET",
        headers: {
          host: parsed.host,
          ...(cookies ? { cookie: cookies } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

test("integrated Connection callback and cancellation preserve selected return and User-owned private state", async ({
  page,
}) => {
  await login(page, "beta");
  const api = app.definitions.beta.apiOrigin;
  const started = await page.evaluate(
    async ({ api }) => {
      const response = await fetch(`${api}/connections/recording/start`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect: "/assistant?connections=1" }),
      });
      return {
        status: response.status,
        cache: response.headers.get("cache-control"),
        body: await response.json(),
      };
    },
    { api }
  );
  expect(started.status).toBe(200);
  expect(started.cache).toBe("private, no-store");
  const authorization = new URL(started.body.url);
  expect(authorization.searchParams.get("redirect_uri")).toBe(
    `${api}/connections/recording/callback`
  );
  const callback = `${api}/connections/recording/callback?state=${authorization.searchParams.get("state")}&code=accepted`;
  await page.route("https://provider.example.test/authorize**", (route) =>
    route.fulfill({ status: 302, headers: { location: callback } })
  );
  const callbackResponse = page.waitForResponse((response) => response.url() === callback);
  await page.goto(authorization.href);
  expect((await callbackResponse).status()).toBe(302);
  await expect(page).toHaveURL(
    `${app.origins.beta}/assistant?connections=1&connect_success=true&provider=recording`
  );
  const completedReturn = page.url();
  await expect(page.getByTestId("brand")).toHaveText("Beta Assistant");
  expect(app.exchanges.at(-1)?.get("redirect_uri")).toBe(`${api}/connections/recording/callback`);
  expect((await visitWithBrowserCookie(page, callback)).status).toBe(400);
  const { connect } = await import("@m5kdev/backend/modules/connect/connect.db");
  expect(await app.orm.select().from(connect)).toMatchObject([
    { userId: "person", provider: "recording" },
  ]);
  const cancellation = await visitWithBrowserCookie(
    page,
    `${api}/connections/recording/start?redirect=%2Fassistant`,
    { origin: app.origins.beta }
  );
  const state = new URL(String(cancellation.headers.location)).searchParams.get("state");
  const cancelled = await visitWithBrowserCookie(
    page,
    `${api}/connections/recording/callback?state=${state}&error=access_denied`
  );
  expect(cancelled.status).toBe(302);
  expect(cancelled.headers.location).toBe(
    `${app.origins.beta}/assistant?error=CONNECTION_FAILED&provider=recording`
  );
  await writeFile(
    `${artifactRoot}/connection.json`,
    JSON.stringify(
      {
        authorization: authorization.origin,
        callbackURI: authorization.searchParams.get("redirect_uri"),
        return: completedReturn,
        cancelReturn: cancelled.headers.location,
        exchangeCount: app.exchanges.length,
      },
      null,
      2
    )
  );
});

test("integrated actual Checkout and Portal returns reconcile before the original branded destination", async ({
  page,
}) => {
  await login(page, "beta");
  await page.getByRole("button", { name: "unpaid", exact: true }).click();
  await expect(page.getByTestId("active-org")).toHaveText("org_unpaid");
  const started = await trpcRequest(page, "beta", "billing.startCheckout", {
    organizationId: "org_unpaid",
    priceId: "price_reports",
    returnPath: "/assistant?checkout=done",
  });
  expect(started.status).toBe(200);
  const checkout = app.creates.at(-1)!;
  expect(checkout.kind).toBe("checkout");
  expect(checkout.params.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
  app.setPriceAtStripe("unpaid", "price_reports");
  const actualId = `recorded_${app.creates.length}`;
  const success = checkout.params.get("success_url")!.replace("{CHECKOUT_SESSION_ID}", actualId);
  const completed = await visitWithBrowserCookie(page, success);
  expect(completed.status).toBe(302);
  expect(completed.headers.location).toBe(`${app.origins.beta}/assistant?checkout=done`);
  await page.goto(String(completed.headers.location));
  await expect(page.getByTestId("subscription")).toHaveText("Reports");
  const portalStart = await trpcRequest(page, "beta", "billing.startPortal", {
    organizationId: "org_unpaid",
    returnPath: "/assistant?portal=done",
  });
  expect(portalStart.status).toBe(200);
  const portal = app.creates.at(-1)!;
  expect(portal.kind).toBe("portal");
  expect(portal.params.get("configuration")).toBe("bpc_beta");
  app.setPriceAtStripe("unpaid", "price_combined");
  const returned = await visitWithBrowserCookie(page, portal.params.get("return_url")!);
  expect(returned.status).toBe(302);
  expect(returned.headers.location).toBe(`${app.origins.beta}/assistant?portal=done`);
  await page.goto(String(returned.headers.location));
  await expect(page.getByTestId("subscription")).toHaveText("Combined");
  await writeFile(
    `${artifactRoot}/billing-returns.json`,
    JSON.stringify(
      {
        checkoutId: actualId,
        customer: checkout.params.get("customer"),
        checkoutReturn: completed.headers.location,
        portalReturn: returned.headers.location,
        portalConfiguration: portal.params.get("configuration"),
      },
      null,
      2
    )
  );
  await page.screenshot({
    path: `${artifactRoot}/beta-billing-return.png`,
    fullPage: true,
  });
});

test("integrated immediate and real Redis delayed A/B emails and signed trial webhook keep source presentation and live locale", async ({
  page,
}) => {
  await login(page, "alpha");
  const records = [];
  for (const brand of ["alpha", "beta"]) {
    const issued = (
      await app.auth.inviteOrganizationMember(
        { email: `delayed-${brand}@example.test`, role: "member" },
        app.ownerContext(brand)
      )
    )._unsafeUnwrap();
    const mail = await storedEmail(`delayed-${brand}@example.test`);
    expectMail(mail, brand);
    const url = new URL(String(mail.props.url));
    const jobId = await app.reminder.trigger({
      data: {
        invitationId: url.searchParams.get("id")!,
        experienceId: app.registry.get(brand).id,
        userId: "person",
        organizationId: "org_reports",
      },
    });
    records.push({ brand, jobId, memberId: issued.member.id });
  }
  for (const record of records) {
    await expect
      .poll(
        async () =>
          (
            await app.email.findLatestStoredEmail({
              to: `delayed-${record.brand}@example.test`,
            })
          )?.templateId
      )
      .toBe(`${record.brand}-reminder`);
    const mail = await storedEmail(`delayed-${record.brand}@example.test`);
    expectMail(mail, record.brand);
    const job = await app.workflow.service.getJob("main", record.jobId);
    expect(job?.data).toEqual({
      data: {
        invitationId: expect.any(String),
        experienceId: record.brand,
        userId: "person",
        organizationId: "org_reports",
      },
    });
  }
  app.recordTrial("cus_reports");
  const now = Math.floor(Date.now() / 1000);
  const body = {
    id: "evt_integrated_trial",
    object: "event",
    type: "customer.subscription.trial_will_end",
    livemode: false,
    data: {
      object: {
        id: "sub_cus_reports",
        customer: "cus_reports",
        status: "trialing",
        trial_start: now - 86400,
        trial_end: now + 3 * 86400,
        default_payment_method: null,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      },
    },
  };
  const webhook = await visitWithBrowserCookie(
    page,
    `${app.definitions.alpha.apiOrigin}/stripe/webhook`,
    {
      method: "POST",
      body,
      headers: { "stripe-signature": app.signWebhook(body) },
    }
  );
  expect(webhook.status).toBe(200);
  const warning = await storedEmail("person@example.test");
  expect(warning.templateId).toBe("beta-trialEnding");
  expect(warning.from).toBe("beta <beta@example.test>");
  expect(warning.html).toContain("Beta Assistant");
  expect(warning.html).toContain('lang="en-GB"');
  expect(String(warning.props.url)).toMatch(/^https:\/\/recorded-stripe\.example\.test\/portal\//);
  expect(app.creates.at(-1)?.params.get("configuration")).toBe("bpc_beta");
  await writeFile(
    `${artifactRoot}/communications.json`,
    JSON.stringify(
      {
        delayed: records,
        webhook: {
          status: webhook.status,
          template: warning.templateId,
          from: warning.from,
          locale: warning.props.htmlLang,
          portalReturn: new URL(app.creates.at(-1)!.params.get("return_url")!).pathname,
        },
      },
      null,
      2
    )
  );
});
