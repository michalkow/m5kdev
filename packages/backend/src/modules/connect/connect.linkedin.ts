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

export function createLinkedInProvider(): ConnectProvider {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const baseUrl = process.env.VITE_SERVER_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      "Missing required LinkedIn OAuth environment variables: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, VITE_SERVER_URL"
    );
  }

  return {
    id: "linkedin",
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/connect/linkedin/callback`,
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
