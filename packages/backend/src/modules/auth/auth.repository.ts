import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseTableRepository } from "../base/base.repository";
import * as auth from "./auth.db";
import {
  accountClaimMagicLinkSchemas,
  organizationSchemas,
  waitlistSchema,
  waitlistSchemas,
} from "./auth.dto";

const schema = { ...auth };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;
type UserRow = typeof auth.users.$inferSelect;
type OrganizationRow = typeof auth.organizations.$inferSelect;

export class AuthUserRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["users"]
> {}

export class AuthOrganizationRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["organizations"]
> {
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

  listUserOrganizations = this.query<string>("listUserOrganizations")
    .output(z.array(organizationSchemas.output.simple))
    .handle(async (userId) => {
      return this.throwableQuery(() =>
        this.orm
          .select({
            id: this.schema.organizations.id,
            name: this.schema.organizations.name,
            slug: this.schema.organizations.slug,
            logo: this.schema.organizations.logo,
            type: this.schema.organizations.type,
            parentId: this.schema.organizations.parentId,
            createdAt: this.schema.organizations.createdAt,
          })
          .from(this.schema.organizations)
          .innerJoin(
            this.schema.members,
            eq(this.schema.organizations.id, this.schema.members.organizationId)
          )
          .where(eq(this.schema.members.userId, userId))
          .then((rows) => {
            const seen = new Set<string>();
            return rows.filter((row) => {
              if (seen.has(row.id)) return false;
              seen.add(row.id);
              return true;
            });
          })
      );
    });
}

export class AuthInvitationRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["invitations"]
> {}

export class AuthWaitlistRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["waitlist"]
> {
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

  inviteFromWaitlist = this.query("inviteFromWaitlist")
    .input(waitlistSchemas.input.inviteFrom)
    .output(waitlistSchema)
    .handle(async ({ id }) => {
      const result = await this.throwableQuery(() =>
        this.orm
          .update(this.schema.waitlist)
          .set({
            status: "INVITED",
            code: uuidv4(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
          })
          .where(eq(this.schema.waitlist.id, id))
          .returning()
      );
      if (result.isErr()) return err(result.error);
      const [waitlist] = result.value;
      return waitlist;
    });

  inviteToWaitlist = this.query<{ email: string; userId: string; name?: string }>(
    "inviteToWaitlist"
  )
    .output(waitlistSchemas.output.full)
    .handle(async ({ email, userId, name }) => {
      const result = await this.throwableQuery(() =>
        this.orm
          .insert(this.schema.waitlist)
          .values({
            email,
            name,
            status: "INVITED",
            code: uuidv4(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            userId,
          })
          .returning()
      );
      if (result.isErr()) return err(result.error);
      const [waitlist] = result.value;
      return waitlist;
    });

  createInvitationCode = this.query<{ userId: string; name?: string }>("createInvitationCode")
    .output(waitlistSchemas.output.full)
    .handle(async ({ userId, name }) => {
      const result = await this.throwableQuery(() =>
        this.orm
          .insert(this.schema.waitlist)
          .values({
            name,
            status: "INVITED",
            code: uuidv4(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            userId,
          })
          .returning()
      );
      if (result.isErr()) return err(result.error);
      const [waitlist] = result.value;
      return waitlist;
    });

  removeFromWaitlist = this.query("removeFromWaitlist")
    .input(waitlistSchemas.input.remove)
    .output(waitlistSchemas.output.single)
    .handle(async ({ id }) => {
      const result = await this.throwableQuery(() =>
        this.orm
          .update(this.schema.waitlist)
          .set({ status: "REMOVED" })
          .where(eq(this.schema.waitlist.id, id))
          .returning()
      );
      if (result.isErr()) return err(result.error);
      const [waitlist] = result.value;
      return waitlist;
    });

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

  createAccountClaimCode = this.query("createAccountClaimCode")
    .input(accountClaimMagicLinkSchemas.input.create)
    .output(waitlistSchemas.output.claim)
    .handle(async ({ userId, expiresInHours = 24 * 14 }) => {
      const result = await this.throwableQuery(() =>
        this.orm
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
      if (result.isErr()) return err(result.error);
      const [claim] = result.value;
      return claim;
    });

  findPendingAccountClaimForUser = this.query<string>("findPendingAccountClaimForUser")
    .output(waitlistSchemas.output.claim.nullable())
    .handle(async (userId) => {
      const result = await this.throwableQuery(() =>
        this.orm
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
      if (result.isErr()) return err(result.error);
      const [claim] = result.value;
      return claim ?? null;
    });

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
  }): ServerResultAsync<{
    user: UserRow;
    claim: z.infer<typeof waitlistSchemas.output.claim>;
  }> {
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

  findAccountClaimByCode = this.query("findAccountClaimByCode")
    .input(waitlistSchemas.input.validateCode)
    .output(waitlistSchemas.output.claim.nullable())
    .handle(async ({ code }) => {
      const result = await this.throwableQuery(() =>
        this.orm
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
      if (result.isErr()) return err(result.error);
      const [claim] = result.value;
      return claim ?? null;
    });

  findAccountClaimById = this.query<string>("findAccountClaimById")
    .output(waitlistSchemas.output.claim.nullable())
    .handle(async (id) => {
      const result = await this.throwableQuery(() =>
        this.orm
          .select()
          .from(this.schema.waitlist)
          .where(
            and(eq(this.schema.waitlist.id, id), eq(this.schema.waitlist.type, "ACCOUNT_CLAIM"))
          )
          .limit(1)
      );
      if (result.isErr()) return err(result.error);
      const [claim] = result.value;
      return claim ?? null;
    });

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
    if (!user) return this.error("BAD_REQUEST", "User not found");

    const verifyUserResult = await this.throwableQuery(() =>
      db
        .update(this.schema.users)
        .set({
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.users.id, userId))
    );
    if (verifyUserResult.isErr()) return err(verifyUserResult.error);

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
}

export class AuthAccountClaimRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["accountClaimMagicLinks"]
> {
  listAccountClaimMagicLinks = this.query("listAccountClaimMagicLinks")
    .input(accountClaimMagicLinkSchemas.input.listLinks)
    .output(z.array(accountClaimMagicLinkSchemas.output.single))
    .handle(async ({ claimId }) => {
      return this.throwableQuery(() =>
        this.orm
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
    });

  latestAccountClaimMagicLink = this.query("latestAccountClaimMagicLink")
    .input(accountClaimMagicLinkSchemas.input.listLinks)
    .output(accountClaimMagicLinkSchemas.output.single.nullable())
    .handle(async ({ claimId }) => {
      const result = await this.throwableQuery(() =>
        this.orm
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
      if (result.isErr()) return err(result.error);
      const [link] = result.value;
      return link ?? null;
    });
}
