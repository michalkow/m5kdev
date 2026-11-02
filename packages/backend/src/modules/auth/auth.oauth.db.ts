import { boolean, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { sessions, users } from "./auth.db";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const booleanFlag = (name: string) => boolean(name);

export const jwks = appDatabaseSchema.table("jwks", {
  id: text("id").primaryKey().$default(uuidv4),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$default(() => new Date()),
  expiresAt: timestampColumn("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClients = appDatabaseSchema.table("oauth_clients", {
  id: text("id").primaryKey().$default(uuidv4),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: booleanFlag("disabled").default(false),
  skipConsent: booleanFlag("skip_consent"),
  enableEndSession: booleanFlag("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes").array().$type<string[]>(),
  clientCredentialsScopes: text("client_credentials_scopes").array().$type<string[]>().default([]),
  userId: text("user_id").references(() => users.id),
  createdAt: timestampColumn("created_at").$default(() => new Date()),
  updatedAt: timestampColumn("updated_at").$default(() => new Date()),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array().$type<string[]>(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull().$type<string[]>(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array().$type<string[]>(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: booleanFlag("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types").array().$type<string[]>(),
  responseTypes: text("response_types").array().$type<string[]>(),
  requirePKCE: booleanFlag("require_pkce"),
  dpopBoundAccessTokens: booleanFlag("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const oauthResources = appDatabaseSchema.table("oauth_resources", {
  id: text("id").primaryKey().$default(uuidv4),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array().$type<string[]>(),
  customClaims: jsonb("custom_claims").$type<Record<string, unknown>>(),
  dpopBoundAccessTokensRequired: booleanFlag("dpop_bound_access_tokens_required").default(false),
  disabled: booleanFlag("disabled").default(false),
  createdAt: timestampColumn("created_at").$default(() => new Date()),
  updatedAt: timestampColumn("updated_at").$default(() => new Date()),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const oauthClientResources = appDatabaseSchema.table(
  "oauth_client_resources",
  {
    id: text("id").primaryKey().$default(uuidv4),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestampColumn("created_at").$default(() => new Date()),
  },
  (t) => [uniqueIndex("oauth_client_resources_client_resource_unique").on(t.clientId, t.resourceId)]
);

export const oauthRefreshTokens = appDatabaseSchema.table("oauth_refresh_tokens", {
  id: text("id").primaryKey().$default(uuidv4),
  token: text("token").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array().$type<string[]>(),
  requestedUserInfoClaims: text("requested_user_info_claims").array().$type<string[]>(),
  expiresAt: timestampColumn("expires_at").notNull(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$default(() => new Date()),
  revoked: timestampColumn("revoked"),
  rotatedAt: timestampColumn("rotated_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: timestampColumn("rotation_replay_expires_at"),
  authTime: timestampColumn("auth_time"),
  confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
  scopes: text("scopes").array().notNull().$type<string[]>(),
});

export const oauthAccessTokens = appDatabaseSchema.table("oauth_access_tokens", {
  id: text("id").primaryKey().$default(uuidv4),
  token: text("token").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array().$type<string[]>(),
  requestedUserInfoClaims: text("requested_user_info_claims").array().$type<string[]>(),
  refreshId: text("refresh_id").references(() => oauthRefreshTokens.id),
  expiresAt: timestampColumn("expires_at").notNull(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$default(() => new Date()),
  revoked: timestampColumn("revoked"),
  confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
  scopes: text("scopes").array().notNull().$type<string[]>(),
});

export const oauthConsents = appDatabaseSchema.table("oauth_consents", {
  id: text("id").primaryKey().$default(uuidv4),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId),
  userId: text("user_id").references(() => users.id),
  referenceId: text("reference_id"),
  resources: text("resources").array().$type<string[]>(),
  requestedUserInfoClaims: text("requested_user_info_claims").array().$type<string[]>(),
  scopes: text("scopes").array().notNull().$type<string[]>(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$default(() => new Date()),
});

export const oauthClientAssertions = appDatabaseSchema.table("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestampColumn("expires_at").notNull(),
});
