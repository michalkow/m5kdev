import type { ConnectProfile, ConnectProvider } from "./connect.types";

interface LinkedInUserInfoResponse {
  sub: string; // Subject identifier (user ID)
  name?: string; // Full name
  given_name?: string; // First name
  family_name?: string; // Last name
  picture?: string; // Profile picture URL
  locale?: string;
  email?: string;
  email_verified?: boolean;
}

export function createLinkedInProvider(
  options: Partial<
    Pick<ConnectProvider, "clientId" | "clientSecret" | "redirectUri" | "redirectUris">
  > = {}
): ConnectProvider {
  const clientId = options.clientId ?? process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing required LinkedIn OAuth environment variables: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET"
    );
  }

  return {
    id: "linkedin",
    clientId,
    clientSecret,
    redirectUri: options.redirectUri,
    redirectUris: options.redirectUris,
    // LinkedIn OpenID Connect scopes
    scopes: ["openid", "profile", "w_member_social"],
    // LinkedIn doesn't support PKCE - disable it
    supportsPKCE: false,
    // LinkedIn OpenID Connect endpoints
    issuerConfig: {
      issuer: "https://www.linkedin.com",
      authorization_endpoint: "https://www.linkedin.com/oauth/v2/authorization",
      token_endpoint: "https://www.linkedin.com/oauth/v2/accessToken",
      userinfo_endpoint: "https://api.linkedin.com/v2/userinfo",
    },
    async mapProfile(accessToken: string): Promise<ConnectProfile> {
      // Use OpenID Connect userinfo endpoint
      const response = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as LinkedInUserInfoResponse;

      return {
        providerAccountId: data.sub,
        displayName: data.name,
        avatarUrl: data.picture,
        accountType: "user",
        metadata: {
          givenName: data.given_name,
          familyName: data.family_name,
          locale: data.locale,
          email: data.email,
          emailVerified: data.email_verified,
        },
      };
    },
  };
}
