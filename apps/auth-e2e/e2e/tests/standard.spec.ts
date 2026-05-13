import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  authFetch,
  clearEmails,
  createProvisionedClaimUser,
  emailUrl,
  expectLoginRejected,
  getUserState,
  latestEmail,
  login,
  logout,
  profiles,
  resetTokenFrom,
  signUp,
  verifyLatestEmail,
} from "./helpers";

const profile = "standard" as const;
const enterpriseOrgId = "auth-e2e-enterprise-standard";

async function createVerifiedAccount(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string
) {
  await signUp(page, email, password);
  await verifyLatestEmail(request, profile, email);
}

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("signup, verification email, login, protected app, and logout", async ({ page, request }) => {
  const email = `signup.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login/);

  await signUp(page, email, password);
  await expect(page.getByText(/verification email sent/i)).toBeVisible();

  const verification = await latestEmail(request, profile, {
    to: email,
    templateId: "verification",
  });
  await request.get(emailUrl(verification));

  await login(page, email, password);
  await expect(page.getByRole("heading", { name: /editorial posts/i })).toBeVisible();
  await expect(page.getByText(/small blog that protects auth changes/i)).toBeVisible();

  await logout(page);
});

test("password reset changes credentials through stored email", async ({ page, request }) => {
  const email = `reset.${Date.now()}@auth-e2e.local`;
  const oldPassword = "password1234";
  const newPassword = "password5678";

  await createVerifiedAccount(page, request, email, oldPassword);

  await page.goto("/forgot-password");
  await page.locator('[name="forgot-password-email"]').fill(email);
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

  const resetEmail = await latestEmail(request, profile, {
    to: email,
    templateId: "password-reset",
  });
  const token = resetTokenFrom(emailUrl(resetEmail));

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await page.locator('[name="reset-password-new"]').fill(newPassword);
  await page.locator('[name="reset-password-confirm"]').fill(newPassword);
  await page.getByRole("button", { name: /reset password/i }).click();
  await expect(page.getByText(/password reset successfully/i)).toBeVisible();

  await expectLoginRejected(page, email, oldPassword);
  await login(page, email, newPassword);
});

test("invalid reset and verification tokens are rejected", async ({ page, request }) => {
  await page.goto("/reset-password?token=invalid-reset-token");
  await page.locator('[name="reset-password-new"]').fill("password5678");
  await page.locator('[name="reset-password-confirm"]').fill("password5678");
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/reset-password") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /reset password/i }).click();
  const resetResponse = await resetResponsePromise;
  expect(
    resetResponse.ok(),
    `${resetResponse.status()} ${resetResponse.statusText()}: ${await resetResponse.text()}`
  ).toBe(false);

  const verificationUrl = new URL(`${profiles.standard.serverUrl}/api/auth/verify-email`);
  verificationUrl.searchParams.set("token", "invalid-verification-token");
  verificationUrl.searchParams.set("callbackURL", `${profiles.standard.webUrl}/login`);
  const verificationResponse = await request.get(verificationUrl.toString(), { maxRedirects: 0 });
  expect(verificationResponse.ok()).toBe(false);
});

test("duplicate signup with an existing email is rejected", async ({ page, request }) => {
  const email = `duplicate.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);

  await page.goto("/signup");
  await page.locator('[name="signup-email"]').fill(email);
  await page.locator('[name="signup-password"]').fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-up/email") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /sign up/i }).click();
  const response = await responsePromise;
  expect(
    response.ok(),
    `${response.status()} ${response.statusText()}: ${await response.text()}`
  ).toBe(false);
});

test("organization invite email lets a new user join without creating a separate org", async ({
  page,
  request,
}) => {
  const invitee = `member.${Date.now()}@auth-e2e.local`;

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/organization/members");
  await page.locator('input[type="email"]').fill(invitee);
  await page.getByRole("button", { name: /invite/i }).click();

  const invite = await latestEmail(request, profile, {
    to: invitee,
    templateId: "organization-invite",
  });

  await logout(page);
  await page.goto(emailUrl(invite));
  await expect(page).toHaveURL(/\/signup/);
  await page.locator('[name="signup-password"]').fill("password1234");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByTestId("session-email")).toContainText(invitee);

  const state = await getUserState(request, profile, invitee);
  expect(state.user.emailVerified).toBe(true);
  expect(state.organizations.map((organization) => organization.id)).toEqual([enterpriseOrgId]);
  expect(state.latestSession?.activeOrganizationId).toBe(enterpriseOrgId);
});

