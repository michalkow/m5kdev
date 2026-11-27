import { apiKey as createApiKeyPlugin } from "@better-auth/api-key";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import {
  ADMIN_CREATE_VERIFIED_USER_HEADER,
  ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE,
  USER_CURRENCY_HEADER,
  USER_LOCALE_HEADER,
  USER_PRICE_ID_HEADER,
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
import { admin, bearer, lastLoginMethod, magicLink, organization } from "better-auth/plugins";
import { and, desc, eq, gte, type InferSelectModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TFunction } from "i18next";
import { z } from "zod";
import type { BackendAppMetadata } from "../../app";
import { ExperienceContextError } from "../../experience";
import type { ExperienceFlowSigner } from "../../experience-flows";
import { EXPERIENCE_FLOW_HEADER } from "../../experience-flows";
import type { AppI18n } from "../../i18n/app-i18n";
import { resolvePresentationMetadata } from "../../presentation";
import { captureServerError, ServerError } from "../../utils/errors";
import { logger as rootLogger } from "../../utils/logger";
import { posthogCapture } from "../../utils/posthog";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import {
  type SignupContinuation,
  signupContinuationSchema,
  verifyClaimContinuation,
  verifyInvitationContinuation,
  verifyWaitlistContinuation,
} from "./auth.continuation";
import * as auth from "./auth.db";
import {
  bindAuthRecoveryLink,
  experienceAuthPlugin,
  resolveAuthExperience,
  validateAuthTransport,
} from "./auth.experience";
import { createMcpOAuthPlugins } from "./auth.mcp-plugins";
import * as oauth from "./auth.oauth.db";
import {
  acceptWaitlistCodeAfterUser,
  assertWaitlistCodeUsable,
  attachUserToInvitedMember,
  createOrganizationWithOwner,
  getActiveOrganization,
  getNewOrganization,
  OrganizationCurrencyError,
  syncActiveMemberProfiles,
  WaitlistCodeNotFound,
} from "./auth.utils";

const schema = { ...auth, ...oauth };
type Schema = typeof schema;
/** Auth tables `createBetterAuth` queries. Caller schemas may add app tables and omit MCP/oauth. */
type AuthQuerySchema = typeof auth;
export type Orm = NodePgDatabase<Schema>;

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
  /** When set, Auth registers jwt + mcp + CIMD. Omit so apps without McpModule stay off MCP OAuth. */
  mcp?: {
    resource: string;
  };
  hooks?: {
    onError?: (error: unknown) => void;
    afterCreateUser?: (
      user: Pick<User, "id" | "email" | "emailVerified" | "name" | "createdAt" | "updatedAt">,
      membership: { organizationId: string },
      ctx?: { i18n: AppI18n; locale: string; t: TFunction }
    ) => Promise<void>;
  };
  options?: BetterAuthOptions;
  experienceFlows?: ExperienceFlowSigner;
  app?: BackendAppMetadata;
  config?: {
    waitlist: boolean;
    provisionedAccountEmailDomain?: string;
  };
};

type CreateBetterAuthParams<
  O extends Orm,
  S extends AuthQuerySchema,
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

function joinAppPath(baseUrl: string, pathSegment: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathSegment, base).href;
}

