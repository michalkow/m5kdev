export interface OrganizationMemberListItem {
  id: string;
  userId: string | null;
  email: string | null;
  name: string;
  role: string;
  invitationId: string | null;
  user: {
    name: string | null;
    email: string | null;
  } | null;
}

export type CombinedMemberRow = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: "active" | "invited";
  memberId: string;
  invitationId: string | null;
};

export const ORGANIZATION_ROLE_FALLBACK = "member";

export function toOrganizationMemberRows(
  members: readonly OrganizationMemberListItem[],
  unknownName: string,
  invitedUserLabel: string
): CombinedMemberRow[] {
  return members
    .map((member) => {
      const isInvited = member.userId == null;
      return {
        id: member.id,
        displayName: isInvited
          ? member.name || invitedUserLabel
          : member.user?.name || member.name || unknownName,
        email: member.email || member.user?.email || "-",
        role: member.role || ORGANIZATION_ROLE_FALLBACK,
        status: (isInvited ? "invited" : "active") as CombinedMemberRow["status"],
        memberId: member.id,
        invitationId: member.invitationId,
      };
    })
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.email.localeCompare(right.email);
      }
      return left.status === "active" ? -1 : 1;
    });
}
