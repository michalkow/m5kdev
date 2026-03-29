import { ServerError } from "../../utils/errors";
import type { Session, User } from "../auth/auth.lib";

export type UserActor = {
  userId: string;
  userRole: string;
  organizationId: string | null;
  organizationRole: string | null;
  teamId: string | null;
  teamRole: string | null;
};

export type OrganizationActor = {
  userId: string;
  userRole: string;
  organizationId: string;
  organizationRole: string;
  teamId: string | null;
  teamRole: string | null;
};

export type TeamActor = {
  userId: string;
  userRole: string;
  organizationId: string;
  organizationRole: string;
  teamId: string;
  teamRole: string;
};

export type AuthenticatedActor = UserActor | OrganizationActor | TeamActor;

export type Actor = {
  user: UserActor;
  organization: OrganizationActor;
  team: TeamActor;
  authenticated: AuthenticatedActor;
};

export type ActorScope = "user" | "organization" | "team";

export function createActorFromContext(
  context: { user: User; session: Session },
  scope: "team"
): TeamActor;
export function createActorFromContext(
  context: { user: User; session: Session },
  scope: "organization"
): OrganizationActor;
export function createActorFromContext(
  context: { user: User; session: Session },
  scope: "user"
): UserActor;
export function createActorFromContext(
  context: { user: User; session: Session },
  scope: ActorScope
): AuthenticatedActor {
  if (!context.user.role) {
    throw new ServerError({
      code: "BAD_REQUEST",
      message: "User role not found in context",
      layer: "controller",
      layerName: "ActorValidation",
    });
  }

  if (
    (scope === "organization" || scope === "team") &&
    (!context.session.activeOrganizationId || !context.session.activeTeamId)
  ) {
    throw new ServerError({
      code: "BAD_REQUEST",
      message: "Organization id or role not found in context",
      layer: "controller",
      layerName: "ActorValidation",
    });
  }

  if (scope === "team" && (!context.session.activeTeamId || !context.session.activeTeamRole)) {
    throw new ServerError({
      code: "BAD_REQUEST",
      message: "Team id or role not found in context",
      layer: "controller",
      layerName: "ActorValidation",
    });
  }

  return {
    userId: context.user.id,
    userRole: context.user.role,
    organizationId: context.session.activeOrganizationId,
    organizationRole: context.session.activeOrganizationRole,
    teamId: context.session.activeTeamId,
    teamRole: context.session.activeTeamRole,
  };
}

export function validateActor(actor: AuthenticatedActor, scope: ActorScope) {
  if ((scope === "organization" || scope === "team") && (!actor.organizationId || !actor.teamId))
    return false;

  if (scope === "team" && (!actor.teamId || !actor.teamRole)) return false;

  return true;
}
