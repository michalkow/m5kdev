import {
  ADMIN_CREATE_VERIFIED_USER_HEADER,
  ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE,
  USER_LOCALE_HEADER,
} from "@m5kdev/commons/modules/auth/auth.constants";
import {
  getAllowedLocaleCodes,
  resolveAppLocale,
  toCanonicalLocale,
} from "@m5kdev/commons/modules/auth/auth.locale";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthEndpoint,
  getOAuthState,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { admin, apiKey, lastLoginMethod, magicLink, organization } from "better-auth/plugins";
import { and, desc, eq, gte, type InferSelectModel } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { TFunction } from "i18next";
import { z } from "zod";
import type { BackendAppMetadata } from "../../app";
import type { AppI18n } from "../../i18n/app-i18n";
import { captureServerError } from "../../utils/errors";
import { logger as rootLogger } from "../../utils/logger";
import { posthogCapture } from "../../utils/posthog";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import * as auth from "./auth.db";
import {
  createOrganizationAndTeam,
  getActiveOrganizationAndTeam,
  getNewOrganization,
  getNewTeam,
} from "./auth.utils";

const schema = { ...auth };
type Schema = typeof schema;
export type Orm = LibSQLDatabase<Schema>;

export type User = InferSelectModel<typeof auth.users>;
export type Session = InferSelectModel<typeof auth.sessions>;
export type Organization = InferSelectModel<typeof auth.organizations>;
export type Member = InferSelectModel<typeof auth.members>;

export type BetterAuth = ReturnType<typeof betterAuth>;

function getRecordLocale(record: unknown): string | undefined {
  if (
    record !== null &&
    typeof record === "object" &&
    "locale" in record &&
    typeof (record as { locale: unknown }).locale === "string"
  ) {
    return (record as { locale: string }).locale;
  }

  return undefined;
}

function createUserHookI18nContext(
  user: unknown,
  appI18n?: AppI18n
): { i18n: AppI18n; locale: string; t: TFunction } | undefined {
  if (!appI18n) return undefined;

  const locale = getRecordLocale(user) ?? appI18n.defaultLocale;
  return {
    i18n: appI18n,
    locale,
    t: appI18n.getFixedT(locale),
  };
}

export type CreateBetterAuthConfigParams = {
  hooks?: {
    onError?: (error: unknown) => void;
    afterCreateUser?: (
      user: Pick<User, "id" | "email" | "emailVerified" | "name" | "createdAt" | "updatedAt">,
      membership: { organizationId: string; teamId?: string },
      ctx?: { i18n: AppI18n; locale: string; t: TFunction }
    ) => Promise<void>;
  };
  options?: BetterAuthOptions;
  app?: BackendAppMetadata;
  config?: {
    waitlist: boolean;
    provisionedAccountEmailDomain?: string;
  };
};

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
  i18n?: AppI18n;
} & CreateBetterAuthConfigParams;

