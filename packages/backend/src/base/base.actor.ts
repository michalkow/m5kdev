import { err, ok } from "neverthrow";
import type { Session, User } from "../modules/auth/auth.lib";
import { ServerError } from "../utils/errors";
import type { ServerResult, ServerResultAsync } from "./base.dto";

export type UserActor = {
  userId: string;
  userRole: string;
  organizationId: string | null;
  organizationRole: string | null;
  memberId: string | null;
  teamId: string | null;
  teamRole: string | null;
};

export type OrganizationActor = {
  userId: string;
  userRole: string;
  organizationId: string;
  organizationRole: string;
  memberId: string;
  teamId: string | null;
  teamRole: string | null;
};

export type TeamActor = {
  userId: string;
  userRole: string;
  organizationId: string;
  organizationRole: string;
  memberId: string;
  teamId: string;
  teamRole: string;
};

export type AdminActor = {
  userId: string;
  userRole: "admin";
  organizationId: string | null;
  organizationRole: string | null;
  memberId: string | null;
  teamId: string | null;
  teamRole: string | null;
};

export type AuthenticatedActor = UserActor | OrganizationActor | TeamActor;

/** @deprecated Prefer `AuthenticatedActor` — kept for grants and legacy call sites */
export type ServiceActor = AuthenticatedActor;

export type Actor = {
  user: UserActor;
  organization: OrganizationActor;
  team: TeamActor;
  admin: AdminActor;
  authenticated: AuthenticatedActor;
};

export type ActorScope = "user" | "organization" | "team" | "admin";

export type RequiredServiceActor<Scope extends ActorScope> = Actor[Scope];

/** Claims shape used by tests and factories */
export type ServiceActorClaims = {
  userId: string;
  userRole: string;
  organizationId?: string | null;
  organizationRole?: string | null;
  memberId?: string | null;
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
    if (
      !context.session.activeOrganizationId ||
      !context.session.activeOrganizationRole ||
      !context.session.activeOrganizationMemberId
    ) {
      throw new ServerError({
        code: "FORBIDDEN",
        message: "Active organization context required",
        layer: "controller",
        layerName: "ActorValidation",
      });
    }
  }

  if (scope === "team") {
    if (
      !context.session.activeOrganizationId ||
      !context.session.activeOrganizationRole ||
      !context.session.activeOrganizationMemberId
    ) {
      throw new ServerError({
        code: "FORBIDDEN",
        message: "Active organization context required for team scope",
        layer: "controller",
        layerName: "ActorValidation",
      });
    }
    throw new ServerError({
      code: "FORBIDDEN",
      message: "Active team context required",
      layer: "controller",
      layerName: "ActorValidation",
    });
  }

  return {
    userId: context.user.id,
    userRole: context.user.role,
    organizationId: context.session.activeOrganizationId,
    organizationRole: context.session.activeOrganizationRole,
    memberId: context.session.activeOrganizationMemberId,
    teamId: null,
    teamRole: null,
  };
}

export function validateActor(actor: AuthenticatedActor, scope: ActorScope): boolean {
  if (!actor.userId || !actor.userRole) return false;
  if (scope === "admin") return actor.userRole === "admin";
  if (scope === "user") return true;
  if (scope === "organization") {
    return Boolean(actor.organizationId && actor.organizationRole && actor.memberId);
  }
  return Boolean(
    actor.organizationId &&
      actor.organizationRole &&
      actor.memberId &&
      actor.teamId &&
      actor.teamRole
  );
}

/**
 * Builds a flat actor for tests / grants without session. Validates that team scope implies organization.
 */
export function createServiceActor(claims: ServiceActorClaims): AuthenticatedActor {
  const organizationId = claims.organizationId ?? null;
  const organizationRole = claims.organizationRole ?? null;
  const memberId = claims.memberId ?? null;
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
    memberId,
    teamId,
    teamRole,
  };
}

/** Live Membership lookup; `AuthOrganizationRepository` satisfies it. */
export interface MembershipLookup {
  findMemberByUserAndOrganization(args: {
    userId: string;
    organizationId: string;
  }): ServerResultAsync<{ id: string; userId: string | null; role: string }>;
}

function actorValidationError(
  code: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
  message: string
): ServerResult<never> {
  return err(new ServerError({ code, message, layer: "controller", layerName: "ActorValidation" }));
}

/**
 * Reads `organizationId` off a caller input and returns the input without it.
 * Non-object inputs are returned unchanged.
 */
export function takeOrganizationId(
  input: unknown
): ServerResult<{ organizationId?: string; input: unknown }> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("organizationId" in input)
  ) {
    return ok({ input });
  }
  const { organizationId, ...rest } = input as Record<string, unknown>;
  if (organizationId === undefined) return ok({ input: rest });
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return actorValidationError("BAD_REQUEST", "organizationId must be a non-empty string");
  }
  return ok({ organizationId, input: rest });
}

/**
 * Named `organizationId` (input, or session active Organization at the transport) wins and
 * a live Membership builds OrganizationActor; otherwise an OrganizationActor already on the
 * call is kept; otherwise BAD_REQUEST.
 */
export async function resolveOrganizationActor({
  user,
  organizationId,
  actor,
  memberships,
}: {
  user: Pick<UserActor, "userId" | "userRole">;
  organizationId?: string | null;
  actor?: AuthenticatedActor | null;
  memberships?: MembershipLookup;
}): ServerResultAsync<OrganizationActor> {
  if (!organizationId) {
    if (actor && validateActor(actor, "organization")) return ok(actor as OrganizationActor);
    return actorValidationError("BAD_REQUEST", "organizationId is required");
  }
  if (!memberships) {
    return actorValidationError(
      "INTERNAL_SERVER_ERROR",
      "Membership lookup is required to name an Organization"
    );
  }

  const member = await memberships.findMemberByUserAndOrganization({
    userId: user.userId,
    organizationId,
  });
  if (member.isErr()) {
    if (member.error.code === "NOT_FOUND") {
      return actorValidationError("NOT_FOUND", "Live Membership required");
    }
    return err(member.error);
  }
  if (member.value.userId !== user.userId) {
    return actorValidationError("NOT_FOUND", "Live Membership required");
  }

  return ok({
    userId: user.userId,
    userRole: user.userRole,
    organizationId,
    organizationRole: member.value.role,
    memberId: member.value.id,
    teamId: null,
    teamRole: null,
  });
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
