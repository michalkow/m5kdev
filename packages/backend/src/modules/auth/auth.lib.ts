import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getOAuthState } from "better-auth/api";
import { admin, apiKey, lastLoginMethod, magicLink, organization } from "better-auth/plugins";
import { and, desc, eq, gte, type InferSelectModel } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { BackendAppMetadata } from "../../app";
import { logger as rootLogger } from "../../utils/logger";
import { posthogCapture } from "../../utils/posthog";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import * as auth from "./auth.db";
import { createOrganizationAndTeam, getActiveOrganizationAndTeam } from "./auth.utils";

const schema = { ...auth };
type Schema = typeof schema;
export type Orm = LibSQLDatabase<Schema>;

export type User = InferSelectModel<typeof auth.users>;
export type Session = InferSelectModel<typeof auth.sessions>;

export type BetterAuth = ReturnType<typeof betterAuth>;

type CreateBetterAuthParams<
  O extends Orm,
  S extends Schema,
  E extends EmailService,
  B extends BillingService,
> = {
  orm: O;
  schema: S;
  services: {
    email?: E;
    billing?: B;
  };
  hooks?: {
    onError?: (error: unknown) => void;
    afterCreateUser?: (
      user: Pick<User, "id" | "email" | "emailVerified" | "name" | "createdAt" | "updatedAt">,
      membership: { organizationId: string; teamId: string }
    ) => Promise<void>;
  };
  options?: BetterAuthOptions;
  app?: BackendAppMetadata;
  config?: {
    waitlist: boolean;
    provisionedAccountEmailDomain?: string;
  };
};

export function createBetterAuth<
  O extends Orm,
  S extends Schema,
  E extends EmailService,
  B extends BillingService,
