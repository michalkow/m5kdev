import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { sessions, users } from "./auth.db";

const timestamp = (name: string) => integer(name, { mode: "timestamp" });
const booleanFlag = (name: string) => integer(name, { mode: "boolean" });
const jsonText = (name: string) => text(name, { mode: "json" });

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey().$default(uuidv4),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$default(() => new Date()),
  expiresAt: timestamp("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey().$default(uuidv4),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: booleanFlag("disabled").default(false),
  skipConsent: booleanFlag("skip_consent"),
  enableEndSession: booleanFlag("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: jsonText("scopes").$type<string[]>(),
  clientCredentialsScopes: jsonText("client_credentials_scopes").$type<string[]>().default([]),
  userId: text("user_id").references(() => users.id),
  createdAt: timestamp("created_at").$default(() => new Date()),
  updatedAt: timestamp("updated_at").$default(() => new Date()),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: jsonText("contacts").$type<string[]>(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: jsonText("redirect_uris").notNull().$type<string[]>(),
  postLogoutRedirectUris: jsonText("post_logout_redirect_uris").$type<string[]>(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: booleanFlag("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: jsonText("grant_types").$type<string[]>(),
  responseTypes: jsonText("response_types").$type<string[]>(),
  requirePKCE: booleanFlag("require_pkce"),
  dpopBoundAccessTokens: booleanFlag("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: jsonText("metadata").$type<Record<string, unknown>>(),
});

export const oauthResources = sqliteTable("oauth_resources", {
  id: text("id").primaryKey().$default(uuidv4),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl", { mode: "number" }),
  refreshTokenTtl: integer("refresh_token_ttl", { mode: "number" }),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: jsonText("allowed_scopes").$type<string[]>(),
  customClaims: jsonText("custom_claims").$type<Record<string, unknown>>(),
  dpopBoundAccessTokensRequired: booleanFlag("dpop_bound_access_tokens_required").default(false),
  disabled: booleanFlag("disabled").default(false),
  createdAt: timestamp("created_at").$default(() => new Date()),
  updatedAt: timestamp("updated_at").$default(() => new Date()),
  policyVersion: integer("policy_version", { mode: "number" }).default(1),
  metadata: jsonText("metadata").$type<Record<string, unknown>>(),
});

export const oauthClientResources = sqliteTable(
  "oauth_client_resources",
  {
    id: text("id").primaryKey().$default(uuidv4),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResources.id, { onDelete: "cascade" }),
    metadata: jsonText("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").$default(() => new Date()),
  },
  (t) => [uniqueIndex("oauth_client_resources_client_resource_unique").on(t.clientId, t.resourceId)]
);

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  id: text("id").primaryKey().$default(uuidv4),
  token: text("token").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: jsonText("resources").$type<string[]>(),
  requestedUserInfoClaims: jsonText("requested_user_info_claims").$type<string[]>(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$default(() => new Date()),
  revoked: timestamp("revoked"),
  rotatedAt: timestamp("rotated_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: timestamp("rotation_replay_expires_at"),
  authTime: timestamp("auth_time"),
  confirmation: jsonText("confirmation").$type<Record<string, unknown>>(),
  scopes: jsonText("scopes").notNull().$type<string[]>(),
});

export const oauthAccessTokens = sqliteTable("oauth_access_tokens", {
  id: text("id").primaryKey().$default(uuidv4),
  token: text("token").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: jsonText("resources").$type<string[]>(),
  requestedUserInfoClaims: jsonText("requested_user_info_claims").$type<string[]>(),
  refreshId: text("refresh_id").references(() => oauthRefreshTokens.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$default(() => new Date()),
  revoked: timestamp("revoked"),
  confirmation: jsonText("confirmation").$type<Record<string, unknown>>(),
  scopes: jsonText("scopes").notNull().$type<string[]>(),
});

export const oauthConsents = sqliteTable("oauth_consents", {
  id: text("id").primaryKey().$default(uuidv4),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id),
  userId: text("user_id").references(() => users.id),
  referenceId: text("reference_id"),
  resources: jsonText("resources").$type<string[]>(),
  requestedUserInfoClaims: jsonText("requested_user_info_claims").$type<string[]>(),
  scopes: jsonText("scopes").notNull().$type<string[]>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$default(() => new Date()),
});

export const oauthClientAssertions = sqliteTable("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
});
