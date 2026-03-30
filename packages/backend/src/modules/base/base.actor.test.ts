import { createServiceActor, getServiceActorScope, hasServiceActorScope } from "./base.actor";

describe("base.actor", () => {
  it("creates a user actor when only user claims are present", () => {
    const actor = createServiceActor({
      userId: "user-1",
      userRole: "member",
    });

    expect(actor).toEqual({
      userId: "user-1",
      userRole: "member",
      organizationId: null,
      organizationRole: null,
      teamId: null,
      teamRole: null,
    });
  });

  it("derives the highest available scope", () => {
    expect(
      getServiceActorScope({
        userId: "user-1",
        userRole: "member",
        organizationId: "org-1",
        organizationRole: "owner",
        teamId: null,
        teamRole: null,
      })
    ).toBe("organization");

    expect(
      getServiceActorScope({
        userId: "user-1",
        userRole: "member",
        organizationId: "org-1",
        organizationRole: "owner",
        teamId: "team-1",
        teamRole: "manager",
      })
    ).toBe("team");
  });

  it("validates hierarchy before building a team actor", () => {
    expect(() =>
      createServiceActor({
        userId: "user-1",
        userRole: "member",
        teamId: "team-1",
        teamRole: "manager",
      })
    ).toThrow("organization access before team access");
  });

  it("checks required scope against broader actors", () => {
    const actor = createServiceActor({
      userId: "user-1",
      userRole: "member",
      organizationId: "org-1",
      organizationRole: "owner",
      teamId: "team-1",
      teamRole: "manager",
    });

    expect(hasServiceActorScope(actor, "user")).toBe(true);
    expect(hasServiceActorScope(actor, "organization")).toBe(true);
    expect(hasServiceActorScope(actor, "team")).toBe(true);
  });
});
