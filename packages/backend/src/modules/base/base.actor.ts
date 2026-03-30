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

/** @deprecated Prefer `AuthenticatedActor` — kept for grants and legacy call sites */
export type ServiceActor = AuthenticatedActor;

export type Actor = {
  user: UserActor;
  organization: OrganizationActor;
  team: TeamActor;
  authenticated: AuthenticatedActor;
};

export type ActorScope = "user" | "organization" | "team";

export type RequiredServiceActor<Scope extends ActorScope> = Actor[Scope];

/** Claims shape used by tests and factories */
export type ServiceActorClaims = {
  userId: string;
  userRole: string;
  organizationId?: string | null;
  organizationRole?: string | null;
  teamId?: string | null;
  teamRole?: string | null;
};

/** @deprecated Prefer `OrganizationActor` */
export type ServiceOrganizationActor = OrganizationActor;
/** @deprecated Prefer `TeamActor` */
export type ServiceTeamActor = TeamActor;

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

  if (scope === "organization") {
    if (!context.session.activeOrganizationId || !context.session.activeOrganizationRole) {
      throw new ServerError({
        code: "FORBIDDEN",
        message: "Active organization context required",
        layer: "controller",
        layerName: "ActorValidation",
      });
    }
  }

  if (scope === "team") {
    if (!context.session.activeOrganizationId || !context.session.activeOrganizationRole) {
      throw new ServerError({
        code: "FORBIDDEN",
        message: "Active organization context required for team scope",
        layer: "controller",
        layerName: "ActorValidation",
      });
    }
    if (!context.session.activeTeamId || !context.session.activeTeamRole) {
      throw new ServerError({
        code: "FORBIDDEN",
        message: "Active team context required",
        layer: "controller",
        layerName: "ActorValidation",
      });
    }
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

export function validateActor(actor: AuthenticatedActor, scope: ActorScope): boolean {
  if (!actor.userId || !actor.userRole) return false;
  if (scope === "user") return true;
  if (scope === "organization") {
    return Boolean(actor.organizationId && actor.organizationRole);
  }
  return Boolean(
    actor.organizationId && actor.organizationRole && actor.teamId && actor.teamRole
  );
}

/**
 * Builds a flat actor for tests / grants without session. Validates that team scope implies organization.
 */
export function createServiceActor(claims: ServiceActorClaims): AuthenticatedActor {
  const organizationId = claims.organizationId ?? null;
  const organizationRole = claims.organizationRole ?? null;
  const teamId = claims.teamId ?? null;
  const teamRole = claims.teamRole ?? null;

  if ((teamId || teamRole) && (!organizationId || !organizationRole)) {
    throw new Error("organization access before team access");
  }

  return {
    userId: claims.userId,
    userRole: claims.userRole,
    organizationId,
    organizationRole,
    teamId,
    teamRole,
  };
}

export function getServiceActorScope(actor: AuthenticatedActor): ActorScope {
  if (validateActor(actor, "team")) return "team";
  if (validateActor(actor, "organization")) return "organization";
  return "user";
}

export function hasServiceActorScope(actor: AuthenticatedActor, scope: ActorScope): boolean {
  if (scope === "team") return validateActor(actor, "team");
  if (scope === "organization") {
    return validateActor(actor, "organization") || validateActor(actor, "team");
  }
  return validateActor(actor, "user");
}
