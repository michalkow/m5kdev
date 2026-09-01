import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { v4 as uuidv4 } from "uuid";
import * as auth from "./auth.db";

const schema = { ...auth };
type Schema = typeof schema;
export type Orm = LibSQLDatabase<Schema>;

export async function getNewOrganization<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  organizationId: string,
  userId: string
): Promise<{
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  role: string;
  memberId: string | null;
}> {
  const [organization] = await orm
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      type: schema.organizations.type,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const [member] = await orm
    .select({
      id: schema.members.id,
      organizationId: schema.members.organizationId,
      role: schema.members.role,
    })
    .from(schema.members)
    .orderBy(desc(schema.members.createdAt))
    .where(
      and(
        eq(schema.members.userId, userId),
        eq(schema.members.organizationId, organizationId),
        isNull(schema.members.deletedAt)
      )
    )
    .limit(1);

  return {
    ...organization,
    memberId: member?.id ?? null,
    role: member?.role ?? "",
  };
}

export async function getActiveOrganization<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  userId: string
): Promise<{
  organizationId: string | undefined;
  organizationRole: string | undefined;
  organizationType: string | undefined;
  organizationMemberId: string | undefined;
}> {
  let organizationId: string | undefined;
  let organizationRole: string | undefined;
  let organizationType: string | undefined;
  let organizationMemberId: string | undefined;
  const [lastSession] = await orm
    .select({
      activeOrganizationId: schema.sessions.activeOrganizationId,
      activeOrganizationRole: schema.sessions.activeOrganizationRole,
      activeOrganizationType: schema.sessions.activeOrganizationType,
      activeOrganizationMemberId: schema.sessions.activeOrganizationMemberId,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(1);
  if (lastSession) {
    organizationId = lastSession.activeOrganizationId ?? undefined;
    organizationRole = lastSession.activeOrganizationRole ?? undefined;
    organizationType = lastSession.activeOrganizationType ?? undefined;
    organizationMemberId = lastSession.activeOrganizationMemberId ?? undefined;
  }

  if (organizationId && organizationMemberId) {
    const [activeMember] = await orm
      .select({ id: schema.members.id, role: schema.members.role })
      .from(schema.members)
      .where(
        and(
          eq(schema.members.id, organizationMemberId),
          eq(schema.members.organizationId, organizationId),
          eq(schema.members.userId, userId),
          isNull(schema.members.deletedAt)
        )
      )
      .limit(1);
    if (!activeMember) {
      organizationId = undefined;
      organizationRole = undefined;
      organizationMemberId = undefined;
      organizationType = undefined;
    } else {
      organizationRole = activeMember.role;
    }
  }

  if (!organizationId || !organizationRole || !organizationMemberId) {
    const [member] = await orm
      .select({
        id: schema.members.id,
        organizationId: schema.members.organizationId,
        role: schema.members.role,
      })
      .from(schema.members)
      .orderBy(desc(schema.members.createdAt))
      .where(and(eq(schema.members.userId, userId), isNull(schema.members.deletedAt)))
      .limit(1);
    organizationId = member?.organizationId;
    organizationRole = member?.role;
    organizationMemberId = member?.id;
  }

  if (!organizationType && organizationId) {
    const [organization] = await orm
      .select({ type: schema.organizations.type })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    organizationType = organization?.type ?? undefined;
  }

  return {
    organizationId,
    organizationRole,
    organizationType,
    organizationMemberId,
  };
}

export async function createOrganizationWithOwner<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    locale?: string | null;
  },
  locale?: string | null
): Promise<{ organizationId: string }> {
  const organizationId = uuidv4();
  const organizationLocale = locale ?? user.locale ?? undefined;
  return await orm.transaction(async (tx) => {
    const [organization] = await tx
      .insert(schema.organizations)
      .values({
        id: organizationId,
        name: organizationId,
        slug: organizationId,
        ...(organizationLocale ? { locale: organizationLocale } : {}),
      })
      .returning();

    if (!organization) throw new Error("createOrganizationWithOwner: Failed to create organization");

    const [member] = await tx
      .insert(schema.members)
      .values({
        userId: user.id,
        organizationId: organization.id,
        role: "owner",
        email: user.email,
        name: user.name ?? "",
        image: user.image ?? null,
      })
      .returning();

    if (!member) throw new Error("createOrganizationWithOwner: Failed to create member");

    return { organizationId };
  });
}