function setPasswordEndpointPlugin(
  guard?: (input: {
    userId: string;
    claimId?: string;
    experienceFlow?: string;
    request?: Request;
    headers?: Headers;
  }) => Promise<void>
): BetterAuthPlugin {
  return {
    id: "m5kdev-set-password",
    endpoints: {
      setPassword: createAuthEndpoint(
        "/set-password",
        {
          method: "POST",
          body: z.object({
            newPassword: z.string(),
            claimId: z.string().optional(),
            experienceFlow: z.string().optional(),
          }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const { newPassword } = ctx.body;
          const session = ctx.context.session;
          await guard?.({
            userId: session.user.id,
            claimId: ctx.body.claimId,
            experienceFlow: ctx.body.experienceFlow,
            request: ctx.request,
            headers: ctx.headers,
          });
          const minPasswordLength = ctx.context.password.config.minPasswordLength;
          if (newPassword.length < minPasswordLength) {
            throw new APIError("BAD_REQUEST", {
              message: "Password is too short",
            });
          }
          const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
          if (newPassword.length > maxPasswordLength) {
            throw new APIError("BAD_REQUEST", {
              message: "Password is too long",
            });
          }

          const existingCredentialAccount = (
            await ctx.context.internalAdapter.findAccounts(session.user.id)
          ).find((account) => account.providerId === "credential" && account.password);
          if (existingCredentialAccount) {
            throw new APIError("BAD_REQUEST", {
              message: "User already has a password",
            });
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
  S extends AuthQuerySchema,
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
  mcp,
  experienceFlows,
}: CreateBetterAuthParams<O, S, E, B>): BetterAuth {
  const { email: emailService, billing: billingService } = services;
  const { waitlist = false, provisionedAccountEmailDomain } = config ?? {};
  const localeConfig = app?.locales;
  const presentation = resolvePresentationMetadata(app, process.env);
  const webUrl = presentation.urls.web;
  const apiUrl = presentation.urls.api;
  const experienceRegistry = presentation.experienceRegistry;
  const multiExperience = experienceRegistry?.strict === true;
  if (
    multiExperience &&
    new Set(
      Object.values(experienceRegistry.config.definitions)
        .filter((definition) => !definition.disabled)
        .map((definition) => new URL(definition.apiOrigin).protocol)
    ).size !== 1
  )
    throw new Error(
      "Auth Experience API origins must use one protocol; split mixed HTTP/HTTPS Auth compositions explicitly"
    );
  if (multiExperience && emailService && !experienceFlows)
    throw new Error("Experience flow signing is required for multi-Experience recovery email");
  const normalizedProvisionedAccountEmailDomain = provisionedAccountEmailDomain
    ? provisionedAccountEmailDomain.toLowerCase().replace(/^@/, "")
    : null;

  const logger = rootLogger.child({ layer: "betterAuth" });

  const getLegacyWaitlistInvitationCode = async (ctx?: { headers?: Headers | null } | null) => {
    let code = ctx?.headers?.get("waitlist-invitation-code");
    if (code) return code;
    const oauthState = await getOAuthState();
    if (oauthState) {
      code = oauthState.waitlistInvitationCode;
    }
    return code;
  };

  const getLegacyOrganizationInvitationCode = async (ctx?: { headers?: Headers | null } | null) => {
    let code = ctx?.headers?.get("organization-invitation-code");
    if (code) return code;
    const oauthState = await getOAuthState();
    if (oauthState) {
      code = oauthState.organizationInvitationCode;
    }
    return code;
  };

  type SignupContext = { request?: Request; headers?: Headers | null } | null | undefined;
  const signupError = () =>
    new APIError("BAD_REQUEST", {
      message: "This link is invalid or has expired. Request a new link from the same website.",
    });
  const readSignupContinuation = (
    headers?: Headers | null,
    additionalData?: unknown
  ): SignupContinuation => {
    const data =
      additionalData && typeof additionalData === "object"
        ? (additionalData as Record<string, unknown>)
        : {};
    const value = (header: string, key: string) => {
      const supplied = headers?.get(header);
      const raw = supplied !== undefined && supplied !== null ? supplied : data[key];
      if (raw !== undefined && raw !== null && typeof raw !== "string") throw signupError();
      return typeof raw === "string" && (raw || key === "experienceFlow") ? raw : undefined;
    };
    return {
      organizationInvitationCode: value(
        "organization-invitation-code",
        "organizationInvitationCode"
      ),
      waitlistInvitationCode: value("waitlist-invitation-code", "waitlistInvitationCode"),
      experienceFlow: value(EXPERIENCE_FLOW_HEADER, "experienceFlow"),
    };
  };
  const validateSignup = async (
    data: SignupContinuation,
    experience: PublicExperience | undefined,
    kind?: "organization" | "waitlist"
  ) => {
    if (!experienceRegistry) return data;
    try {
      if (data.organizationInvitationCode && kind !== "waitlist") {
        const [invitation] = await orm
          .select()
          .from(schema.invitations)
          .where(eq(schema.invitations.id, data.organizationInvitationCode))
          .limit(1);
        if (!invitation) throw signupError();
        verifyInvitationContinuation({
          registry: experienceRegistry,
          flows: experienceFlows,
          experience,
          invitation,
          proof: data.experienceFlow,
        });
      }
      if (data.waitlistInvitationCode && kind !== "organization") {
        const [entry] = await orm
          .select()
          .from(schema.waitlist)
          .where(eq(schema.waitlist.code, data.waitlistInvitationCode))
          .limit(1);
        if (!entry) throw signupError();
        verifyWaitlistContinuation({
          registry: experienceRegistry,
          flows: experienceFlows,
          experience,
          entry,
          proof: data.experienceFlow,
        });
      }
      return data;
    } catch (error) {
      if (error instanceof ExperienceContextError) throw signupError();
      throw error;
    }
  };
  const assertOAuthExperience = async (ctx: SignupContext) => {
    if (!multiExperience || !experienceRegistry) return;
    const state = await getOAuthState();
    if (!state) return;
    try {
      const id = state.serverContext?.experienceId;
      if (typeof id !== "string") throw signupError();
      validateAuthTransport(
        experienceRegistry,
        experienceRegistry.get(id),
        ctx?.request,
        ctx?.headers ?? undefined
      );
      if (state.link) {
        const claimInput = state.serverContext?.claimContinuation;
        const parsed = z
          .object({
            claimId: z.string(),
            experienceFlow: z.string().optional(),
          })
          .optional()
          .safeParse(claimInput);
        if (!parsed.success) throw signupError();
        await validateClaimUser({
          userId: state.link.userId,
          ...parsed.data,
          experience: experienceRegistry.get(id),
        });
      }
    } catch (error) {
      if (error instanceof ExperienceContextError) throw signupError();
      throw error;
    }
  };
  const getSignupCode = async (kind: "organization" | "waitlist", ctx: SignupContext) => {
    if (!multiExperience || !experienceRegistry)
      return kind === "organization"
        ? getLegacyOrganizationInvitationCode(ctx)
        : getLegacyWaitlistInvitationCode(ctx);
    await assertOAuthExperience(ctx);
    const state = await getOAuthState();
    const parsed = state
      ? signupContinuationSchema.safeParse(state.serverContext?.signupContinuation ?? {})
      : undefined;
    if (parsed && !parsed.success) throw signupError();
    const data = parsed?.data ?? readSignupContinuation(ctx?.headers);
    const experience = resolveAuthExperience(
      experienceRegistry,
      ctx?.request,
      ctx?.headers ?? undefined
    );
    await validateSignup(data, experience, kind);
    return kind === "organization" ? data.organizationInvitationCode : data.waitlistInvitationCode;
  };
  const getOrganizationInvitationCode = (ctx: SignupContext) => getSignupCode("organization", ctx);
  const getWaitlistInvitationCode = (ctx: SignupContext) => getSignupCode("waitlist", ctx);

  const validateClaimUser = async (input: {
    userId: string;
    claimId?: string;
    experienceFlow?: string;
    experience?: PublicExperience;
  }) => {
    if (!multiExperience || !experienceRegistry) return;
    const [claim] = await orm
      .select()
      .from(schema.accountClaims)
      .where(
        and(
          eq(schema.accountClaims.claimUserId, input.userId),
          eq(schema.accountClaims.status, "INVITED"),
          ...(input.claimId ? [eq(schema.accountClaims.id, input.claimId)] : [])
        )
      )
      .orderBy(desc(schema.accountClaims.createdAt))
      .limit(1);
    if (!claim) {
      if (input.claimId) throw signupError();
      return;
    }
    if (!input.claimId || !claim.expiresAt || claim.expiresAt.getTime() <= Date.now())
      throw signupError();
    try {
      verifyClaimContinuation({
        registry: experienceRegistry,
        flows: experienceFlows,
        experience: input.experience,
        claim,
        userId: input.userId,
        proof: input.experienceFlow,
      });
    } catch (error) {
      if (error instanceof ExperienceContextError) throw signupError();
      throw error;
    }
  };
  const validateClaimLink = async (callbackURL: unknown, experience: PublicExperience) => {
    if (typeof callbackURL !== "string") return undefined;
    const callback = new URL(callbackURL, experience.webOrigin);
    const claimId = callback.searchParams.get("claim");
    const experienceFlow = callback.searchParams.get("claimFlow") ?? undefined;
    if (!claimId && !experienceFlow) return undefined;
    if (!claimId) throw signupError();
    const [claim] = await orm
      .select()
      .from(schema.accountClaims)
      .where(eq(schema.accountClaims.id, claimId))
      .limit(1);
    if (!claim) throw signupError();
    await validateClaimUser({
      userId: claim.claimUserId,
      claimId,
      experienceFlow,
      experience,
    });
    return { claimId, experienceFlow };
  };

  const validateMagicClaim = async (token: string, callback: URL, experience: PublicExperience) => {
    const claimId = callback.searchParams.get("claim");
    if (!claimId || !experienceRegistry) throw signupError();
    const [claim] = await orm
      .select()
      .from(schema.accountClaims)
      .where(eq(schema.accountClaims.id, claimId))
      .limit(1);
    const [link] = await orm
      .select()
      .from(schema.accountClaimMagicLinks)
      .where(
        and(
          eq(schema.accountClaimMagicLinks.claimId, claimId),
          eq(schema.accountClaimMagicLinks.token, token)
        )
      )
      .limit(1);
    if (
      !claim ||
      claim.status !== "INVITED" ||
      !claim.expiresAt ||
      claim.expiresAt.getTime() <= Date.now() ||
      !link ||
      link.userId !== claim.claimUserId ||
      !link.expiresAt ||
      link.expiresAt.getTime() <= Date.now()
    )
      throw signupError();
    const [owner] = await orm
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, claim.claimUserId))
      .limit(1);
    if (!owner || owner.email.toLowerCase() !== link.email.toLowerCase()) throw signupError();
    try {
      verifyClaimContinuation({
        registry: experienceRegistry,
        flows: experienceFlows,
        experience,
        claim,
        userId: link.userId,
        proof: callback.searchParams.get("claimFlow") ?? undefined,
      });
    } catch (error) {
      if (error instanceof ExperienceContextError) throw signupError();
      throw error;
    }
  };

  const isProvisionedAccountEmail = (email: string) => {
    if (!normalizedProvisionedAccountEmailDomain) return false;
    return email.toLowerCase().endsWith(`@${normalizedProvisionedAccountEmailDomain}`);
  };

  const shouldVerifyEmailForAdminCreate = (ctx?: { headers?: Headers | null } | null): boolean => {
    const header = ctx?.headers?.get(ADMIN_CREATE_VERIFIED_USER_HEADER.toLowerCase());
    if (header !== ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE) return false;
    const role = (
      ctx as {
        context?: { session?: { user?: { role?: string | null } } | null };
      } | null
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

  const getTrialPriceIdFromContext = async (ctx?: { headers?: Headers | null } | null) => {
    const priceId = ctx?.headers?.get(USER_PRICE_ID_HEADER.toLowerCase());
    if (priceId) return priceId;
    const oauthPriceId = (await getOAuthState())?.userPriceId;
    return typeof oauthPriceId === "string" && oauthPriceId ? oauthPriceId : null;
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

  const userAuthLogger = options?.logger;

  return betterAuth({
    ...options,
    baseURL: multiExperience
      ? {
          allowedHosts: experienceRegistry.allowedHosts,
          protocol: experienceRegistry.defaultExperience.apiOrigin.startsWith("https:")
            ? "https"
            : "http",
        }
      : apiUrl!,
    ...(multiExperience
      ? {
          advanced: {
            ...options?.advanced,
            trustedProxyHeaders: experienceRegistry.config.trustedProxyHeaders,
            crossSubDomainCookies: { enabled: false },
            defaultCookieAttributes: {
              ...options?.advanced?.defaultCookieAttributes,
              domain: undefined,
            },
          },
        }
      : {}),
    // Forward better-auth logs into pino. getSession swallows root causes into
    // opaque FAILED_TO_GET_SESSION; the real error is only passed to logger.error.
    logger: {
      disabled: userAuthLogger?.disabled,
      level: userAuthLogger?.level ?? "warn",
      disableColors: userAuthLogger?.disableColors ?? true,
      log(level, message, ...args) {
        userAuthLogger?.log?.(level, message, ...args);
        const errArg = args.find((arg): arg is Error => arg instanceof Error);
        const extra = args.filter((arg) => arg !== errArg);
        const fields = {
          betterAuthMessage: message,
          ...(extra.length > 0 ? { args: extra } : {}),
          ...(errArg ? { err: errArg } : {}),
        };
        if (level === "error") {
          if (errArg) {
            captureServerError(
              ServerError.fromUnknown("INTERNAL_SERVER_ERROR", errArg, {
                layer: "auth",
                layerName: "BetterAuth",
                context: { betterAuthMessage: message },
              }),
              { logger }
            );
          } else {
            logger.error(fields, message);
          }
          return;
        }
        if (level === "warn") {
          logger.warn(fields, message);
          return;
        }
        logger.debug(fields, message);
      },
    },
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
      },
    },
    user: {
      deleteUser: {
        enabled: false,
      },
      additionalFields: {
        onboarding: {
          type: "number",
          required: false,
          defaultValue: null,
        },
        locale: {
          type: "string",
          required: false,
          defaultValue: null,
          input: true,
        },
        closedAt: {
          type: "date",
          required: false,
          defaultValue: null,
          input: false,
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
      },
    },
    database: drizzleAdapter(orm, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !waitlist,
      resetPasswordTokenExpiresIn: options?.emailAndPassword?.resetPasswordTokenExpiresIn,
      sendResetPassword: async ({ user, url, token }, request) => {
        const locale = getRecordLocale(user);
        const presentation = multiExperience
          ? bindAuthRecoveryLink({
              registry: experienceRegistry,
              flows: experienceFlows,
              request,
              url,
              token,
              purpose: "reset-password",
              expiresIn: options?.emailAndPassword?.resetPasswordTokenExpiresIn ?? 3600,
            })
          : { url, experience: undefined };
        const result = await emailService?.sendResetPassword(user.email, presentation.url, {
          locale,
          experience: presentation.experience,
        });
        if (result?.isErr()) {
          captureServerError(result.error, { logger }); // no-op when captured at creation
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    emailVerification: {
      expiresIn: options?.emailVerification?.expiresIn,
      sendVerificationEmail: async ({ user, url, token }, request) => {
        const locale = getRecordLocale(user);
        const presentation = multiExperience
          ? bindAuthRecoveryLink({
              registry: experienceRegistry,
              flows: experienceFlows,
              request,
              url,
              token,
              purpose: "verify-email",
              expiresIn: options?.emailVerification?.expiresIn ?? 3600,
            })
          : { url, experience: undefined };
        const result = await emailService?.sendVerification(user.email, presentation.url, {
          locale,
          experience: presentation.experience,
        });
        if (result?.isErr()) {
          captureServerError(result.error, { logger }); // no-op when captured at creation
          hooks?.onError?.(result.error);
          throw result.error;
        }
      },
    },
    plugins: [
      ...(options?.plugins ?? []),
      ...(multiExperience
        ? [
            experienceAuthPlugin(experienceRegistry, experienceFlows, {
              signup: async (headers, additionalData, experience) =>
                validateSignup(readSignupContinuation(headers, additionalData), experience),
              magic: validateMagicClaim,
              claimLink: validateClaimLink,
            }),
          ]
        : []),
      setPasswordEndpointPlugin(async (input) => {
        if (!multiExperience || !experienceRegistry) return;
        const experience = resolveAuthExperience(experienceRegistry, input.request, input.headers);
        await validateClaimUser({ ...input, experience });
      }),
      magicLink({
        disableSignUp: true,
        sendMagicLink: async ({ email, url, token, metadata }, ctx) => {
          const [user] = await orm
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, email.toLowerCase()))
            .limit(1);
          if (!user) return;
          const requestedId = typeof metadata?.claimId === "string" ? metadata.claimId : undefined;
          if (multiExperience && !requestedId) return;
          const [claim] = await orm
            .select()
            .from(schema.accountClaims)
            .where(
              and(
                eq(schema.accountClaims.claimUserId, user.id),
                eq(schema.accountClaims.status, "INVITED"),
                gte(schema.accountClaims.expiresAt, new Date()),
                ...(requestedId ? [eq(schema.accountClaims.id, requestedId)] : [])
              )
            )
            .orderBy(desc(schema.accountClaims.createdAt))
            .limit(1);
          if (!claim) return;
          let link = url;
          if (multiExperience && experienceRegistry) {
            const experience = experienceRegistry.require(
              resolveAuthExperience(experienceRegistry, ctx?.request, ctx?.headers)
            );
            const callback = new URL(new URL(url).searchParams.get("callbackURL")!);
            if (callback.searchParams.get("claim") !== claim.id) return;
            try {
              verifyClaimContinuation({
                registry: experienceRegistry,
                flows: experienceFlows,
                experience,
                claim,
                userId: user.id,
                proof: callback.searchParams.get("claimFlow") ?? undefined,
              });
            } catch (error) {
              if (error instanceof ExperienceContextError) return;
              throw error;
            }
            link = bindAuthRecoveryLink({
              registry: experienceRegistry,
              flows: experienceFlows,
              request: ctx?.request,
              url,
              token,
              purpose: "account-claim-magic-link",
              expiresIn: 300,
            }).url;
          }
          await orm.insert(schema.accountClaimMagicLinks).values({
            ...(typeof metadata?.issuanceId === "string" ? { id: metadata.issuanceId } : {}),
            claimId: claim.id,
            userId: user.id,
            email: email.toLowerCase(),
            token,
            url: link,
            expiresAt: new Date(Math.min(Date.now() + 300_000, claim.expiresAt!.getTime())),
          });
        },
      }),
      admin(),
      lastLoginMethod(),
      organization({
        organizationHooks: {
          beforeCreateInvitation: async () => {
            throw new APIError("FORBIDDEN", {
              message: "Use Auth inviteOrganizationMember",
            });
          },
          beforeDeleteOrganization: async (data) => {
            if (!billingService) return;
            const canceled = await billingService.cancelOrganizationSubscription({
              organizationId: data.organization.id,
            });
            if (canceled.isErr()) {
              logger.error({
                step: "cancelOrganizationSubscription",
                organizationId: data.organization.id,
                error: canceled.error,
              });
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Failed to cancel the Organization Subscription",
              });
            }
          },
        },
        schema: {
          member: {
            modelName: "member",
            additionalFields: {
              name: {
                type: "string",
                required: false,
                defaultValue: "",
              },
              image: {
                type: "string",
                required: false,
                defaultValue: null,
                input: false,
              },
              deletedAt: {
                type: "date",
                required: false,
                defaultValue: null,
                input: false,
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
            },
          },
          invitation: {
            modelName: "invitation",
            additionalFields: {
              memberId: {
                type: "string",
                required: false,
                defaultValue: null,
              },
            },
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
              currency: {
                type: "string",
                required: false,
                defaultValue: null,
                input: false,
              },
              stripeCustomerId: {
                type: "string",
                required: false,
                defaultValue: null,
                input: false,
              },
              stripeSandboxCustomerId: {
                type: "string",
                required: false,
                defaultValue: null,
                input: false,
              },
              billingExempt: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false,
              },
              allowCardlessTrial: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false,
              },
              cardlessTrialConsumed: {
                type: "string",
                required: false,
                defaultValue: "{}",
                input: false,
              },
              closedAt: {
                type: "date",
                required: false,
                defaultValue: null,
                input: false,
              },
            },
          },
        },
      }),
      // `x-api-key` callers get a session without an active Organization; they name one with `organizationId`.
      createApiKeyPlugin({ enableSessionForAPIKeys: true }) as BetterAuthPlugin,
      bearer({ requireSignature: true }),
      ...createMcpOAuthPlugins(
        mcp
          ? {
              resource: mcp.resource,
              issuer:
                apiUrl && new URL(apiUrl).pathname !== "/"
                  ? apiUrl.replace(/\/$/, "")
                  : new URL(options?.basePath ?? "/api/auth", apiUrl ?? mcp.resource).href,
              loginPage: webUrl ? joinAppPath(webUrl, "login") : "/login",
              consentPage: webUrl ? joinAppPath(webUrl, "consent") : "/consent",
            }
          : undefined
      ),
    ],
    trustedOrigins: experienceRegistry?.allowedOrigins ?? [webUrl!, apiUrl!],

    databaseHooks: {
      user: {
        delete: {
          before: async () => {
            throw new APIError("FORBIDDEN", { message: "Use Auth Close" });
          },
        },
        update: {
          before: async (user, ctx) => {
            await assertOAuthExperience(ctx);
            return { data: user };
          },
          after: async (user) => {
            try {
              await syncActiveMemberProfiles(orm, user.id, {
                name: typeof user.name === "string" ? user.name : undefined,
                image:
                  "image" in user ? ((user.image as string | null | undefined) ?? null) : undefined,
              });
            } catch (error) {
              logger.error({
                step: "syncActiveMemberProfiles",
                userId: user.id,
                error,
              });
            }
          },
        },
        create: {
          before: async (user, ctx) => {
            await assertOAuthExperience(ctx);
            logger.info({ step: "before create user", user, ctx });
            const organizationInvitationCode = await getOrganizationInvitationCode(ctx);

            // If the user is invited to an organization, attach them to the organization
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

              if (!invitation.memberId) {
                const message = "Invitation has no Membership";
                logger.error({ message, organizationInvitationCode });
                throw new APIError("BAD_REQUEST", { message });
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

            // If user is created by an admin, verify their email
            if (shouldVerifyEmailForAdminCreate(ctx)) {
              const userWithLocale = await withResolvedLocale(user, ctx, null);
              return {
                data: {
                  ...userWithLocale,
                  emailVerified: true,
                },
              };
            }

            // If user is created by a waitlist code, verify their email
            if (waitlist) {
              const waitlistCode = await getWaitlistInvitationCode(ctx);
              if (waitlistCode) {
                try {
                  await assertWaitlistCodeUsable(orm, schema, waitlistCode);
                } catch (error) {
                  if (error instanceof WaitlistCodeNotFound) {
                    logger.error({ message: error.message, waitlistCode });
                    throw new APIError("NOT_FOUND", { message: error.message });
                  }
                  throw error;
                }
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
            // If user is created by a waitlist code, accept the waitlist code
            if (waitlist) {
              const waitlistCode = await getWaitlistInvitationCode(ctx);
              if (waitlistCode) {
                try {
                  const waitlistInvitation = await assertWaitlistCodeUsable(
                    orm,
                    schema,
                    waitlistCode
                  );
                  await acceptWaitlistCodeAfterUser(orm, schema, waitlistInvitation.id);
                } catch (error) {
                  if (error instanceof WaitlistCodeNotFound) {
                    logger.error({ message: error.message, waitlistCode });
                    throw new APIError("NOT_FOUND", { message: error.message });
                  }
                  throw error;
                }
              }
            }

            // If the user is invited to an organization, attach them to the organization
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

              if (!invitation.memberId) {
                const message = "Invitation has no Membership";
                logger.error({ message, organizationInvitationCode });
                throw new APIError("BAD_REQUEST", { message });
              }

              const attached = await attachUserToInvitedMember(orm, {
                memberId: invitation.memberId,
                organizationId: invitation.organizationId,
                userId: user.id,
                name: typeof user.name === "string" ? user.name : "",
                email: user.email,
                image: typeof user.image === "string" ? user.image : null,
              });

              if (!attached.ok) {
                const message =
                  attached.reason === "conflict"
                    ? "Membership already belongs to another User"
                    : "Failed to add user to organization";
                logger.error({ message, memberId: invitation.memberId });
                throw new APIError(
                  attached.reason === "conflict" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
                  { message }
                );
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
              const trialPriceId = await getTrialPriceIdFromContext(ctx);
              const requestedCurrency =
                (trialPriceId ? billingService?.trialPriceCurrency(trialPriceId) : undefined) ??
                ctx?.headers?.get(USER_CURRENCY_HEADER.toLowerCase());
              const catalog = billingService?.catalogCurrencies();
              let membership: { organizationId: string; memberId: string };
              try {
                membership = await createOrganizationWithOwner(
                  orm,
                  schema,
                  user,
                  userLocale,
                  catalog
                    ? {
                        requested: requestedCurrency,
                        defaultCurrency: catalog.defaultCurrency,
                        allowedCurrencies: catalog.currencies,
                      }
                    : undefined
                );
              } catch (error) {
                if (error instanceof OrganizationCurrencyError) {
                  throw new APIError("BAD_REQUEST", { message: error.message });
                }
                throw error;
              }
              if (hooks?.afterCreateUser) {
                const i18nCtx = createUserHookI18nContext(user, i18n);
                await hooks.afterCreateUser(user, membership, i18nCtx);
              }
              if (!isProvisionedAccountEmail(user.email)) {
                await billingService?.createOrganizationHook({
                  organizationId: membership.organizationId,
                  memberId: membership.memberId,
                  email: user.email,
                  name: typeof user.name === "string" ? user.name : undefined,
                  trialPriceId,
                });
              }
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
      account: {
        create: {
          before: async (account, ctx) => {
            await assertOAuthExperience(ctx);
            return { data: account };
          },
        },
        update: {
          before: async (account, ctx) => {
            await assertOAuthExperience(ctx);
            return { data: account };
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            await assertOAuthExperience(ctx);
            const [closedUser] = await orm
              .select({ closedAt: schema.users.closedAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId))
              .limit(1);
            if (closedUser?.closedAt) {
              throw new APIError("FORBIDDEN", {
                message: "This User is Closed",
              });
            }
            const { organizationId, organizationRole, organizationType, organizationMemberId } =
              await getActiveOrganization(orm, schema, session.userId);
            return {
              data: {
                ...session,
                activeOrganizationId: organizationId,
                activeOrganizationType: organizationType,
                activeOrganizationRole: organizationRole,
                activeOrganizationMemberId: organizationMemberId,
              },
            };
          },
        },
        update: {
          before: async (session, ctx) => {
            const data = { ...session };
            const prevSession = ctx?.context.session?.session;
            const { activeOrganizationId } = session;

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
                if (newOrganization.closedAt) {
                  throw new APIError("FORBIDDEN", {
                    message: "This Organization is Closed",
                  });
                }

                data.activeOrganizationType = newOrganization.type;
                data.activeOrganizationRole = newOrganization.role;
                data.activeOrganizationMemberId = newOrganization.memberId;
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
  }) as unknown as BetterAuth;
}
