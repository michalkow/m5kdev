import {
  BaseModule,
  type ModuleExpressContext,
  type TableMap,
} from "@m5kdev/backend/modules/base/base.module";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

type TestHarnessTables = TableMap;

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sendJson(res: Response, status: number, body: unknown) {
  res
    .status(status)
    .type("application/json")
    .send(JSON.stringify(body, null, 2));
}

export class TestHarnessModule extends BaseModule<
  Record<string, never>,
  TestHarnessTables,
  Record<string, never>,
  Record<string, never>,
  never
> {
  readonly id = "auth-e2e-test-harness";
  override readonly dbDependsOn = ["auth"] as const;

  override express({ db, infra }: ModuleExpressContext<Record<string, never>>) {
    infra.express.get("/__auth-e2e/user.json", async (req: Request, res: Response) => {
      const email = normalizedEmail(req.query.email);
      if (!email) {
        sendJson(res, 400, { error: "email is required" });
        return;
      }

      const [user] = await db.orm
        .select({
          id: db.schema.users.id,
          name: db.schema.users.name,
          email: db.schema.users.email,
          emailVerified: db.schema.users.emailVerified,
          role: db.schema.users.role,
          banned: db.schema.users.banned,
        })
        .from(db.schema.users)
        .where(eq(db.schema.users.email, email))
        .limit(1);

      if (!user) {
        sendJson(res, 404, { error: "user not found" });
        return;
      }

      const organizations = await db.orm
        .select({
          id: db.schema.organizations.id,
          name: db.schema.organizations.name,
          slug: db.schema.organizations.slug,
          type: db.schema.organizations.type,
          parentId: db.schema.organizations.parentId,
          role: db.schema.members.role,
        })
        .from(db.schema.members)
        .innerJoin(
          db.schema.organizations,
          eq(db.schema.members.organizationId, db.schema.organizations.id)
        )
        .where(eq(db.schema.members.userId, user.id));

      const [credentialAccount] = await db.orm
        .select({ id: db.schema.accounts.id })
        .from(db.schema.accounts)
        .where(
          and(
            eq(db.schema.accounts.userId, user.id),
            eq(db.schema.accounts.providerId, "credential"),
            isNotNull(db.schema.accounts.password)
          )
        )
        .limit(1);

      const accountClaims = await db.orm
        .select({
          id: db.schema.waitlist.id,
          status: db.schema.waitlist.status,
          claimUserId: db.schema.waitlist.claimUserId,
          claimedEmail: db.schema.waitlist.claimedEmail,
          claimedAt: db.schema.waitlist.claimedAt,
          expiresAt: db.schema.waitlist.expiresAt,
        })
        .from(db.schema.waitlist)
        .where(
          and(
            eq(db.schema.waitlist.type, "ACCOUNT_CLAIM"),
            eq(db.schema.waitlist.claimUserId, user.id)
          )
        )
        .orderBy(desc(db.schema.waitlist.createdAt));

      const [latestSession] = await db.orm
        .select({
          id: db.schema.sessions.id,
          userId: db.schema.sessions.userId,
          activeOrganizationId: db.schema.sessions.activeOrganizationId,
          activeOrganizationRole: db.schema.sessions.activeOrganizationRole,
          activeOrganizationType: db.schema.sessions.activeOrganizationType,
          activeTeamId: db.schema.sessions.activeTeamId,
          impersonatedBy: db.schema.sessions.impersonatedBy,
          createdAt: db.schema.sessions.createdAt,
        })
        .from(db.schema.sessions)
        .where(eq(db.schema.sessions.userId, user.id))
        .orderBy(desc(db.schema.sessions.createdAt))
        .limit(1);

      sendJson(res, 200, {
        user,
        organizations,
        credentialAccount: Boolean(credentialAccount),
        accountClaims,
        pendingAccountClaims: accountClaims.filter((claim) => claim.status === "INVITED").length,
        acceptedAccountClaims: accountClaims.filter((claim) => claim.status === "ACCEPTED").length,
        latestSession: latestSession ?? null,
      });
    });

    infra.express.post(
      "/__auth-e2e/provisioned-claim-user",
      async (req: Request, res: Response) => {
        const email = normalizedEmail((req.body as { email?: unknown }).email);
        const expiresInHours =
          typeof (req.body as { expiresInHours?: unknown }).expiresInHours === "number"
            ? (req.body as { expiresInHours: number }).expiresInHours
            : 24 * 14;
        const createClaim = (req.body as { createClaim?: unknown }).createClaim === true;

        if (!email.endsWith("@provisioned.auth-e2e.local")) {
          sendJson(res, 400, { error: "email must use the provisioned auth-e2e domain" });
          return;
        }

        const [existing] = await db.orm
          .select({ id: db.schema.users.id })
          .from(db.schema.users)
          .where(eq(db.schema.users.email, email))
          .limit(1);

        if (existing) {
          sendJson(res, 409, { error: "user already exists" });
          return;
        }

        const now = new Date();
        const userId = uuidv4();
        const organizationId = uuidv4();
        const teamId = uuidv4();
        const claimId = createClaim ? uuidv4() : null;

        await db.orm.transaction(async (tx) => {
          await tx.insert(db.schema.users).values({
            id: userId,
            name: `Provisioned ${email}`,
            email,
            emailVerified: false,
            role: "user",
            createdAt: now,
            updatedAt: now,
          });

          await tx.insert(db.schema.organizations).values({
            id: organizationId,
            name: `Provisioned ${userId.slice(0, 8)}`,
            slug: `provisioned-${userId.slice(0, 8)}`,
            type: "organization",
            createdAt: now,
          });

          await tx.insert(db.schema.members).values({
            id: uuidv4(),
            organizationId,
            userId,
            role: "owner",
            createdAt: now,
          });

          await tx.insert(db.schema.teams).values({
            id: teamId,
            name: "Editorial",
            organizationId,
            createdAt: now,
            updatedAt: now,
          });

          await tx.insert(db.schema.teamMembers).values({
            id: uuidv4(),
            teamId,
            userId,
            role: "owner",
            createdAt: now,
          });

          if (claimId) {
            await tx.insert(db.schema.waitlist).values({
              id: claimId,
              type: "ACCOUNT_CLAIM",
              status: "INVITED",
              claimUserId: userId,
              code: uuidv4(),
              expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
              createdAt: now,
              updatedAt: now,
            });
          }
        });

        sendJson(res, 201, {
          user: { id: userId, email },
          organization: { id: organizationId },
          claim: claimId ? { id: claimId } : null,
        });
      }
    );
  }
}
