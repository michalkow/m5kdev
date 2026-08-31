class InvitationHttpForbidden extends Error {
  readonly status = "FORBIDDEN";

  constructor() {
    super("Use Auth inviteOrganizationMember");
    this.name = "InvitationHttpForbidden";
  }
}

export interface AuthOrganizationInvitationPolicy {
  readonly organizationHooks: {
    beforeCreateInvitation: (input: { invitation: unknown }) => Promise<never>;
  };
}

export function createAuthOrganizationInvitationPolicy(): AuthOrganizationInvitationPolicy {
  return {
    organizationHooks: {
      beforeCreateInvitation: async () => {
        throw new InvitationHttpForbidden();
      },
    },
  };
}