export async function attachUserToInvitedMember(
  orm: Orm,
  {
    memberId,
    organizationId,
    userId,
    name,
    email,
    image,
  }: {
    memberId: string;
    organizationId: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
  }
): Promise<
  | { ok: true; member: typeof auth.members.$inferSelect }
  | { ok: false; reason: "not_found" | "conflict" }
> {
  const [existing] = await orm
    .select()
    .from(schema.members)
    .where(
      and(
        eq(schema.members.id, memberId),
        eq(schema.members.organizationId, organizationId),
        isNull(schema.members.deletedAt)
      )
    )
    .limit(1);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.userId && existing.userId !== userId) {
    return { ok: false, reason: "conflict" };
  }

  const [updated] = await orm
    .update(schema.members)
    .set({
      userId,
      name,
      email,
      image,
    })
    .where(
      and(
        eq(schema.members.id, memberId),
        eq(schema.members.organizationId, organizationId),
        isNull(schema.members.deletedAt)
      )
    )
    .returning();
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, member: updated };
}

export async function syncActiveMemberProfiles(
  orm: Orm,
  userId: string,
  profile: { name?: string; image?: string | null }
): Promise<void> {
  const update: { name?: string; image?: string | null } = {};
  if (typeof profile.name === "string" && profile.name.length > 0) {
    update.name = profile.name;
  }
  if (profile.image !== undefined) {
    update.image = profile.image;
  }
  if (Object.keys(update).length === 0) return;

  await orm
    .update(schema.members)
    .set(update)
    .where(and(eq(schema.members.userId, userId), isNull(schema.members.deletedAt)));
}

export async function softDeleteOrganizationMember(
  orm: Orm,
  {
    memberId,
    organizationId,
    userId,
  }: {
    memberId: string;
    organizationId: string;
    userId: string | null;
  }
): Promise<{ id: string } | null> {
  return orm.transaction(async (tx) => {
    const [removed] = await tx
      .update(schema.members)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.members.id, memberId),
          eq(schema.members.organizationId, organizationId),
          isNull(schema.members.deletedAt)
        )
      )
      .returning({ id: schema.members.id });

    if (!removed) return null;

    if (userId) {
      await tx
        .update(schema.sessions)
        .set({
          activeOrganizationId: null,
          activeOrganizationRole: null,
          activeOrganizationMemberId: null,
          activeOrganizationType: null,
        })
        .where(
          and(
            eq(schema.sessions.userId, userId),
            eq(schema.sessions.activeOrganizationId, organizationId)
          )
        );
    }

    return removed;
  });
}

export class WaitlistCodeNotFound extends Error {
  readonly status = "NOT_FOUND";

  constructor() {
    super("Invalid or expired waitlist invitation code");
    this.name = "WaitlistCodeNotFound";
  }
}

export async function assertWaitlistCodeUsable<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  code: string
): Promise<{ id: string; code: string | null; status: string }> {
  const [waitlist] = await orm
    .select()
    .from(schema.waitlist)
    .where(
      and(
        eq(schema.waitlist.code, code),
        eq(schema.waitlist.status, "INVITED"),
        gte(schema.waitlist.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!waitlist) {
    throw new WaitlistCodeNotFound();
  }

  return waitlist;
}

export async function acceptWaitlistCodeAfterUser<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  waitlistId: string
): Promise<void> {
  await orm
    .update(schema.waitlist)
    .set({
      status: "ACCEPTED",
      updatedAt: new Date(),
    })
    .where(eq(schema.waitlist.id, waitlistId));
}
