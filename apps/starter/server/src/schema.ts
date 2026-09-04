// biome-ignore-all assist/source/organizeImports: feature-gated table exports stay in marker blocks
export {
  accountClaimMagicLinks,
  accountClaims,
  accounts,
  apikeys,
  invitations,
  members,
  organizations,
  sessions,
  users,
  verifications,
  waitlist,
} from "@m5kdev/backend/modules/auth/auth.db";
// m5k:mcp:start
export {
  jwks,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
} from "@m5kdev/backend/modules/auth/auth.oauth.db";
export { mcpAllowlistEntries } from "@m5kdev/backend/modules/mcp/mcp.db";
// m5k:mcp:end
// m5k:ai:start
export { aiUsage, chats } from "@m5kdev/backend/modules/ai/ai.db";
// m5k:ai:end
// m5k:files:start
export { files } from "@m5kdev/backend/modules/file/file.db";
// m5k:files:end
// m5k:notifications:start
export {
  notificationDevices,
  notificationPreferences,
  notificationSendLogs,
  notifications,
} from "@m5kdev/backend/modules/notification/notification.db";
// m5k:notifications:end
// m5k:workflows:start
export { workflows } from "@m5kdev/backend/modules/workflow/workflow.db";
// m5k:workflows:end
export { posts } from "./modules/posts/posts.db";
