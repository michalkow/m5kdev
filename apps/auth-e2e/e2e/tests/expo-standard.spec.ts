import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  createExpoTrpcClient,
  expectExpoLoginRejected as expectExpoLoginRejectedNative,
  expoLogin as expoLoginNative,
  expoLogout as expoLogoutNative,
  expoSignUp as expoSignUpNative,
} from "./expo-helpers";
import {
  authFetch,
  clearEmails,
  createProvisionedClaimUser,
  emailUrl,
  getUserState,
  latestEmail,
  profiles,
  resetTokenFrom,
  seedOrganizations,
  verifyLatestEmail,
} from "./helpers";

const profile = "expoStandard" as const;
const enterpriseOrgId = "auth-e2e-enterprise-standard";

async function createVerifiedExpoAccount(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string
) {
  await expoSignUpNative(page, email, password);
  await verifyLatestEmail(request, profile, email);
}

async function expectAuthOk(response: Awaited<ReturnType<typeof authFetch>>) {
  expect(response.ok, `${response.status} ${response.statusText}: ${response.text}`).toBe(true);
}

async function inviteOrganizationMember(page: Page, email: string, role: "member" | "admin") {
  const response = await authFetch(page, profile, "/api/auth/organization/invite-member", {
    method: "POST",
    body: {
      organizationId: enterpriseOrgId,
      email,
      role,
    },
  });
  await expectAuthOk(response);
}

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("signup, verification email, login, protected app, and logout", async ({ page, request }) => {
  const email = `expo.signup.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login/);

  await expoSignUpNative(page, email, password);
  await expect(page.getByTestId("auth-status")).toContainText(/verification email sent/i);

  const verification = await latestEmail(request, profile, {
    to: email,
    templateId: "verification",
  });
  await request.get(emailUrl(verification));

  await expoLoginNative(page, email, password);
  await expect(page.getByText(/editorial posts/i)).toBeVisible();
  await expect(page.getByText(/small blog that protects auth changes/i)).toBeVisible();

  await expoLogoutNative(page);
});

test("password reset changes credentials through stored email", async ({ page, request }) => {
  const email = `expo.reset.${Date.now()}@auth-e2e.local`;
  const oldPassword = "password1234";
  const newPassword = "password5678";

  await createVerifiedExpoAccount(page, request, email, oldPassword);

  await page.goto("/forgot-password");
  await page.getByTestId("forgot-password-email").fill(email);
  const resetRequestPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/request-password-reset") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("forgot-password-submit").click();
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
  await page.getByTestId("reset-password-new").fill(newPassword);
  await page.getByTestId("reset-password-confirm").fill(newPassword);
  await page.getByTestId("reset-password-submit").click();
  await expect(page.getByTestId("auth-status")).toContainText(/password reset successfully/i);

  await expectExpoLoginRejectedNative(page, email, oldPassword);
  await expoLoginNative(page, email, newPassword);
});

test("invalid reset and verification tokens are rejected", async ({ page, request }) => {
  await page.goto("/reset-password?token=invalid-reset-token");
  await page.getByTestId("reset-password-new").fill("password5678");
  await page.getByTestId("reset-password-confirm").fill("password5678");
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/reset-password") && response.request().method() === "POST"
  );
  await page.getByTestId("reset-password-submit").click();
  const resetResponse = await resetResponsePromise;
  expect(
    resetResponse.ok(),
    `${resetResponse.status()} ${resetResponse.statusText()}: ${await resetResponse.text()}`
  ).toBe(false);

  const verificationUrl = new URL(`${profiles[profile].serverUrl}/api/auth/verify-email`);
  verificationUrl.searchParams.set("token", "invalid-verification-token");
  verificationUrl.searchParams.set("callbackURL", `${profiles[profile].webUrl}/login`);
  const verificationResponse = await request.get(verificationUrl.toString(), { maxRedirects: 0 });
  expect(verificationResponse.ok()).toBe(false);
});

test("duplicate signup with an existing email is rejected", async ({ page, request }) => {
  const email = `expo.duplicate.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);

  await expoSignUpNative(page, email, password);
  await expect(page.getByTestId("auth-status")).toBeVisible();
});