>({ orm, schema, services, hooks, options, app, config }: CreateBetterAuthParams<O, S, E, B>) {
  const { email: emailService, billing: billingService } = services;
  const { waitlist = false, provisionedAccountEmailDomain } = config ?? {};
  const webUrl = app?.urls?.web ?? process.env.VITE_APP_URL;
  const apiUrl = app?.urls?.api ?? process.env.VITE_SERVER_URL;
  const normalizedProvisionedAccountEmailDomain = provisionedAccountEmailDomain
    ? provisionedAccountEmailDomain.toLowerCase().replace(/^@/, "")
    : null;

  const logger = rootLogger.child({ layer: "betterAuth" });

  const getWaitlistInvitationCode = async (ctx?: { headers?: Headers | null } | null) => {
    let code = ctx?.headers?.get("waitlist-invitation-code");
    if (code) return code;
    const oauthState = await getOAuthState();
    if (oauthState) {
      code = oauthState.waitlistInvitationCode;
    }
    return code;
  };

  const isProvisionedAccountEmail = (email: string) => {
    if (!normalizedProvisionedAccountEmailDomain) return false;
    return email.toLowerCase().endsWith(`@${normalizedProvisionedAccountEmailDomain}`);
  };

  return betterAuth({
    ...options,
    baseURL: apiUrl!,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
      additionalFields: {
        activeOrganizationRole: {
          type: "string",
          required: false,
          defaultValue: null,
        },
        activeTeamRole: {
          type: "string",
          required: false,
          defaultValue: null,
        },
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          const result = await emailService?.sendDeleteAccountVerification(user.email, url);
          if (result?.isErr()) {
            logger.error(result.error);
            hooks?.onError?.(result.error);
            throw result.error;
          }
        },
      },
      additionalFields: {
        onboarding: {
          type: "number",
          required: false,
          defaultValue: null,
        },
        preferences: {
          type: "string",
          required: false,
          defaultValue: null,
        },
        flags: {
          type: "string",
          required: false,
          defaultValue: null,
        },
        stripeCustomerId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
        paymentCustomerId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
        paymentPlanTier: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
        paymentPlanExpiresAt: {
          type: "number",
          required: false,
          defaultValue: null,
          input: false,
        },
      },
    },
    database: drizzleAdapter(orm, {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !waitlist,
      sendResetPassword: async ({ user, url }) => {
        const result = await emailService?.sendResetPassword(user.email, url);
        if (result?.isErr()) {
          logger.error(result.error);
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const result = await emailService?.sendVerification(user.email, url);
        if (result?.isErr()) {
          logger.error(result.error);
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    plugins: [
      ...(options?.plugins ?? []),
      magicLink({
        disableSignUp: true,
        sendMagicLink: async ({ email, url, token }) => {
          const [user] = await orm
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, email.toLowerCase()))
            .limit(1);

          if (!user) return;

          const [claim] = await orm
            .select({ id: schema.waitlist.id })
            .from(schema.waitlist)
            .where(
              and(
                eq(schema.waitlist.type, "ACCOUNT_CLAIM"),
                eq(schema.waitlist.claimUserId, user.id),
                eq(schema.waitlist.status, "INVITED"),
                gte(schema.waitlist.expiresAt, new Date())
              )
            )
            .orderBy(desc(schema.waitlist.createdAt))
            .limit(1);
          if (claim) {
            await orm.insert(schema.accountClaimMagicLinks).values({
              claimId: claim.id,
              userId: user.id,
              email: email.toLowerCase(),
              token,
              url,
              expiresAt: new Date(Date.now() + 1000 * 60 * 5),
            });
          }
        },
      }),
      admin(),
      lastLoginMethod(),
      organization({
        allowUserToCreateOrganization: false,
        teams: {
          enabled: true,
          allowRemovingAllTeams: false,
        },
        sendInvitationEmail: async (data) => {
          const invitationUrl = `${webUrl}/organization/accept-invitation?id=${data.id}`;
          const inviterName = data.inviter.user.name || data.inviter.user.email;
          const result = await emailService?.sendOrganizationInvite(
            data.email,
            data.organization.name,
            inviterName,
            data.role,
            invitationUrl
          );
          if (result?.isErr()) {
            logger.error(result.error);
            hooks?.onError?.(result.error);
            throw result.error;
          }
        },
        schema: {
          team: {
            modelName: "team",
          },
          teamMember: {
            modelName: "teamMember",
            additionalFields: {
              role: {
                type: "string",
                required: true,
              },
            },
          },
          member: {
            modelName: "member",
          },
          invitation: {
            modelName: "invitation",
          },
          organization: {
            modelName: "organization",
          },
        },
      }),
      apiKey(),
    ],
    trustedOrigins: [webUrl!, apiUrl!],

    databaseHooks: {
      user: {
        create: {
          before: async (_user, ctx) => {
            if (waitlist) {
              const waitlistCode = await getWaitlistInvitationCode(ctx);
              if (waitlistCode) {
                const [waitlistInvitation] = await orm
                  .select()
                  .from(schema.waitlist)
                  .where(
                    and(
                      eq(schema.waitlist.code, waitlistCode),
                      eq(schema.waitlist.type, "WAITLIST"),
                      eq(schema.waitlist.status, "INVITED"),
                      gte(schema.waitlist.expiresAt, new Date())
                    )
                  )
                  .limit(1);

                if (!waitlistInvitation) {
                  return false;
                }
                await orm
                  .update(schema.waitlist)
                  .set({
                    status: "ACCEPTED",
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.waitlist.id, waitlistInvitation.id));
                return;
              }
            }

            if (waitlist) {
              return false;
            }
            return;
          },
          after: async (user) => {
            const membership = await createOrganizationAndTeam(orm, schema, user);
            if (!isProvisionedAccountEmail(user.email)) {
              await billingService?.createUserHook({ user });
            }
            posthogCapture({
              distinctId: user.id,
              event: "user_created",
              properties: {
                email: user.email,
                name: user.name,
                role: user.role,
                image: user.image,
              },
            });
            if (hooks?.afterCreateUser) await hooks.afterCreateUser(user, membership);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const { organizationId, teamId, organizationRole, teamRole } =
              await getActiveOrganizationAndTeam(orm, schema, session.userId);
            return {
              data: {
                ...session,
                activeOrganizationId: organizationId,
                activeTeamId: teamId,
                activeOrganizationRole: organizationRole,
                activeTeamRole: teamRole,
              },
            };
          },
        },
      },
    },
  });
}
