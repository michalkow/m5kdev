export interface ConnectProvider {
  id: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  issuerConfig?: {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
  };
  issuerUrl?: string; // For auto-discovery
  supportsPKCE?: boolean; // Whether provider supports PKCE (default: true)
  mapProfile: (accessToken: string) => Promise<ConnectProfile>;
}

export interface ConnectProfile {
  providerAccountId: string;
  displayName?: string;
  avatarUrl?: string;
  handle?: string;
  accountType: "user" | "page" | "org" | "channel";
  parentId?: string;
  metadata?: Record<string, unknown>;
}

