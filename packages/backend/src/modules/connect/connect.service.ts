import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { err, ok } from "neverthrow";
import { ExperienceContextError, type ExperienceRegistry } from "../../experience";
import type { User } from "../auth/auth.lib";
import type { AuthRequest } from "../auth/auth.middleware";
import type { ResourceGrant } from "../base/base.grants";
import { BasePermissionService } from "../base/base.service";
import {
  type ConnectDeleteInputSchema,
  type ConnectListInputSchema,
  connectCallbackInputSchema,
  connectNavigationSchema,
  connectStartInputSchema,
} from "./connect.dto";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  OAuthStateStore,
  refreshAccessToken,
} from "./connect.oauth";
import type { ConnectRepository } from "./connect.repository";
import type { ConnectProvider, ResolvedConnectProvider } from "./connect.types";

export type ConnectFlowContext = {
  user: Pick<User, "id">;
  sessionId: string;
  experience?: PublicExperience;
  request?: Pick<AuthRequest, "headers">;
};

export class ConnectService extends BasePermissionService<
  { connect: ConnectRepository },
  Record<string, never>
> {
  private providers = new Map<string, ConnectProvider>();
  private readonly oauthStates = new OAuthStateStore();
  private readonly callbacks = new Map<string, Map<string, ResolvedConnectProvider>>();

  constructor(
    repositories: { connect: ConnectRepository },
    providers: ConnectProvider[],
    grants: ResourceGrant[],
    private readonly presentation: { registry?: ExperienceRegistry; mountPath?: string } = {}
  ) {
    super(repositories, {}, grants);
    const reserved = new Set([
      "state",
      "redirect_uri",
      "client_id",
      "response_type",
      "scope",
      "code_challenge",
      "code_challenge_method",
      "nonce",
    ]);
    for (const provider of providers) {
      for (const key of Object.keys(provider.authorizationExtraParams ?? {})) {
        if (reserved.has(key)) throw new Error(`Reserved OAuth authorization parameter: ${key}`);
      }
    }
    this.providers = new Map(
      providers.map((provider) => [
        provider.id,
        Object.freeze({
          id: provider.id,
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          redirectUri: provider.redirectUri,
          redirectUris: provider.redirectUris
            ? Object.freeze({ ...provider.redirectUris })
            : undefined,
          issuerUrl: provider.issuerUrl,
          supportsPKCE: provider.supportsPKCE,
          // Preserve class adapters' prototype methods and their private/stateful receiver.
          mapProfile: provider.mapProfile.bind(provider),
          scopes: Object.freeze([...provider.scopes]),
          ...(provider.issuerConfig
            ? { issuerConfig: Object.freeze({ ...provider.issuerConfig }) }
            : {}),
          ...(provider.authorizationExtraParams
            ? { authorizationExtraParams: Object.freeze({ ...provider.authorizationExtraParams }) }
            : {}),
        }),
      ])
    );
    const registry = this.presentation.registry;
    if (registry) {
      for (const provider of this.providers.values()) {
        const callbacks = new Map<string, ResolvedConnectProvider>();
        for (const [id, definition] of Object.entries(registry.config.definitions)) {
          if (!definition.disabled)
            callbacks.set(id, this.normalizeProvider(provider, registry.get(id)));
        }
        this.callbacks.set(provider.id, callbacks);
      }
    }
  }

  getProvider(id: string): ConnectProvider | null {
    return this.providers.get(id) || null;
  }

  private normalizeProvider(
    provider: ConnectProvider,
    experience: PublicExperience
  ): ResolvedConnectProvider {
    const prefix = (this.presentation.mountPath ?? "/connect").replace(/\/+$/, "");
    const expected = new URL(experience.apiOrigin);
    expected.pathname = `${prefix}/${encodeURIComponent(provider.id)}/callback`;
    const redirectUri =
      provider.redirectUris?.[experience.id] ?? provider.redirectUri ?? expected.href;
    const target = new URL(redirectUri);
    if (Object.keys(connectCallbackInputSchema.shape).some((key) => target.searchParams.has(key)))
      throw new ExperienceContextError("Connection callback query contains a reserved flow field");
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.hash ||
      (this.presentation.registry?.strict &&
        (target.origin !== expected.origin || target.pathname !== expected.pathname))
    )
      throw new ExperienceContextError(
        "Connection callback must match its configured canonical API route"
      );
    return Object.freeze({ ...provider, redirectUri: target.href });
  }

  private navigation({
    destination,
    outcome,
    provider,
  }: {
    destination: string;
    outcome: "connected" | "failed";
    provider: string;
  }) {
    const url = new URL(destination);
    if (outcome === "connected") url.searchParams.set("connect_success", "true");
    else url.searchParams.set("error", "CONNECTION_FAILED");
    url.searchParams.set("provider", provider);
    return { url: url.href, outcome };
  }

  override handleUnknownError(error: unknown) {
    if (error instanceof ExperienceContextError)
      return this.error(
        "BAD_REQUEST",
        "This connection link is invalid or has expired. Start again from the same website.",
        { cause: error }
      ).error;
    return super.handleUnknownError(error);
  }

  readonly startAuth = this.procedure<unknown, ConnectFlowContext>("startAuth")
    .input(connectStartInputSchema)
    .output(connectNavigationSchema)
    .handle(async ({ input, ctx }) => {
      const registry = this.presentation.registry;
      if (!registry)
        return this.error("INTERNAL_SERVER_ERROR", "Connection public origins are not configured");
      const experience = registry.require(ctx.experience);
      if (ctx.request) registry.validateCanonicalApiRequest(experience, ctx.request);
      const destination = registry.destination(experience, input.redirect ?? "/");
      const provider = this.getProvider(input.provider);
      if (!provider)
        return ok(this.navigation({ destination, outcome: "failed", provider: input.provider }));
      const selected = this.callbacks.get(provider.id)!.get(experience.id)!;
      const state = await this.oauthStates.create({
        sessionId: ctx.sessionId,
        provider: provider.id,
        userId: ctx.user.id,
        experienceId: experience.id,
        destination,
        redirectUri: selected.redirectUri,
      });
      const authorization = await this.throwablePromise(() =>
        buildAuthorizationUrl(selected, state)
      );
      if (authorization.isErr()) {
        this.oauthStates.consume(state);
        return ok(this.navigation({ destination, outcome: "failed", provider: provider.id }));
      }
      return ok({ url: authorization.value, outcome: "authorized" as const });
    });

  readonly handleCallback = this.procedure<unknown, ConnectFlowContext>("handleCallback")
    .input(connectCallbackInputSchema)
    .output(connectNavigationSchema)
    .handle(async ({ input, ctx }) => {
      const registry = this.presentation.registry;
      if (!registry)
        return this.error("INTERNAL_SERVER_ERROR", "Connection public origins are not configured");
      const state = this.oauthStates.consume({
        sessionId: ctx.sessionId,
        provider: input.provider,
        userId: ctx.user.id,
        state: input.state,
      });
      if (!state)
        return this.error(
          "BAD_REQUEST",
          "This connection link is invalid or has expired. Start again from the same website."
        );
      const experience = registry.get(state.experienceId);
      if (ctx.experience && experience.id !== ctx.experience.id)
        throw new ExperienceContextError("Conflicting Connection Experience");
      if (ctx.request) registry.validateBoundRequest(experience, ctx.request);
      const destination = registry.destination(experience, state.destination);
      if (
        input.redirect !== undefined &&
        registry.destination(experience, input.redirect) !== destination
      )
        throw new ExperienceContextError("Conflicting Connection destination");
      const provider = this.getProvider(input.provider);
      const code = input.code;
      if (!provider || input.error || !code)
        return ok(this.navigation({ destination, outcome: "failed", provider: input.provider }));
      const selected = { ...provider, redirectUri: state.redirectUri };
      const tokensResult = await this.throwablePromise(() =>
        exchangeCodeForTokens(selected, {
          code,
          codeVerifier: state.codeVerifier,
          redirectUri: state.redirectUri,
          state: state.state,
        })
      );
      if (tokensResult.isErr())
        return ok(this.navigation({ destination, outcome: "failed", provider: input.provider }));
      const tokens = tokensResult.value;
      const profileResult = await this.throwablePromise(() =>
        provider.mapProfile(tokens.accessToken)
      );
      if (profileResult.isErr())
        return ok(this.navigation({ destination, outcome: "failed", provider: input.provider }));
      const profile = profileResult.value;
      const connection = await this.repository.connect.upsert({
        userId: ctx.user.id,
        provider: input.provider,
        accountType: profile.accountType,
        providerAccountId: profile.providerAccountId,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType || "bearer",
        scope: tokens.scope,
        expiresAt: tokens.expiresAt,
        parentId: profile.parentId,
        metadataJson: profile.metadata ?? null,
      });
      if (connection.isErr())
        return ok(this.navigation({ destination, outcome: "failed", provider: input.provider }));
      return ok(this.navigation({ destination, outcome: "connected", provider: input.provider }));
    });

  async refreshToken(connectionId: string) {
    const connection = await this.repository.connect.findById(connectionId);
    if (connection.isErr() || !connection.value) {
      return this.error("NOT_FOUND", "Connection not found");
    }

    const conn = connection.value;
    const refreshToken = conn.refreshToken;
    if (!refreshToken) {
      return this.error("BAD_REQUEST", "No refresh token available");
    }

    const provider = this.getProvider(conn.provider);
    if (!provider) {
      // provider id comes from a stored connection row — unknown means the app
      // dropped a provider that still has live connections
      return this.error("INTERNAL_SERVER_ERROR", `Unknown provider: ${conn.provider}`);
    }

    const tokensResult = await this.throwablePromise(() =>
      refreshAccessToken(provider, refreshToken)
    );
    if (tokensResult.isErr()) return err(tokensResult.error);
    const tokens = tokensResult.value;

    const updateData: {
      id: string;
      accessToken: string;
      refreshToken?: string | null;
      tokenType?: string | null;
      scope?: string | null;
      expiresAt?: Date | null;
      lastRefreshedAt: Date;
    } = {
      id: conn.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? conn.refreshToken,
      tokenType: tokens.tokenType || conn.tokenType || null,
      scope: tokens.scope || conn.scope || null,
      expiresAt: tokens.expiresAt || null,
      lastRefreshedAt: new Date(),
    };

    const updated = await this.repository.connect.update(updateData);

    if (updated.isErr()) {
      return this.error("INTERNAL_SERVER_ERROR", "Failed to update tokens", {
        cause: updated.error,
      });
    }

    return ok(updated.value);
  }

  readonly list = this.procedure<ConnectListInputSchema>("connectList")
    .requireAuth()
    .handle(({ input, ctx }) =>
      this.repository.connect.list({ userId: ctx.actor.userId, ...input })
    );

  readonly delete = this.procedure<ConnectDeleteInputSchema>("connectDelete")
    .requireAuth()
    .loadResource("connection", ({ input }) => this.repository.connect.findById(input.id))
    .access({
      action: "delete",
      entityStep: "connection",
    })
    .handle(({ input }) => this.repository.connect.deleteById(input.id));
}
