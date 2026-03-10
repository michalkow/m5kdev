import { err, ok } from "neverthrow";
import type { User } from "#modules/auth/auth.lib";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";
import type {
  ConnectDeleteInputSchema,
  ConnectListInputSchema,
} from "#modules/connect/connect.dto";
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
    return this.throwableAsync(async () => {
      const provider = this.getProvider(providerId);
      if (!provider) {
        return this.error("BAD_REQUEST", `Unknown provider: ${providerId}`);
      }

      const state = await generateOAuthState(sessionId, providerId);
      const url = await buildAuthorizationUrl(provider, state);

      return ok({ url });
    });
  }

  async handleCallback(
    user: User,
    sessionId: string,
    providerId: string,
    code: string,
    state: string
  ) {
    return this.throwableAsync(async () => {
      const provider = this.getProvider(providerId);
      if (!provider) {
        return this.error("BAD_REQUEST", `Unknown provider: ${providerId}`);
      }

      const oauthState = getOAuthState(sessionId, providerId, state);
      if (!oauthState) {
        return this.error("BAD_REQUEST", "Invalid or expired state");
      }

      // Exchange code for tokens
      // Note: redirectUri must match exactly what was used in authorization request
      const tokens = await exchangeCodeForTokens(
        provider,
        code,
        oauthState.codeVerifier,
        provider.redirectUri,
        state
      );

      // Fetch profile
      const profile = await provider.mapProfile(tokens.accessToken);

      // Upsert connection
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
        metadataJson: profile.metadata ? JSON.stringify(profile.metadata) : null,
      });

      if (connection.isErr()) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to save connection", {
          cause: connection.error,
        });
      }

      return ok(connection.value);
    });
  }

  async refreshToken(connectionId: string) {
    return this.throwableAsync(async () => {
      const connection = await this.repository.connect.findById(connectionId);
      if (connection.isErr() || !connection.value) {
        return this.error("NOT_FOUND", "Connection not found");
      }

      const conn = connection.value;
      if (!conn.refreshToken) {
        return this.error("BAD_REQUEST", "No refresh token available");
      }

      const provider = this.getProvider(conn.provider);
      if (!provider) {
        return this.error("BAD_REQUEST", `Unknown provider: ${conn.provider}`);
      }

      const tokens = await refreshAccessToken(provider, conn.refreshToken);

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
    });
  }

  async list(input: ConnectListInputSchema, { user }: { user: User }) {
    return this.repository.connect.list({ userId: user.id, ...input });
  }

  async delete({ id }: ConnectDeleteInputSchema, { user }: { user: User }) {
    const connection = await this.repository.connect.findById(id);
    if (connection.isOk()) {
      if (connection.value?.userId !== user.id) {
        return this.error("FORBIDDEN", "Not your connection");
      }
      return this.repository.connect.deleteById(id);
    }
    return err(connection.error);
  }
}
