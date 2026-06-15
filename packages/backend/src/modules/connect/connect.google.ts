import type { ConnectProfile, ConnectProvider } from "./connect.types";

interface GoogleUserInfoResponse {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
}

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function createGoogleProvider(): ConnectProvider {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.VITE_SERVER_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      "Missing required Google OAuth environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VITE_SERVER_URL"
    );
  }

  return {
    id: "google",
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/connect/google/callback`,
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    issuerUrl: "https://accounts.google.com",
    authorizationExtraParams: {
      access_type: "offline",
      prompt: "consent",
    },
    async mapProfile(accessToken: string): Promise<ConnectProfile> {
      const response = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as GoogleUserInfoResponse;

      return {
        providerAccountId: data.sub,
        displayName: data.name,
        avatarUrl: data.picture,
        accountType: "user",
        metadata: {
          givenName: data.given_name,
          familyName: data.family_name,
          email: data.email,
          emailVerified: data.email_verified,
          locale: data.locale,
        },
      };
    },
  };
}
