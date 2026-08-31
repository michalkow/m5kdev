export interface AuthOrganizationTeamsOptions {
  readonly enabled: false;
}

export function createAuthOrganizationTeamsOptions(): AuthOrganizationTeamsOptions {
  return { enabled: false };
}