test("organization invite lets an existing user join an additional org", async ({
  page,
  request,
}) => {
  const email = `existing-member.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);
  const beforeInvite = await getUserState(request, profile, email);
  expect(beforeInvite.organizations).toHaveLength(1);
  expect(beforeInvite.organizations[0]?.id).not.toBe(enterpriseOrgId);

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/organization/members");
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: /invite/i }).click();

  const invite = await latestEmail(request, profile, {
    to: email,
    templateId: "organization-invite",
  });

  await logout(page);
  await login(page, email, password);
  await page.goto(emailUrl(invite));

  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.organizations.length;
    })
    .toBe(2);

  const afterInvite = await getUserState(request, profile, email);
  expect(afterInvite.organizations.map((organization) => organization.id)).toContain(
    enterpriseOrgId
  );
  expect(afterInvite.latestSession?.activeOrganizationId).toBe(enterpriseOrgId);
});

test("admin creates, bans, unbans, and authenticates a user", async ({ page, request }) => {
  const email = `admin-created.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: /create user/i }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/enter user's name/i).fill("Admin Created User");
  await dialog.getByPlaceholder(/enter user's email/i).fill(email);
  await dialog.getByPlaceholder(/enter password/i).fill(password);
  await dialog.getByRole("button", { name: /^create user$/i }).click();

  const createdRow = page.getByRole("row").filter({ hasText: email });
  await expect(createdRow).toBeVisible();
  await createdRow.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: /^ban$/i }).click();

  const banDialog = page.getByRole("dialog");
  await banDialog.getByLabel(/ban reason/i).fill("E2E status update");
  await banDialog.getByRole("button", { name: /^ban user$/i }).click();
  await expect(createdRow.getByText(/banned/i)).toBeVisible();

  await createdRow.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: /^unban$/i }).click();
  await expect(createdRow.getByText(/active/i)).toBeVisible();

  const createdState = await getUserState(request, profile, email);
  expect(createdState.user.role).toBe("user");
  const setRoleResponse = await authFetch(page, profile, "/api/auth/admin/set-role", {
    method: "POST",
    body: {
      userId: createdState.user.id,
      role: "admin",
    },
  });
  expect(
    setRoleResponse.ok,
    `${setRoleResponse.status} ${setRoleResponse.statusText}: ${setRoleResponse.text}`
  ).toBe(true);

  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.user.role;
    })
    .toBe("admin");

  await logout(page);
  const verificationResponse = await request.post(
    `${profiles.standard.serverUrl}/api/auth/send-verification-email`,
    {
      data: {
        email,
        callbackURL: `${profiles.standard.webUrl}/login`,
      },
    }
  );
  expect(verificationResponse.ok()).toBe(true);
  const verification = await latestEmail(request, profile, {
    to: email,
    templateId: "verification",
  });
  await request.get(emailUrl(verification));
  await login(page, email, password);
  const adminListResponse = await authFetch(page, profile, "/api/auth/admin/list-users");
  expect(
    adminListResponse.ok,
    `${adminListResponse.status} ${adminListResponse.statusText}: ${adminListResponse.text}`
  ).toBe(true);
});

test("admin manages organization members from organization admin", async ({ page, request }) => {
  const email = `admin-org-member.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);
  const beforeMembership = await getUserState(request, profile, email);
  expect(beforeMembership.organizations.map((organization) => organization.id)).not.toContain(
    enterpriseOrgId
  );

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/admin/organizations");
  await page.locator('input[name="search"]').fill("Auth E2E Enterprise standard");

  const organizationRow = page.getByRole("row").filter({
    hasText: "Auth E2E Enterprise standard",
  });
  await expect(organizationRow).toBeVisible();
  await organizationRow.getByLabel(/manage members/i).click();

  const dialog = page.getByRole("dialog").filter({ hasText: "Manage Members" });
  await expect(dialog.getByText("Auth E2E Enterprise standard")).toBeVisible();
  await dialog.getByText("Select user", { exact: true }).click();
  await page.getByPlaceholder("Search users...").fill(email);
  await page.getByRole("option", { name: new RegExp(email) }).click();
  await dialog.getByRole("button", { name: /add member/i }).click();

  const memberRow = dialog.getByRole("row").filter({ hasText: email });
  await expect(memberRow).toBeVisible();
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return (
        state.organizations.find((organization) => organization.id === enterpriseOrgId)?.role ??
        null
      );
    })
    .toBe("member");

  await memberRow.getByRole("button", { name: `Member Role for ${email}` }).click();
  await page.getByRole("option", { name: /^Admin$/ }).click();
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return (
        state.organizations.find((organization) => organization.id === enterpriseOrgId)?.role ??
        null
      );
    })
    .toBe("admin");

  await memberRow.getByRole("button", { name: `Remove ${email}` }).click();
  await expect(memberRow).toBeHidden();
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.organizations.some((organization) => organization.id === enterpriseOrgId);
    })
    .toBe(false);
});

test("non-admin users cannot call admin auth APIs", async ({ page, request }) => {
  const email = `non-admin.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);
  await login(page, email, password);

  const response = await authFetch(page, profile, "/api/auth/admin/list-users");
  expect(response.ok, `${response.status} ${response.statusText}: ${response.text}`).toBe(false);
  expect([401, 403]).toContain(response.status);
});

