import { desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { v4 as uuidv4 } from "uuid";
import * as auth from "./auth.db";

const schema = { ...auth };
type Schema = typeof schema;
export type Orm = LibSQLDatabase<Schema>;

export async function getActiveOrganizationAndTeam<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  userId: string
): Promise<{
  organizationId: string | undefined;
  teamId: string | undefined;
  organizationRole: string | undefined;
  teamRole: string | undefined;
  organizationType: string | undefined;
}> {
  let organizationId: string | undefined;
  let teamId: string | undefined;
  let organizationRole: string | undefined;
  let teamRole: string | undefined;
  let organizationType: string | undefined;
  const [lastSession] = await orm
    .select({
      activeOrganizationId: schema.sessions.activeOrganizationId,
      activeTeamId: schema.sessions.activeTeamId,
      activeOrganizationRole: schema.sessions.activeOrganizationRole,
      activeTeamRole: schema.sessions.activeTeamRole,
      activeOrganizationType: schema.sessions.activeOrganizationType,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(1);
  if (lastSession) {
    organizationId = lastSession.activeOrganizationId ?? undefined;
    teamId = lastSession.activeTeamId ?? undefined;
    organizationRole = lastSession.activeOrganizationRole ?? undefined;
    teamRole = lastSession.activeTeamRole ?? undefined;
    organizationType = lastSession.activeOrganizationType ?? undefined;
  }

  if (!organizationId || !organizationRole) {
    const [member] = await orm
      .select({ organizationId: schema.members.organizationId, role: schema.members.role })
      .from(schema.members)
      .orderBy(desc(schema.members.createdAt))
      .where(eq(schema.members.userId, userId))
      .limit(1);
    organizationId = member?.organizationId;
    organizationRole = member?.role;
  }

  if (!teamId || !teamRole) {
    const [teamMember] = await orm
      .select({ teamId: schema.teamMembers.teamId, role: schema.teamMembers.role })
      .from(schema.teamMembers)
      .orderBy(desc(schema.teamMembers.createdAt))
      .where(eq(schema.teamMembers.userId, userId))
      .limit(1);
    teamId = teamMember?.teamId;
    teamRole = teamMember?.role;
  }

  if (!organizationType && organizationId) {
    const [organization] = await orm
      .select({ type: schema.organizations.type })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    organizationType = organization?.type ?? undefined;
  }

  return { organizationId, teamId, organizationRole, teamRole, organizationType };
}

export async function createOrganizationAndTeam<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  user: { id: string; email: string }
): Promise<{ organizationId: string; teamId: string }> {
  const organizationId = uuidv4();
  return await orm.transaction(async (tx) => {
    const [organization] = await tx
      .insert(schema.organizations)
      .values({
        id: organizationId,
        name: organizationId,
        slug: organizationId,
      })
      .returning();

    if (!organization) throw new Error("createOrganizationAndTeam: Failed to create organization");

    const [member] = await tx
      .insert(schema.members)
      .values({
        userId: user.id,
        organizationId: organization.id,
        role: "owner",
      })
      .returning();

    if (!member) throw new Error("createOrganizationAndTeam: Failed to create member");

    const [team] = await tx
      .insert(schema.teams)
      .values({
        name: organization.id,
        organizationId: organization.id,
      })
      .returning();

    if (!team) throw new Error("createOrganizationAndTeam: Failed to create team");

    const [teamMember] = await tx
      .insert(schema.teamMembers)
      .values({
        userId: user.id,
        teamId: team.id,
        role: "owner",
      })
      .returning();

    if (!teamMember) throw new Error("createOrganizationAndTeam: Failed to create team member");
    return { organizationId, teamId: team.id };
  });
}
