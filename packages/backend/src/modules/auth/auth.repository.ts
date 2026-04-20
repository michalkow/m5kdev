import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseRepository } from "../base/base.repository";
import * as auth from "./auth.db";
import type {
  AccountClaim,
  AccountClaimMagicLink,
  AccountClaimMagicLinkOutput,
  AccountClaimOutput,
  ChildOrganization,
  ReadInvitationOutput,
  Waitlist,
  WaitlistOutput,
} from "./auth.dto";

const schema = { ...auth };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;
type UserRow = typeof auth.users.$inferSelect;
type OrganizationMetadata = Record<string, unknown> & {
  preferences?: Record<string, unknown>;
  flags?: string[];
};
type OrganizationRow = typeof auth.organizations.$inferSelect;

function parseOrganizationMetadata(
  metadata: string | Record<string, unknown> | null | undefined
): OrganizationMetadata {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as OrganizationMetadata;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as OrganizationMetadata;
  }
  return {};
}

function normalizeOrganizationPreferences(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeOrganizationFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export class AuthRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  async listChildOrganizations(parentId: string, tx?: Orm): ServerResultAsync<ChildOrganization[]> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.organizations.id,
          name: this.schema.organizations.name,
          slug: this.schema.organizations.slug,
          logo: this.schema.organizations.logo,
          type: this.schema.organizations.type,
          parentId: this.schema.organizations.parentId,
          metadata: this.schema.organizations.metadata,
          createdAt: this.schema.organizations.createdAt,
        })
        .from(this.schema.organizations)
        .where(eq(this.schema.organizations.parentId, parentId))
        .orderBy(this.schema.organizations.name)
    );
    if (result.isErr()) return err(result.error);

    return ok(
      result.value.map((org) => ({
        ...org,
        metadata: parseOrganizationMetadata(org.metadata),
      }))
    );
  }

  async updateChildOrganization(
    {
      parentId,
      organizationId,
      name,
      slug,
      metadata,
    }: {
      parentId: string;
      organizationId: string;
      name: string;
      slug?: string | null;
      metadata?: Record<string, unknown>;
    },
    tx?: Orm
  ): ServerResultAsync<ChildOrganization> {
    const db = tx ?? this.orm;
    const jsonResult = this.throwable(() => ok(JSON.stringify(metadata ?? {})));
    if (jsonResult.isErr()) return err(jsonResult.error);

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.organizations)
        .set({
          name,
          slug: slug ?? null,
          metadata: jsonResult.value,
        })
        .where(
          and(
            eq(this.schema.organizations.id, organizationId),
            eq(this.schema.organizations.parentId, parentId)
          )
        )
        .returning({
          id: this.schema.organizations.id,
          name: this.schema.organizations.name,
          slug: this.schema.organizations.slug,
          logo: this.schema.organizations.logo,
          type: this.schema.organizations.type,
          parentId: this.schema.organizations.parentId,
          metadata: this.schema.organizations.metadata,
          createdAt: this.schema.organizations.createdAt,
        })
    );
    if (updateResult.isErr()) return err(updateResult.error);
    const [org] = updateResult.value;
    if (!org) return this.error("NOT_FOUND");

    return ok({
      ...org,
      metadata: parseOrganizationMetadata(org.metadata),
    });
  }
  private async getOrganizationMetadataForMember(
    userId: string,
    organizationId: string,
    tx?: Orm
  ): Promise<OrganizationMetadata | null> {
    const db = tx ?? this.orm;
    const [organization] = await db
      .select({ metadata: this.schema.organizations.metadata })
      .from(this.schema.organizations)
      .innerJoin(
        this.schema.members,
        eq(this.schema.members.organizationId, this.schema.organizations.id)
      )
      .where(
        and(
          eq(this.schema.organizations.id, organizationId),
          eq(this.schema.members.userId, userId)
        )
      )
      .limit(1);

    if (!organization) return null;
    return parseOrganizationMetadata(organization.metadata);
  }

  async getUserWaitlistCount(userId: string, tx?: Orm): ServerResultAsync<number> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select({ count: count() })
        .from(this.schema.waitlist)
        .where(eq(this.schema.waitlist.userId, userId))
    );
    if (result.isErr()) return err(result.error);
    const [waitlist] = result.value;
    return ok(waitlist.count ?? 0);
  }

  async getOnboarding(userId: string, tx?: Orm): ServerResultAsync<number> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select({ onboarding: this.schema.users.onboarding })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (result.isErr()) return err(result.error);
    const [user] = result.value;
    if (!user) return this.error("FORBIDDEN");
    return ok(user.onboarding ?? 0);
  }

  async setOnboarding(userId: string, onboarding: number, tx?: Orm): ServerResultAsync<number> {
    const db = tx ?? this.orm;
    const updateResult = await this.throwableQuery(() =>
      db.update(this.schema.users).set({ onboarding }).where(eq(this.schema.users.id, userId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(onboarding);
  }

  async getPreferences(userId: string, tx?: Orm): ServerResultAsync<Record<string, unknown>> {
    const db = tx ?? this.orm;
    const userResult = await this.throwableQuery(() =>
      db
        .select({ preferences: this.schema.users.preferences })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (userResult.isErr()) return err(userResult.error);
    const [user] = userResult.value;
    if (!user) return this.error("FORBIDDEN");

    const preferences = user.preferences;
    if (!preferences) return ok({});
    const parsed = this.throwable(() => ok(JSON.parse(preferences) as Record<string, unknown>));
    if (parsed.isErr()) return err(parsed.error);
    return ok(parsed.value);
  }

  async setPreferences(
    userId: string,
    preferences: Record<string, unknown>,
    tx?: Orm
  ): ServerResultAsync<Record<string, unknown>> {
    const db = tx ?? this.orm;
    const jsonResult = this.throwable(() => ok(JSON.stringify(preferences)));
    if (jsonResult.isErr()) return err(jsonResult.error);

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.users)
        .set({ preferences: jsonResult.value })
        .where(eq(this.schema.users.id, userId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(preferences);
  }

  async getOrganizationPreferences(
    userId: string,
    organizationId: string,
    tx?: Orm
  ): ServerResultAsync<Record<string, unknown>> {
    const metadata = await this.getOrganizationMetadataForMember(userId, organizationId, tx);
    if (!metadata) return this.error("FORBIDDEN");
    return ok(normalizeOrganizationPreferences(metadata.preferences));
  }

  async setOrganizationPreferences(
    userId: string,
    organizationId: string,
    preferences: Record<string, unknown>,
    tx?: Orm
  ): ServerResultAsync<Record<string, unknown>> {
    const db = tx ?? this.orm;
    const metadata = await this.getOrganizationMetadataForMember(userId, organizationId, tx);
    if (!metadata) return this.error("FORBIDDEN");

    const jsonResult = this.throwable(() =>
      ok(
        JSON.stringify({
          ...metadata,
          preferences,
        })
      )
    );
    if (jsonResult.isErr()) return err(jsonResult.error);

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.organizations)
        .set({ metadata: jsonResult.value })
        .where(eq(this.schema.organizations.id, organizationId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(preferences);
  }

  async getMetadata(userId: string, tx?: Orm): ServerResultAsync<Record<string, unknown>> {
    const db = tx ?? this.orm;
    const userResult = await this.throwableQuery(() =>
      db
        .select({ metadata: this.schema.users.metadata })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (userResult.isErr()) return err(userResult.error);
    const [user] = userResult.value;
    if (!user) return this.error("FORBIDDEN");
    return ok(user.metadata);
  }

  async setMetadata(
    userId: string,
    metadata: Record<string, unknown>,
    tx?: Orm
  ): ServerResultAsync<Record<string, unknown>> {
    const db = tx ?? this.orm;
    const userResult = await this.throwableQuery(() =>
      db
        .select({ metadata: this.schema.users.metadata })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (userResult.isErr()) return err(userResult.error);
    const [user] = userResult.value;
    if (!user) return this.error("FORBIDDEN");

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.users)
        .set({
          metadata: {
            ...user.metadata,
            ...metadata,
          },
        })
        .where(eq(this.schema.users.id, userId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(metadata);
  }

  async getFlags(userId: string, tx?: Orm): ServerResultAsync<string[]> {
    const db = tx ?? this.orm;
    const userResult = await this.throwableQuery(() =>
      db
        .select({ flags: this.schema.users.flags })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (userResult.isErr()) return err(userResult.error);
    const [user] = userResult.value;
    if (!user) return this.error("FORBIDDEN");
    const flags = user.flags;
    if (!flags) return ok([]);

    const parsed = this.throwable(() => ok(JSON.parse(flags) as string[]));
    if (parsed.isErr()) return err(parsed.error);
    return ok(parsed.value);
  }

  async getOrganizationFlags(
    userId: string,
    organizationId: string,
    tx?: Orm
  ): ServerResultAsync<string[]> {
    const metadata = await this.getOrganizationMetadataForMember(userId, organizationId, tx);
    if (!metadata) return this.error("FORBIDDEN");
    return ok(normalizeOrganizationFlags(metadata.flags));
  }

  async setFlags(userId: string, flags: string[], tx?: Orm): ServerResultAsync<string[]> {
    const db = tx ?? this.orm;
    const jsonResult = this.throwable(() => ok(JSON.stringify(flags)));
    if (jsonResult.isErr()) return err(jsonResult.error);

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.users)
        .set({ flags: jsonResult.value })
        .where(eq(this.schema.users.id, userId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(flags);
  }

  async setOrganizationFlags(
    userId: string,
    organizationId: string,
    flags: string[],
    tx?: Orm
  ): ServerResultAsync<string[]> {
    const db = tx ?? this.orm;
    const metadata = await this.getOrganizationMetadataForMember(userId, organizationId, tx);
    if (!metadata) return this.error("FORBIDDEN");

    const jsonResult = this.throwable(() => ok(JSON.stringify({ ...metadata, flags })));
    if (jsonResult.isErr()) return err(jsonResult.error);

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.organizations)
        .set({ metadata: jsonResult.value })
        .where(eq(this.schema.organizations.id, organizationId))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok(flags);
  }

  async listAdminWaitlist(tx?: Orm): ServerResultAsync<WaitlistOutput[]> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.waitlist.id,
          name: this.schema.waitlist.name,
          email: this.schema.waitlist.email,
          createdAt: this.schema.waitlist.createdAt,
          updatedAt: this.schema.waitlist.updatedAt,
          status: this.schema.waitlist.status,
        })
        .from(this.schema.waitlist)
        .where(eq(this.schema.waitlist.type, "WAITLIST"))
        .orderBy(desc(this.schema.waitlist.createdAt))
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    return ok(waitlistResult.value);
  }

  async readInvitation(id: string, tx?: Orm): ServerResultAsync<ReadInvitationOutput> {
    const db = tx ?? this.orm;
    const invitationResult = await this.throwableQuery(() =>
      db.select().from(this.schema.invitations).where(eq(this.schema.invitations.id, id)).limit(1)
    );
    if (invitationResult.isErr()) return err(invitationResult.error);
    const [invitation] = invitationResult.value;
    if (!invitation) return this.error("NOT_FOUND");
    const organizationResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.organizations)
        .where(eq(this.schema.organizations.id, invitation.organizationId))
        .limit(1)
    );
    if (organizationResult.isErr()) return err(organizationResult.error);
    const [organization] = organizationResult.value;
    if (!organization) return this.error("NOT_FOUND");
    return ok({
      organizationId: invitation.organizationId,
      email: invitation.email,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
    });
  }

  async listWaitlist(userId: string, tx?: Orm): ServerResultAsync<Waitlist[]> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(
          and(eq(this.schema.waitlist.userId, userId), eq(this.schema.waitlist.type, "WAITLIST"))
        )
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    return ok(waitlistResult.value);
  }

  async addToWaitlist(email: string, tx?: Orm): ServerResultAsync<WaitlistOutput> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db.insert(this.schema.waitlist).values({ email }).returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async inviteFromWaitlist(id: string, tx?: Orm): ServerResultAsync<Waitlist> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .update(this.schema.waitlist)
        .set({
          status: "INVITED",
          code: uuidv4(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        })
        .where(eq(this.schema.waitlist.id, id))
        .returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async inviteToWaitlist(
    { email, userId, name }: { email: string; userId: string; name?: string },
    tx?: Orm
  ): ServerResultAsync<Waitlist> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .insert(this.schema.waitlist)
        .values({
          email,
          name,
          status: "INVITED",
          code: uuidv4(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          userId: userId,
        })
        .returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async createInvitationCode(
    { userId, name }: { userId: string; name?: string },
    tx?: Orm
  ): ServerResultAsync<Waitlist> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .insert(this.schema.waitlist)
        .values({
          name,
          status: "INVITED",
          code: uuidv4(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          userId: userId,
        })
        .returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async joinWaitlist(email: string, tx?: Orm): ServerResultAsync<WaitlistOutput> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db.insert(this.schema.waitlist).values({ email }).returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async removeFromWaitlist(id: string, tx?: Orm): ServerResultAsync<WaitlistOutput> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .update(this.schema.waitlist)
        .set({ status: "REMOVED" })
        .where(eq(this.schema.waitlist.id, id))
        .returning()
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    return ok(waitlist);
  }

  async validateWaitlistCode(code: string, tx?: Orm): ServerResultAsync<{ status: string }> {
    const db = tx ?? this.orm;
    const waitlistResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(and(eq(this.schema.waitlist.code, code), eq(this.schema.waitlist.type, "WAITLIST")))
        .limit(1)
    );
    if (waitlistResult.isErr()) return err(waitlistResult.error);
    const [waitlist] = waitlistResult.value;
    if (!waitlist) return ok({ status: "NOT_FOUND" });
    if (waitlist.expiresAt && waitlist.expiresAt < new Date()) return ok({ status: "EXPIRED" });
    if (waitlist.status !== "INVITED") return ok({ status: "INVALID" });
    return ok({ status: "VALID" });
  }

  async createAccountClaimCode(
    { userId, expiresInHours = 24 * 14 }: { userId: string; expiresInHours?: number },
    tx?: Orm
  ): ServerResultAsync<AccountClaim> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .insert(this.schema.waitlist)
        .values({
          type: "ACCOUNT_CLAIM",
          claimUserId: userId,
          code: uuidv4(),
          status: "INVITED",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * expiresInHours),
        })
        .returning()
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    return ok(claim);
  }

  async createClaimableProvisionedUser({
    name,
    email,
    metadata = {},
    onboarding = 0,
    role = "user",
    expiresInHours = 24 * 14,
  }: {
    name: string;
    email: string;
    metadata?: Record<string, unknown>;
    onboarding?: number;
    role?: "user" | "admin" | "agent";
    expiresInHours?: number;
  }): ServerResultAsync<{ user: UserRow; claim: AccountClaim }> {
    const normalizedEmail = email.toLowerCase();
    const existingUserResult = await this.throwableQuery(() =>
      this.orm
        .select({ id: this.schema.users.id })
        .from(this.schema.users)
        .where(eq(this.schema.users.email, normalizedEmail))
        .limit(1)
    );
    if (existingUserResult.isErr()) return err(existingUserResult.error);
    const [existingUser] = existingUserResult.value;
    if (existingUser) {
      return this.error("CONFLICT", "Email already in use");
    }

    const createdResult = await this.throwableQuery(() =>
      this.orm.transaction(async (tx) => {
        const [user] = await tx
          .insert(this.schema.users)
          .values({
            name,
            email: normalizedEmail,
            emailVerified: false,
            role,
            onboarding,
            metadata,
          })
          .returning();
        if (!user) throw new Error("Failed to create user");

        const organizationId = uuidv4();
        const [organization] = await tx
          .insert(this.schema.organizations)
          .values({
            id: organizationId,
            name: organizationId,
            slug: organizationId,
          })
          .returning();
        if (!organization) throw new Error("Failed to create organization");

        const [member] = await tx
          .insert(this.schema.members)
          .values({
            userId: user.id,
            organizationId: organization.id,
            role: "owner",
          })
          .returning();
        if (!member) throw new Error("Failed to create organization membership");

        const [team] = await tx
          .insert(this.schema.teams)
          .values({
            name: organization.id,
            organizationId: organization.id,
          })
          .returning();
        if (!team) throw new Error("Failed to create team");

        const [teamMember] = await tx
          .insert(this.schema.teamMembers)
          .values({
            userId: user.id,
            teamId: team.id,
            role: "owner",
          })
          .returning();
        if (!teamMember) throw new Error("Failed to create team membership");

        const [claim] = await tx
          .insert(this.schema.waitlist)
          .values({
            type: "ACCOUNT_CLAIM",
            claimUserId: user.id,
            code: uuidv4(),
            status: "INVITED",
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * expiresInHours),
          })
          .returning();
        if (!claim) throw new Error("Failed to create account claim");

        return { user, claim };
      })
    );
    if (createdResult.isErr()) return err(createdResult.error);
    return ok(createdResult.value);
  }

  async listAccountClaims(tx?: Orm): ServerResultAsync<AccountClaimOutput[]> {
    const db = tx ?? this.orm;
    const claimsResult = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.waitlist.id,
          claimUserId: this.schema.waitlist.claimUserId,
          status: this.schema.waitlist.status,
          expiresAt: this.schema.waitlist.expiresAt,
          claimedAt: this.schema.waitlist.claimedAt,
          claimedEmail: this.schema.waitlist.claimedEmail,
          createdAt: this.schema.waitlist.createdAt,
          updatedAt: this.schema.waitlist.updatedAt,
        })
        .from(this.schema.waitlist)
        .where(eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"))
        .orderBy(desc(this.schema.waitlist.createdAt))
    );
    if (claimsResult.isErr()) return err(claimsResult.error);
    return ok(claimsResult.value);
  }

  async validateAccountClaimCode(code: string, tx?: Orm): ServerResultAsync<{ status: string }> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(
          and(eq(this.schema.waitlist.code, code), eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"))
        )
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    if (!claim) return ok({ status: "NOT_FOUND" });
    if (claim.expiresAt && claim.expiresAt < new Date()) return ok({ status: "EXPIRED" });
    if (claim.status !== "INVITED") return ok({ status: "INVALID" });
    return ok({ status: "VALID" });
  }

  async findAccountClaimByCode(code: string, tx?: Orm): ServerResultAsync<AccountClaim | null> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(
          and(
            eq(this.schema.waitlist.code, code),
            eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"),
            eq(this.schema.waitlist.status, "INVITED"),
            gte(this.schema.waitlist.expiresAt, new Date())
          )
        )
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    return ok(claim ?? null);
  }

  async findAccountClaimById(id: string, tx?: Orm): ServerResultAsync<AccountClaim | null> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(and(eq(this.schema.waitlist.id, id), eq(this.schema.waitlist.type, "ACCOUNT_CLAIM")))
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    return ok(claim ?? null);
  }

  async findPendingAccountClaimForUser(
    userId: string,
    tx?: Orm
  ): ServerResultAsync<AccountClaim | null> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.waitlist)
        .where(
          and(
            eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"),
            eq(this.schema.waitlist.claimUserId, userId),
            eq(this.schema.waitlist.status, "INVITED"),
            gte(this.schema.waitlist.expiresAt, new Date())
          )
        )
        .orderBy(desc(this.schema.waitlist.createdAt))
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    return ok(claim ?? null);
  }

  async setAccountClaimEmail(
    { userId, email }: { userId: string; email: string },
    tx?: Orm
  ): ServerResultAsync<{ status: boolean }> {
    const db = tx ?? this.orm;
    const normalizedEmail = email.toLowerCase();

    const existingUserResult = await this.throwableQuery(() =>
      db
        .select({ id: this.schema.users.id })
        .from(this.schema.users)
        .where(and(eq(this.schema.users.email, normalizedEmail), ne(this.schema.users.id, userId)))
        .limit(1)
    );
    if (existingUserResult.isErr()) return err(existingUserResult.error);
    const [existingUser] = existingUserResult.value;
    if (existingUser) {
      return this.error("BAD_REQUEST", "Email is already in use");
    }

    const claimResult = await this.throwableQuery(() =>
      db
        .select({ id: this.schema.waitlist.id })
        .from(this.schema.waitlist)
        .where(
          and(
            eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"),
            eq(this.schema.waitlist.claimUserId, userId),
            eq(this.schema.waitlist.status, "INVITED"),
            gte(this.schema.waitlist.expiresAt, new Date())
          )
        )
        .orderBy(desc(this.schema.waitlist.createdAt))
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    if (!claim) {
      return this.error("BAD_REQUEST", "No pending claim found");
    }

    const updateUserResult = await this.throwableQuery(() =>
      db
        .update(this.schema.users)
        .set({
          email: normalizedEmail,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.users.id, userId))
    );
    if (updateUserResult.isErr()) return err(updateUserResult.error);

    const updateClaimResult = await this.throwableQuery(() =>
      db
        .update(this.schema.waitlist)
        .set({
          claimedEmail: normalizedEmail,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.waitlist.id, claim.id))
    );
    if (updateClaimResult.isErr()) return err(updateClaimResult.error);

    return ok({ status: true });
  }

  async acceptAccountClaim(userId: string, tx?: Orm): ServerResultAsync<{ status: boolean }> {
    const db = tx ?? this.orm;
    const claimResult = await this.throwableQuery(() =>
      db
        .select({ id: this.schema.waitlist.id })
        .from(this.schema.waitlist)
        .where(
          and(
            eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"),
            eq(this.schema.waitlist.claimUserId, userId),
            eq(this.schema.waitlist.status, "INVITED"),
            gte(this.schema.waitlist.expiresAt, new Date())
          )
        )
        .orderBy(desc(this.schema.waitlist.createdAt))
        .limit(1)
    );
    if (claimResult.isErr()) return err(claimResult.error);
    const [claim] = claimResult.value;
    if (!claim) return ok({ status: true });

    const userResult = await this.throwableQuery(() =>
      db
        .select({ email: this.schema.users.email })
        .from(this.schema.users)
        .where(eq(this.schema.users.id, userId))
        .limit(1)
    );
    if (userResult.isErr()) return err(userResult.error);
    const [user] = userResult.value;

    const updateResult = await this.throwableQuery(() =>
      db
        .update(this.schema.waitlist)
        .set({
          status: "ACCEPTED",
          claimedAt: new Date(),
          claimedEmail: user?.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.waitlist.id, claim.id))
    );
    if (updateResult.isErr()) return err(updateResult.error);
    return ok({ status: true });
  }

  async createAccountClaimMagicLink(
    {
      claimId,
      userId,
      email,
      token,
      url,
      expiresAt,
    }: {
      claimId: string;
      userId: string;
      email: string;
      token: string;
      url: string;
      expiresAt?: Date;
    },
    tx?: Orm
  ): ServerResultAsync<AccountClaimMagicLink> {
    const db = tx ?? this.orm;
    const linkResult = await this.throwableQuery(() =>
      db
        .insert(this.schema.accountClaimMagicLinks)
        .values({
          claimId,
          userId,
          email,
          token,
          url,
          expiresAt: expiresAt ?? null,
        })
        .returning()
    );
    if (linkResult.isErr()) return err(linkResult.error);
    const [link] = linkResult.value;
    return ok(link);
  }

  async listAccountClaimMagicLinks(
    claimId: string,
    tx?: Orm
  ): ServerResultAsync<AccountClaimMagicLinkOutput[]> {
    const db = tx ?? this.orm;
    const linksResult = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.accountClaimMagicLinks.id,
          claimId: this.schema.accountClaimMagicLinks.claimId,
          userId: this.schema.accountClaimMagicLinks.userId,
          email: this.schema.accountClaimMagicLinks.email,
          url: this.schema.accountClaimMagicLinks.url,
          expiresAt: this.schema.accountClaimMagicLinks.expiresAt,
          createdAt: this.schema.accountClaimMagicLinks.createdAt,
        })
        .from(this.schema.accountClaimMagicLinks)
        .where(eq(this.schema.accountClaimMagicLinks.claimId, claimId))
        .orderBy(desc(this.schema.accountClaimMagicLinks.createdAt))
    );
    if (linksResult.isErr()) return err(linksResult.error);
    return ok(linksResult.value);
  }

  async latestAccountClaimMagicLink(
    claimId: string,
    tx?: Orm
  ): ServerResultAsync<AccountClaimMagicLinkOutput | null> {
    const db = tx ?? this.orm;
    const linkResult = await this.throwableQuery(() =>
      db
        .select({
          id: this.schema.accountClaimMagicLinks.id,
          claimId: this.schema.accountClaimMagicLinks.claimId,
          userId: this.schema.accountClaimMagicLinks.userId,
          email: this.schema.accountClaimMagicLinks.email,
          url: this.schema.accountClaimMagicLinks.url,
          expiresAt: this.schema.accountClaimMagicLinks.expiresAt,
          createdAt: this.schema.accountClaimMagicLinks.createdAt,
        })
        .from(this.schema.accountClaimMagicLinks)
        .where(eq(this.schema.accountClaimMagicLinks.claimId, claimId))
        .orderBy(desc(this.schema.accountClaimMagicLinks.createdAt))
        .limit(1)
    );
    if (linkResult.isErr()) return err(linkResult.error);
    const [link] = linkResult.value;
    return ok(link ?? null);
  }

  async createOrganization(
    {
      name,
      parentId,
      userId,
      role,
    }: { name: string; parentId: string | null; userId: string; role: string },
    tx?: Orm
  ): ServerResultAsync<OrganizationRow> {
    const db = tx ?? this.orm;
    return await this.throwableQuery(() =>
      db.transaction(async (t) => {
        const [organization] = await t
          .insert(this.schema.organizations)
          .values({ name, slug: uuidv4(), type: "organization", parentId })
          .returning();

        if (!organization) throw new Error("Failed to create organization");

        const [member] = await t
          .insert(this.schema.members)
          .values({ userId, organizationId: organization.id, role })
          .returning();
        if (!member) throw new Error("Failed to create member");

        return organization;
      })
    );
  }
}
