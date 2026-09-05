export const AUTH_ORGANIZATION_HTTP_FORBIDDEN_MESSAGE = "Use Auth organization procedures";

export class AuthOrganizationHttpForbidden extends Error {
  readonly status = "FORBIDDEN";

  constructor() {
    super(AUTH_ORGANIZATION_HTTP_FORBIDDEN_MESSAGE);
    this.name = "AuthOrganizationHttpForbidden";
  }
}

export async function forbidAuthOrganizationHttpMutation(): Promise<never> {
  throw new AuthOrganizationHttpForbidden();
}

/**
 * Better Auth still mounts `/organization/*` next to Auth tRPC. Signup and Auth
 * services write organizations/members with Drizzle, so these HTTP mutations
 * must stay closed: the default plugin lets any user create an Organization
 * (and become Owner), and remove-member hard-deletes the Membership row.
 */
export function createAuthOrganizationHttpPolicy() {
  return {
    allowUserToCreateOrganization: false as const,
    teams: { enabled: false as const },
    organizationHooks: {
      beforeCreateInvitation: forbidAuthOrganizationHttpMutation,
      beforeAcceptInvitation: forbidAuthOrganizationHttpMutation,
      beforeCancelInvitation: forbidAuthOrganizationHttpMutation,
      beforeAddMember: forbidAuthOrganizationHttpMutation,
      beforeRemoveMember: forbidAuthOrganizationHttpMutation,
      beforeUpdateMemberRole: forbidAuthOrganizationHttpMutation,
    },
  };
}
