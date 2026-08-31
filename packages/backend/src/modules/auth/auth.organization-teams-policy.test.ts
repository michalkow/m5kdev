import { createAuthOrganizationTeamsOptions } from "./auth.organization-teams-policy";

describe("createAuthOrganizationTeamsOptions", () => {
  it("does not enable Better Auth teams", () => {
    expect(createAuthOrganizationTeamsOptions()).toEqual({ enabled: false });
  });
});