test("organization invite email lets a new user join without creating a separate org", async ({
  page,
  request,
}) => {
  const invitee = `expo.member.${Date.now()}@auth-e2e.local`;

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  await inviteOrganizationMember(page, invitee, "member");

  const invite = await latestEmail(request, profile, {
    to: invitee,
    templateId: "organization-invite",
  });

  await expoLogoutNative(page);
  await page.goto(emailUrl(invite));
  await expect(page).toHaveURL(/\/signup/);
  await page.getByTestId("signup-password").fill("password1234");
  await page.getByTestId("signup-submit").click();
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
  const email = `expo.existing-member.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);
  const beforeInvite = await getUserState(request, profile, email);
  expect(beforeInvite.organizations).toHaveLength(1);
  expect(beforeInvite.organizations[0]?.id).not.toBe(enterpriseOrgId);

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  await inviteOrganizationMember(page, email, "member");

  const invite = await latestEmail(request, profile, {
    to: email,
    templateId: "organization-invite",
  });

  await expoLogoutNative(page);
  await expoLoginNative(page, email, password);
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
  const email = `expo.admin-created.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  await expectAuthOk(
    await authFetch(page, profile, "/api/auth/admin/create-user", {
      method: "POST",
      body: {
        name: "Admin Created User",
        email,
        password,
        role: "user",
      },
    })
  );

  const createdState = await getUserState(request, profile, email);
  await expectAuthOk(
    await authFetch(page, profile, "/api/auth/admin/ban-user", {
      method: "POST",
      body: {
        userId: createdState.user.id,
        banReason: "E2E status update",
      },
    })
  );
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.user.banned;
    })
    .toBe(true);

  await expectAuthOk(
    await authFetch(page, profile, "/api/auth/admin/unban-user", {
      method: "POST",
      body: {
        userId: createdState.user.id,
      },
    })
  );
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.user.banned;
    })
    .toBe(false);

  await expectAuthOk(
    await authFetch(page, profile, "/api/auth/admin/set-role", {
      method: "POST",
      body: {
        userId: createdState.user.id,
        role: "admin",
      },
    })
  );
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.user.role;
    })
    .toBe("admin");

  await expoLogoutNative(page);
  const verificationResponse = await request.post(
    `${profiles[profile].serverUrl}/api/auth/send-verification-email`,
    {
      data: {
        email,
        callbackURL: `${profiles[profile].webUrl}/login`,
      },
    }
  );
  expect(verificationResponse.ok()).toBe(true);
  await verifyLatestEmail(request, profile, email);
  await expoLoginNative(page, email, password);

  const adminListResponse = await authFetch(page, profile, "/api/auth/admin/list-users");
  await expectAuthOk(adminListResponse);
});

test("admin manages organization members from organization admin", async ({ page, request }) => {
  const email = `expo.admin-org-member.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);
  const beforeMembership = await getUserState(request, profile, email);
  expect(beforeMembership.organizations.map((organization) => organization.id)).not.toContain(
    enterpriseOrgId
  );

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const users = await trpc.auth.searchAdminUsers.query({ q: email, limit: 10 });
  const user = users.rows.find((row) => row.email === email);
  expect(user).toBeTruthy();

  await trpc.auth.addAdminOrganizationMember.mutate({
    organizationId: enterpriseOrgId,
    userId: user?.id ?? "",
    role: "member",
  });
  const membersAfterAdd = await trpc.auth.listAdminOrganizationMembers.query({
    organizationId: enterpriseOrgId,
  });
  const member = membersAfterAdd.members.find((row) => row.user.email === email);
  expect(member).toBeTruthy();
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return (
        state.organizations.find((organization) => organization.id === enterpriseOrgId)?.role ??
        null
      );
    })
    .toBe("member");

  await trpc.auth.updateAdminOrganizationMemberRole.mutate({
    organizationId: enterpriseOrgId,
    memberId: member?.id ?? "",
    role: "admin",
  });
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return (
        state.organizations.find((organization) => organization.id === enterpriseOrgId)?.role ??
        null
      );
    })
    .toBe("admin");

  await trpc.auth.removeAdminOrganizationMember.mutate({
    organizationId: enterpriseOrgId,
    memberId: member?.id ?? "",
  });
  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, email);
      return state.organizations.some((organization) => organization.id === enterpriseOrgId);
    })
    .toBe(false);
});

test("admin organization pagination stays on the selected page", async ({ page, request }) => {
  const prefix = `Expo Pagination Org ${Date.now()}`;
  await seedOrganizations(request, profile, { prefix, count: 12 });

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const firstPage = await trpc.auth.listAdminOrganizations.query({
    q: prefix,
    page: 1,
    limit: 10,
  });
  expect(firstPage.total).toBe(12);
  expect(firstPage.rows).toHaveLength(10);

  const secondPage = await trpc.auth.listAdminOrganizations.query({
    q: prefix,
    page: 2,
    limit: 10,
  });
  expect(secondPage.total).toBe(12);
  expect(secondPage.rows).toHaveLength(2);
});

test("non-admin users cannot call admin auth APIs", async ({ page, request }) => {
  const email = `expo.non-admin.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);
  await expoLoginNative(page, email, password);

  const response = await authFetch(page, profile, "/api/auth/admin/list-users");
  expect(response.ok, `${response.status} ${response.statusText}: ${response.text}`).toBe(false);
  expect([401, 403]).toContain(response.status);
});

