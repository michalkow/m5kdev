import {
  AUTH_ORGANIZATION_HTTP_FORBIDDEN_MESSAGE,
  AuthOrganizationHttpForbidden,
  createAuthOrganizationHttpPolicy,
  forbidAuthOrganizationHttpMutation,
} from "../auth.organization-http-policy";

describe("createAuthOrganizationHttpPolicy", () => {
  const policy = createAuthOrganizationHttpPolicy();

  it("disables user-initiated Organization create and Teams", () => {
    expect(policy.allowUserToCreateOrganization).toBe(false);
    expect(policy.teams.enabled).toBe(false);
  });

  it("forbids Better Auth membership and invitation HTTP mutations", async () => {
    const hooks = policy.organizationHooks;
    await expect(forbidAuthOrganizationHttpMutation()).rejects.toBeInstanceOf(
      AuthOrganizationHttpForbidden
    );
    await expect(hooks.beforeCreateInvitation()).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: AUTH_ORGANIZATION_HTTP_FORBIDDEN_MESSAGE,
    });
    await expect(hooks.beforeAcceptInvitation()).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
    await expect(hooks.beforeCancelInvitation()).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
    await expect(hooks.beforeAddMember()).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
    await expect(hooks.beforeRemoveMember()).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
    await expect(hooks.beforeUpdateMemberRole()).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
  });
});
