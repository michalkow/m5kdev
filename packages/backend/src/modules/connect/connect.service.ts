import { err, ok } from "neverthrow";
import type { User } from "../auth/auth.lib";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { ConnectDeleteInputSchema, ConnectListInputSchema } from "./connect.dto";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  generateOAuthState,
  getOAuthState,
  refreshAccessToken,
} from "./connect.oauth";
import type { ConnectRepository } from "./connect.repository";
import type { ConnectProvider } from "./connect.types";

export class ConnectService extends BaseService<{ connect: ConnectRepository }, never> {
  private providers = new Map<string, ConnectProvider>();

  constructor(repositories: { connect: ConnectRepository }, providers: ConnectProvider[]) {
    super(repositories);
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  getProvider(id: string): ConnectProvider | null {
    return this.providers.get(id) || null;
  }

  async startAuth(
    _user: User,
    sessionId: string,
    providerId: string
  ): ServerResultAsync<{ url: string }> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return this.error("BAD_REQUEST", `Unknown provider: ${providerId}`);
    }

    const stateResult = await this.throwablePromise(() => generateOAuthState(sessionId, providerId));
    if (stateResult.isErr()) return err(stateResult.error);

    const urlResult = await this.throwablePromise(() => buildAuthorizationUrl(provider, stateResult.value));
    if (urlResult.isErr()) return err(urlResult.error);

    return ok({ url: urlResult.value });
  }

  async handleCallback(
    user: User,
    sessionId: string,
    providerId: string,
    code: string,
    state: string
  ) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return this.error("BAD_REQUEST", `Unknown provider: ${providerId}`);
    }

    const oauthState = getOAuthState(sessionId, providerId, state);
    if (!oauthState) {
      return this.error("BAD_REQUEST", "Invalid or expired state");
    }

    const tokensResult = await this.throwablePromise(() =>
      exchangeCodeForTokens(provider, code, oauthState.codeVerifier, provider.redirectUri, state)
    );
    if (tokensResult.isErr()) return err(tokensResult.error);
    const tokens = tokensResult.value;

    const profileResult = await this.throwablePromise(() => provider.mapProfile(tokens.accessToken));
    if (profileResult.isErr()) return err(profileResult.error);
    const profile = profileResult.value;

    const metadataJsonResult = profile.metadata
      ? this.throwable(() => ok(JSON.stringify(profile.metadata)))
      : ok<string | null>(null);
    if (metadataJsonResult.isErr()) return err(metadataJsonResult.error);

    const connection = await this.repository.connect.upsert({
      userId: user.id,
      provider: providerId,
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
      metadataJson: metadataJsonResult.value,
    });

    if (connection.isErr()) {
      return this.error("INTERNAL_SERVER_ERROR", "Failed to save connection", {
        cause: connection.error,
      });
    }

    return ok(connection.value);
  }

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
      return this.error("BAD_REQUEST", `Unknown provider: ${conn.provider}`);
    }

    const tokensResult = await this.throwablePromise(() => refreshAccessToken(provider, refreshToken));
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
      refreshToken: tokens.refreshToken || null,
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
    .handle(async ({ input, ctx }) => {
      const connection = await this.repository.connect.findById(input.id);
      if (connection.isOk()) {
        if (connection.value?.userId !== ctx.actor.userId) {
          return this.error("FORBIDDEN", "Not your connection");
        }
        return this.repository.connect.deleteById(input.id);
      }
      return err(connection.error);
    });
}