test("session management endpoints list and revoke sessions", async ({ page, request }) => {
  const email = `expo.sessions.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);
  await expoLoginNative(page, email, password);

  const listResponse = await authFetch(page, profile, "/api/auth/list-sessions");
  await expectAuthOk(listResponse);
  expect(Array.isArray(listResponse.json)).toBe(true);
  expect((listResponse.json as unknown[]).length).toBeGreaterThanOrEqual(1);

  const revokeResponse = await authFetch(page, profile, "/api/auth/revoke-other-sessions", {
    method: "POST",
    body: {},
  });
  await expectAuthOk(revokeResponse);
});

test("delete account request stores a verification email", async ({ page, request }) => {
  const email = `expo.delete.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  await createVerifiedExpoAccount(page, request, email, password);
  await expoLoginNative(page, email, password);

  const deleteResponse = await authFetch(page, profile, "/api/auth/delete-user", {
    method: "POST",
    body: {
      callbackURL: `${profiles[profile].webUrl}/login`,
    },
  });
  await expectAuthOk(deleteResponse);

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
  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const childOrg = await trpc.auth.createOrganization.mutate({
    name: `Expo Child Org ${Date.now()}`,
  });

  await expectAuthOk(
    await authFetch(page, profile, "/api/auth/organization/set-active", {
      method: "POST",
      body: {
        organizationId: childOrg.id,
      },
    })
  );

  await expect
    .poll(async () => {
      const state = await getUserState(request, profile, profiles[profile].adminEmail);
      return state.latestSession?.activeOrganizationId ?? null;
    })
    .not.toBe(enterpriseOrgId);
});

test("account claim magic link sets real credentials", async ({ page, request }) => {
  const provisionedEmail = `expo.claim.${Date.now()}@provisioned.auth-e2e.local`;
  const claimedEmail = `expo.claimed.${Date.now()}@auth-e2e.local`;
  const password = "password1234";

  const provisioned = await createProvisionedClaimUser(request, profile, provisionedEmail);

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const claim = await trpc.auth.createAccountClaimCode.mutate({
    userId: provisioned.user.id,
  });
  const magicLink = await trpc.auth.generateAccountClaimMagicLink.mutate({
    claimId: claim.id,
    email: claimedEmail,
  });

  await expoLogoutNative(page);
  await page.goto(magicLink.url);
  await expect(page.getByTestId("claim-status")).toContainText(/claim your account/i);
  await page.getByTestId("claim-password").fill(password);
  await page.getByTestId("claim-password-submit").click();
  await expect(page.getByTestId("claim-status")).toContainText(/account claimed/i);

  await expoLogoutNative(page);
  await expoLoginNative(page, claimedEmail, password);

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
  const provisionedEmail = `expo.claim-conflict.${Date.now()}@provisioned.auth-e2e.local`;
  const provisioned = await createProvisionedClaimUser(request, profile, provisionedEmail);

  await expoLoginNative(page, profiles[profile].adminEmail, profiles[profile].adminPassword);
  const trpc = await createExpoTrpcClient(page, profile);
  const claim = await trpc.auth.createAccountClaimCode.mutate({
    userId: provisioned.user.id,
  });

  await expect(
    trpc.auth.generateAccountClaimMagicLink.mutate({
      claimId: claim.id,
      email: profiles[profile].adminEmail,
    })
  ).rejects.toThrow();
});