function setPasswordEndpointPlugin(): BetterAuthPlugin {
  return {
    id: "m5kdev-set-password",
    endpoints: {
      setPassword: createAuthEndpoint(
        "/set-password",
        {
          method: "POST",
          body: z.object({
            newPassword: z.string(),
          }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const { newPassword } = ctx.body;
          const session = ctx.context.session;
          const minPasswordLength = ctx.context.password.config.minPasswordLength;
          if (newPassword.length < minPasswordLength) {
            throw new APIError("BAD_REQUEST", { message: "Password is too short" });
          }
          const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
          if (newPassword.length > maxPasswordLength) {
            throw new APIError("BAD_REQUEST", { message: "Password is too long" });
          }

          const existingCredentialAccount = (
            await ctx.context.internalAdapter.findAccounts(session.user.id)
          ).find((account) => account.providerId === "credential" && account.password);
          if (existingCredentialAccount) {
            throw new APIError("BAD_REQUEST", { message: "User already has a password" });
          }

          await ctx.context.internalAdapter.linkAccount({
            userId: session.user.id,
            providerId: "credential",
            accountId: session.user.id,
            password: await ctx.context.password.hash(newPassword),
          });

          return ctx.json({ status: true });
        }
      ),
    },
  };
}

export function createBetterAuth<
  O extends Orm,
  S extends Schema,
  E extends EmailService,
  B extends BillingService,
>({
  orm,
  schema,
  services,
  hooks,
  options,
  app,
  config,
  i18n,
}: CreateBetterAuthParams<O, S, E, B>): BetterAuth {
  const { email: emailService, billing: billingService } = services;
  const { waitlist = false, provisionedAccountEmailDomain } = config ?? {};
  const localeConfig = app?.locales;
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

  const getOrganizationInvitationCode = async (ctx?: { headers?: Headers | null } | null) => {
    let code = ctx?.headers?.get("organization-invitation-code");
    if (code) return code;
    const oauthState = await getOAuthState();
    if (oauthState) {
      code = oauthState.organizationInvitationCode;
    }
    return code;
  };

  const isProvisionedAccountEmail = (email: string) => {
    if (!normalizedProvisionedAccountEmailDomain) return false;
    return email.toLowerCase().endsWith(`@${normalizedProvisionedAccountEmailDomain}`);
  };

  const shouldVerifyEmailForAdminCreate = (ctx?: { headers?: Headers | null } | null): boolean => {
    const header = ctx?.headers?.get(ADMIN_CREATE_VERIFIED_USER_HEADER.toLowerCase());
    if (header !== ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE) return false;
    const role = (
      ctx as { context?: { session?: { user?: { role?: string | null } } | null } } | null
    )?.context?.session?.user?.role;
    return role === "admin";
  };

  const getUserLocaleFromContext = async (ctx?: { headers?: Headers | null } | null) => {
    let locale = ctx?.headers?.get(USER_LOCALE_HEADER.toLowerCase());
    if (locale) return locale;
    const oauthState = await getOAuthState();
    if (oauthState && typeof oauthState.userLocale === "string") {
      locale = oauthState.userLocale;
    }
    return locale ?? null;
  };

  const getOrganizationLocaleForInvitation = async (organizationId: string) => {
    const [organization] = await orm
      .select({ locale: schema.organizations.locale })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    return organization?.locale ?? null;
  };

  const resolveUserCreateLocale = async (
    ctx: { headers?: Headers | null } | null | undefined,
    organizationInvitationCode: string | null | undefined,
    organizationId?: string | null
  ): Promise<string | undefined> => {
    if (!localeConfig) return undefined;

    const requestedLocale = await getUserLocaleFromContext(ctx);
    const isAdminCreate = shouldVerifyEmailForAdminCreate(ctx);

    if (organizationInvitationCode) {
      const orgLocale =
        organizationId != null ? await getOrganizationLocaleForInvitation(organizationId) : null;
      if (
        requestedLocale &&
        toCanonicalLocale(requestedLocale, getAllowedLocaleCodes(localeConfig))
      ) {
        return resolveAppLocale(requestedLocale, localeConfig);
      }
      if (orgLocale) {
        return resolveAppLocale(orgLocale, localeConfig);
      }
      return resolveAppLocale(null, localeConfig);
    }

    if (isAdminCreate && requestedLocale) {
      return resolveAppLocale(requestedLocale, localeConfig);
    }

    if (requestedLocale) {
      return resolveAppLocale(requestedLocale, localeConfig);
    }

    return resolveAppLocale(null, localeConfig);
  };

  const withResolvedLocale = async <T extends Record<string, unknown>>(
    user: T,
    ctx: { headers?: Headers | null } | null | undefined,
    organizationInvitationCode: string | null | undefined,
    organizationId?: string | null
  ): Promise<T & { locale?: string }> => {
    const locale = await resolveUserCreateLocale(ctx, organizationInvitationCode, organizationId);
    if (!locale) return user;
    return { ...user, locale };
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
        // v2: preferences/metadata/flags removed from the cached payload
        version: "2",
      },
      additionalFields: {
        activeOrganizationRole: {
          type: "string",
          required: false,
          defaultValue: null,
        },
        activeOrganizationMemberId: {
          type: "string",
          required: false,
          defaultValue: null,
        },
        activeOrganizationType: {
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
          const locale = getRecordLocale(user);
          const result = await emailService?.sendDeleteAccountVerification(user.email, url, {
            locale,
          });
          if (result?.isErr()) {
            captureServerError(result.error, { logger }); // no-op when captured at creation
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
        // returned: false keeps these out of session responses and the
        // session cookie cache (4KB limit); read them via auth.service procedures
        preferences: {
          type: "string",
          required: false,
          defaultValue: null,
          returned: false,
        },
        metadata: {
          type: "string",
          required: false,
          defaultValue: null,
          returned: false,
        },
        flags: {
          type: "string",
          required: false,
          defaultValue: null,
          returned: false,
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
        locale: {
          type: "string",
          required: false,
          defaultValue: null,
          input: true,
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
        const locale = getRecordLocale(user);
        const result = await emailService?.sendResetPassword(user.email, url, { locale });
        if (result?.isErr()) {
          captureServerError(result.error, { logger }); // no-op when captured at creation
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const locale = getRecordLocale(user);
        const result = await emailService?.sendVerification(user.email, url, { locale });
        if (result?.isErr()) {
          captureServerError(result.error, { logger }); // no-op when captured at creation
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    plugins: [
      ...(options?.plugins ?? []),
      setPasswordEndpointPlugin(),
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
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => {
            const customExpiration = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
            return {
              data: {
                ...invitation,
                expiresAt: customExpiration,
              },
            };
          },
        },
        allowUserToCreateOrganization: false,
        teams: {
          enabled: true,
          allowRemovingAllTeams: false,
        },
        sendInvitationEmail: async (data) => {
          const invitationUrl = `${webUrl}/organization/accept-invitation?id=${data.id}`;
          const inviterName = data.inviter.user.name || data.inviter.user.email;
          const organizationLocale = getRecordLocale(data.organization);
          const result = await emailService?.sendOrganizationInvite(
            data.email,
            data.organization.name,
            inviterName,
            data.role,
            invitationUrl,
            { locale: organizationLocale }
          );
          if (result?.isErr()) {
            captureServerError(result.error, { logger }); // no-op when captured at creation
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
              metadata: {
                type: "string",
                required: false,
                defaultValue: null,
              },
              flags: {
                type: "string",
                required: false,
                defaultValue: null,
              },
            },
          },
          invitation: {
            modelName: "invitation",
          },
          organization: {
            modelName: "organization",
            additionalFields: {
              parentId: {
                type: "string",
                required: false,
                defaultValue: null,
              },
              type: {
                type: "string",
                required: false,
                defaultValue: "organization",
              },
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
              metadata: {
                type: "string",
                required: false,
                defaultValue: null,
              },
              flags: {
                type: "string",
                required: false,
                defaultValue: null,
              },
              locale: {
                type: "string",
                required: false,
                defaultValue: null,
                input: true,
              },
            },
          },
        },
      }),
      apiKey(),
    ],
    trustedOrigins: [webUrl!, apiUrl!],

    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            logger.info({ step: "before create user", user, ctx });
            const organizationInvitationCode = await getOrganizationInvitationCode(ctx);
            if (organizationInvitationCode) {
              const [invitation] = await orm
                .select()
                .from(schema.invitations)
                .where(
                  and(
                    eq(schema.invitations.email, user.email),
                    eq(schema.invitations.id, organizationInvitationCode),
                    eq(schema.invitations.status, "pending"),
                    gte(schema.invitations.expiresAt, new Date())
                  )
                )
                .limit(1);
              if (!invitation) {
                const message = "Invalid or expired organization invitation code";
                logger.error({ message, organizationInvitationCode });
                throw new APIError("NOT_FOUND", {
                  message,
                });
              }
              const userWithLocale = await withResolvedLocale(
                user,
                ctx,
                organizationInvitationCode,
                invitation.organizationId
              );
              return {
                data: {
                  ...userWithLocale,
                  emailVerified: true,
                },
              };
            }
            if (shouldVerifyEmailForAdminCreate(ctx)) {
              const userWithLocale = await withResolvedLocale(user, ctx, null);
              return {
                data: {
                  ...userWithLocale,
                  emailVerified: true,
                },
              };
            }
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
                  const message = "Invalid or expired waitlist invitation code";
                  logger.error({ message, waitlistCode });
                  throw new APIError("NOT_FOUND", { message });
                }
                await orm
                  .update(schema.waitlist)
                  .set({
                    status: "ACCEPTED",
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.waitlist.id, waitlistInvitation.id));
                const userWithLocale = await withResolvedLocale(user, ctx, null);
                return {
                  data: {
                    ...userWithLocale,
                    emailVerified: true,
                  },
                };
              }
              const message = "Waitlist invitation code not found";
              logger.error({ message, waitlistCode });
              throw new APIError("NOT_FOUND", { message });
            }
            const userWithLocale = await withResolvedLocale(user, ctx, null);
            return { data: userWithLocale };
          },
          after: async (user, ctx) => {
            const organizationInvitationCode = await getOrganizationInvitationCode(ctx);
            if (organizationInvitationCode) {
              const [invitation] = await orm
                .select()
                .from(schema.invitations)
                .where(
                  and(
                    eq(schema.invitations.email, user.email),
                    eq(schema.invitations.id, organizationInvitationCode),
                    eq(schema.invitations.status, "pending"),
                    gte(schema.invitations.expiresAt, new Date())
                  )
                )
                .limit(1);
              if (!invitation) {
                const message = "Invalid or expired organization invitation code (after)";
                logger.error({ message, organizationInvitationCode });
                throw new APIError("NOT_FOUND", { message });
              }

              const [member] = await orm
                .insert(schema.members)
                .values({
                  userId: user.id,
                  organizationId: invitation.organizationId,
                  role: invitation.role || "member",
                })
                .returning();
              if (!member) {
                const message = "Failed to add user to organization";
                logger.error({ message });
                throw new APIError("INTERNAL_SERVER_ERROR", { message });
              }
              await orm
                .update(schema.invitations)
                .set({
                  status: "accepted",
                })
                .where(eq(schema.invitations.id, organizationInvitationCode));
              if (hooks?.afterCreateUser) {
                const i18nCtx = createUserHookI18nContext(user, i18n);
                await hooks.afterCreateUser(
                  user,
                  { organizationId: invitation.organizationId },
                  i18nCtx
                );
              }
            } else {
              const userLocale = typeof user.locale === "string" ? user.locale : undefined;
              const membership = await createOrganizationAndTeam(orm, schema, user, userLocale);
              if (hooks?.afterCreateUser) {
                const i18nCtx = createUserHookI18nContext(user, i18n);
                await hooks.afterCreateUser(user, membership, i18nCtx);
              }
            }

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
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const {
              organizationId,
              teamId,
              organizationRole,
              teamRole,
              organizationType,
              organizationMemberId,
            } = await getActiveOrganizationAndTeam(orm, schema, session.userId);
            return {
              data: {
                ...session,
                activeOrganizationId: organizationId,
                activeTeamId: teamId,
                activeOrganizationType: organizationType,
                activeOrganizationRole: organizationRole,
                activeOrganizationMemberId: organizationMemberId,
                activeTeamRole: teamRole,
              },
            };
          },
        },
        update: {
          before: async (session, ctx) => {
            const data = { ...session };
            const prevSession = ctx?.context.session?.session;
            const { activeOrganizationId, activeTeamId } = session;

            if (prevSession) {
              if (
                activeOrganizationId &&
                activeOrganizationId !== prevSession.activeOrganizationId
              ) {
                const newOrganization = await getNewOrganization(
                  orm,
                  schema,
                  activeOrganizationId as string,
                  prevSession.userId
                );

                data.activeOrganizationType = newOrganization.type;
                data.activeOrganizationRole = newOrganization.role;
                data.activeOrganizationMemberId = newOrganization.memberId;
                data.activeTeamId = newOrganization.teamId;
                data.activeTeamRole = newOrganization.teamRole;
              }

              if (activeTeamId && activeTeamId !== prevSession.activeTeamId) {
                const newTeam = await getNewTeam(
                  orm,
                  schema,
                  activeTeamId as string,
                  prevSession.userId
                );
                data.activeTeamRole = newTeam.role;
              }
            }
            logger.debug({
              step: "before update session",
              currentSession: session,
              prevSession,
              nextSession: data,
            });
            return { data };
          },
        },
      },
    },
  });
}
