import { toOrganizationMemberRows } from "./organizationMemberRows";

describe("toOrganizationMemberRows", () => {
  it("maps invited Memberships from Auth list rows without an Invitation kind", () => {
    const rows = toOrganizationMemberRows(
      [
        {
          id: "member-active",
          userId: "user-2",
          email: "active@example.com",
          name: "Active",
          role: "member",
          invitationId: null,
          user: { name: "Active", email: "active@example.com" },
        },
        {
          id: "member-invited",
          userId: null,
          email: "invitee@example.com",
          name: "invitee@example.com",
          role: "admin",
          invitationId: "invite-1",
          user: null,
        },
      ],
      "Unknown",
      "Invited user"
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: "member-active",
        status: "active",
        memberId: "member-active",
        email: "active@example.com",
        invitationId: null,
      }),
      expect.objectContaining({
        id: "member-invited",
        status: "invited",
        memberId: "member-invited",
        email: "invitee@example.com",
        invitationId: "invite-1",
      }),
    ]);
  });
});