test("session management endpoints list and revoke sessions", async ({ page, request }) => {
  const email = `sessions.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);
  await login(page, email, password);

  const listResponse = await authFetch(page, profile, "/api/auth/list-sessions");
  expect(
    listResponse.ok,
    `${listResponse.status} ${listResponse.statusText}: ${listResponse.text}`
  ).toBe(true);
  expect(Array.isArray(listResponse.json)).toBe(true);
  expect((listResponse.json as unknown[]).length).toBeGreaterThanOrEqual(1);

  const revokeResponse = await authFetch(page, profile, "/api/auth/revoke-other-sessions", {
    method: "POST",
    body: {},
  });
  expect(
    revokeResponse.ok,
    `${revokeResponse.status} ${revokeResponse.statusText}: ${revokeResponse.text}`
  ).toBe(true);
});

test("delete account request stores a verification email", async ({ page, request }) => {
  const email = `delete.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedAccount(page, request, email, password);
  await login(page, email, password);

  const deleteResponse = await authFetch(page, profile, "/api/auth/delete-user", {
    method: "POST",
    body: {
      callbackURL: `${profiles.standard.webUrl}/login`,
    },
  });
  expect(
    deleteResponse.ok,
    `${deleteResponse.status} ${deleteResponse.statusText}: ${deleteResponse.text}`
  ).toBe(true);

  const deletionEmail = await latestEmail(request, profile, {
    to: email,
    templateId: "account-deletion",
  });
  expect(deletionEmail.subject).toContain("Delete your account");
  expect(deletionEmail.html).toContain("Confirm account deletion");
  expect(emailUrl(deletionEmail)).toContain("/api/auth/delete-user/callback");
});

test("admin can create and switch to a child organization from an enterprise org", async ({
  page,
  request,
}) => {
  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/organization/manage");
  const childOrgName = `Child Org ${Date.now()}`;
  await page.getByRole("button", { name: /new organization/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/acme subsidiary/i).fill(childOrgName);
  await dialog.getByRole("button", { name: /create organization/i }).click();
  await expect(page.getByText(childOrgName)).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: childOrgName });
  await row.getByRole("button", { name: /switch/i }).click();

  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, profiles.standard.adminEmail);
      return state.latestSession?.activeOrganizationId ?? null;
    })
    .not.toBe(enterpriseOrgId);
});

test("account claim magic link sets real credentials", async ({ page, request }) => {
  const provisionedEmail = `claim.${Date.now()}@provisioned.auth-e2e.local`;
  const claimedEmail = `claimed.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createProvisionedClaimUser(request, profile, provisionedEmail);

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/admin/users");
  await page.locator('input[name="search"]').fill(provisionedEmail);

  const provisionedRow = page.getByRole("row").filter({ hasText: provisionedEmail });
  await expect(provisionedRow).toBeVisible();
  await provisionedRow.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: /generate magic login link/i }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/claim email/i).fill(claimedEmail);
  await dialog.getByRole("button", { name: /^generate link$/i }).click();
  const generatedLink = dialog.getByLabel(/generated link/i);
  await expect(generatedLink).not.toHaveValue("");
  const magicLink = await generatedLink.inputValue();

  await logout(page);
  await page.goto(magicLink);
  await expect(page.getByText(/claim your account/i)).toBeVisible();
  await page.getByLabel(/set password/i).fill(password);
  const setPasswordResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/set-password") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /set password and claim/i }).click();
  const response = await setPasswordResponse;
  expect(
    response.ok(),
    `${response.status()} ${response.statusText()}: ${await response.text()}`
  ).toBe(true);

  await logout(page);
  await login(page, claimedEmail, password);

  const claimedState = await getUserState(request, profile, claimedEmail);
  expect(claimedState.user.emailVerified).toBe(true);
  expect(claimedState.credentialAccount).toBe(true);
  expect(claimedState.pendingAccountClaims).toBe(0);
  expect(claimedState.acceptedAccountClaims).toBeGreaterThanOrEqual(1);
  expect(claimedState.organizations).toHaveLength(1);
});

test("account claim magic link rejects an email that already belongs to a user", async ({
  page,
  request,
}) => {
  const provisionedEmail = `claim-conflict.${Date.now()}@provisioned.auth-e2e.local`;
  await createProvisionedClaimUser(request, profile, provisionedEmail);

  await login(page, profiles.standard.adminEmail, profiles.standard.adminPassword);
  await page.goto("/admin/users");
  await page.locator('input[name="search"]').fill(provisionedEmail);

  const provisionedRow = page.getByRole("row").filter({ hasText: provisionedEmail });
  await expect(provisionedRow).toBeVisible();
  await provisionedRow.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: /generate magic login link/i }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/claim email/i).fill(profiles.standard.adminEmail);
  await dialog.getByRole("button", { name: /^generate link$/i }).click();
  await expect(page.getByText(/failed to generate magic link/i)).toBeVisible();
  await expect(dialog.getByLabel(/generated link/i)).toHaveValue("");
});
