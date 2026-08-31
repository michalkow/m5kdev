import { createAuthOrganizationInvitationPolicy } from "./auth.organization-invitation-policy";

describe("createAuthOrganizationInvitationPolicy", () => {
  it("does not register Better Auth invitation email and rejects HTTP invite create", async () => {
    const policy = createAuthOrganizationInvitationPolicy();

    expect("sendInvitationEmail" in policy).toBe(false);

    await expect(
      policy.organizationHooks.beforeCreateInvitation({
        invitation: { id: "invite-1" },
      })
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});
