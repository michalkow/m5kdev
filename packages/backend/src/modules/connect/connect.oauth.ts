import * as client from "openid-client";
import { logger as rootLogger } from "../../utils/logger";
import type { ConnectProvider } from "./connect.types";

export interface OAuthState {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  sessionId: string;
  provider: string;
}

// In-memory store for OAuth state (keyed by sessionId + provider)
// In production, consider using Redis with TTL
const oauthStateStore = new Map<string, OAuthState>();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateKey(sessionId: string, provider: string): string {
  return `${sessionId}:${provider}`;
}

export async function generateOAuthState(sessionId: string, provider: string): Promise<OAuthState> {
  const state = client.randomState();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const oauthState: OAuthState = {
    state,
    codeVerifier,
    codeChallenge,
    sessionId,
    provider,
  };

  const key = getStateKey(sessionId, provider);
  oauthStateStore.set(key, oauthState);

  // Clean up after TTL
  setTimeout(() => {
    oauthStateStore.delete(key);
  }, STATE_TTL_MS);

  return oauthState;
}

export function getOAuthState(
  sessionId: string,
  provider: string,
  state: string
): OAuthState | null {
  const key = getStateKey(sessionId, provider);
  const stored = oauthStateStore.get(key);

  if (!stored || stored.state !== state) {
    return null;
  }

  // Clean up after use
  oauthStateStore.delete(key);
  return stored;
}

export async function createConfiguration(
  provider: ConnectProvider
): Promise<client.Configuration> {
  // LinkedIn uses client_secret_post (form-encoded body parameters)
  // The library's ClientSecretPost handles this correctly
  const clientAuth = provider.clientSecret
    ? client.ClientSecretPost(provider.clientSecret)
    : client.None();

  if (provider.issuerConfig) {
    // Use manual issuer config (e.g., LinkedIn) - create Configuration directly
    // LinkedIn doesn't support OpenID Connect discovery
    const serverMetadata: client.ServerMetadata = {
      issuer: provider.issuerConfig.issuer,
      authorization_endpoint: provider.issuerConfig.authorization_endpoint,
      token_endpoint: provider.issuerConfig.token_endpoint,
      ...(provider.issuerConfig.userinfo_endpoint && {
        userinfo_endpoint: provider.issuerConfig.userinfo_endpoint,
      }),
      // LinkedIn JWKS URI for ID token signature verification
      ...(provider.id === "linkedin" && {
        jwks_uri: "https://www.linkedin.com/oauth/openid/jwks",
      }),
    };

    const clientMetadata: Partial<client.ClientMetadata> = {
      client_id: provider.clientId,
      ...(provider.clientSecret && { client_secret: provider.clientSecret }),
      redirect_uris: [provider.redirectUri],
    };

    return new client.Configuration(serverMetadata, provider.clientId, clientMetadata, clientAuth);
  }

  // Auto-discovery from well-known endpoint
  if (!provider.issuerUrl) {
    throw new Error("Provider must have either issuerConfig or issuerUrl");
  }

  const serverUrl = new URL(provider.issuerUrl);
  return await client.discovery(serverUrl, provider.clientId, undefined, clientAuth);
}

export async function buildAuthorizationUrl(
  provider: ConnectProvider,
  state: OAuthState
): Promise<string> {
  const config = await createConfiguration(provider);

  const parameters: Record<string, string> = {
    scope: provider.scopes.join(" "),
    state: state.state,
    redirect_uri: provider.redirectUri,
  };

  // Add PKCE parameters only if provider supports it
  if (provider.supportsPKCE !== false) {
    parameters.code_challenge = state.codeChallenge;
    parameters.code_challenge_method = "S256";
  }

  const url = client.buildAuthorizationUrl(config, parameters);
  return url.toString();
}

export async function exchangeCodeForTokens(
  provider: ConnectProvider,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  state: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: Date;
  scope?: string;
}> {
  const logger = rootLogger.child({ layer: "exchangeCodeForTokens" });

  try {
    // LinkedIn-specific workaround: Manual token exchange to bypass ID token validation
    // LinkedIn's OpenID Connect ID token has non-standard claim format
    if (provider.id === "linkedin" && provider.issuerConfig) {
      const tokenEndpoint = provider.issuerConfig.token_endpoint;
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      });

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `LinkedIn token exchange failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const tokenData = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
        scope?: string;
      };

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type || "bearer",
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        scope: tokenData.scope,
      };
    }

    // Standard flow for other providers
    const config = await createConfiguration(provider);
    const currentUrl = new URL(redirectUri);
    currentUrl.searchParams.set("code", code);
    currentUrl.searchParams.set("state", state);

    const checks: {
      pkceCodeVerifier?: string;
      expectedState: string;
    } = {
      expectedState: state,
    };

    // Only include PKCE verifier if provider supports it
    if (provider.supportsPKCE !== false) {
      checks.pkceCodeVerifier = codeVerifier;
    }

    const tokenSet = await client.authorizationCodeGrant(config, currentUrl, checks);

    return {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      tokenType: tokenSet.token_type,
      expiresAt: tokenSet.expires_in
        ? new Date(Date.now() + tokenSet.expires_in * 1000)
        : undefined,
      scope: tokenSet.scope,
    };
  } catch (error: unknown) {
    // Enhanced error logging for OAuth issues
    logger.error("Token exchange error", { error, provider: provider.id });

    if (error instanceof Error) {
      const errorMessage = error.message || "Unknown error";

      // Check if this is an ID token validation error for LinkedIn
      // LinkedIn's ID token may have non-standard claim format, but we can still use the access token
      if (
        provider.id === "linkedin" &&
        errorMessage.includes("JWT claim") &&
        (error as { code?: string }).code === "OAUTH_JWT_CLAIM_COMPARISON_FAILED"
      ) {
        // Try to extract access token from the error response if available
        // This is a workaround for LinkedIn's ID token validation issues
        logger.warn(
          "LinkedIn ID token validation failed, but token exchange may have succeeded. Check if access token is available.",
          { error: errorMessage }
        );
        // Re-throw for now - we need the access token to continue
        // In a production scenario, you might want to manually parse the token response
        throw new Error(
          `LinkedIn ID token validation failed: ${errorMessage}. This is a known issue with LinkedIn's OpenID Connect implementation.`
        );
      }

      // ResponseBodyError from oauth4webapi has a 'cause' property with the error details
      const responseBodyError = error as { cause?: Record<string, unknown> };
      const errorDetails = responseBodyError.cause;

      // Extract error and error_description from LinkedIn's response
      const linkedInError = errorDetails?.error as string | undefined;
      const linkedInErrorDescription = errorDetails?.error_description as string | undefined;

      const fullErrorMessage = linkedInError
        ? `LinkedIn OAuth error: ${linkedInError}${linkedInErrorDescription ? ` - ${linkedInErrorDescription}` : ""}`
        : `Token exchange failed: ${errorMessage}${
            errorDetails ? ` - Details: ${JSON.stringify(errorDetails)}` : ""
          }`;

      throw new Error(fullErrorMessage);
    }
    throw error;
  }
}

export async function refreshAccessToken(
  provider: ConnectProvider,
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: Date;
  scope?: string;
}> {
  const config = await createConfiguration(provider);

  const tokenSet = await client.refreshTokenGrant(config, refreshToken);

  return {
    accessToken: tokenSet.access_token,
    refreshToken: tokenSet.refresh_token || refreshToken,
    tokenType: tokenSet.token_type,
    expiresAt: tokenSet.expires_in ? new Date(Date.now() + tokenSet.expires_in * 1000) : undefined,
    scope: tokenSet.scope,
  };
}
