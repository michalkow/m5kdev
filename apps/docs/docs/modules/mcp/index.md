---
sidebar_position: 15
---

# McpModule

McpModule is the Core Module that serves **MCP clients** (Cursor, Claude Desktop,
and the like) over HTTP. It holds the per-client **MCP allowlist**, serves
`POST /mcp`, and ships the builtin `list-organizations` call. Apps **omit**
`new McpModule()` from `createBackendApp` to disable MCP; the Kernel then does
not merge module MCP catalogs.

`create-m5kdev` has an `mcp` template flag that defaults **off**. Starter
registers McpModule and contributes Posts `list-posts` / `create-post` via
`posts.mcp.ts` (stripped when the flag is off). File, Billing, and other Core
Modules do not ship MCP calls.

1.0 catalogs builtin `list-organizations` plus whatever Backend Modules declare.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `McpModule`: `mcp_allowlist_entries`, `McpService`, `POST /mcp`, origin well-known OAuth discovery, consent tRPC. |
| `@m5kdev/web-ui` | `/consent` on `AuthPublicRouter` — Organization multi-select during Better Auth MCP OAuth. |
| Auth | jwt + MCP + CIMD plugins and OAuth/JWKS tables, **only when McpModule is registered**. |

## Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { McpModule } from "@m5kdev/backend/modules/mcp/mcp.module";

createBackendApp(config, [new EmailModule(templates), new AuthModule(), new McpModule()]);
```

Compose App schema with MCP allowlist rows **and** Auth OAuth/JWKS tables:

```ts
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
```

Pass the Kernel `mcp` factory argument through to `createBetterAuth`. The Kernel
sets it only when McpModule is in the modules array; omit the module and MCP
OAuth plugins stay off.

After adding the tables, generate and apply Drizzle migrations in the app
(`drizzle:generate` then `drizzle:migrate`). Do not hand-edit SQL.

## Better Auth MCP OAuth vs API keys

MCP clients authenticate as a **User** with **Better Auth MCP OAuth** (resource
`{apiUrl}/mcp`, not the webapp cookie session). Login during that dance is the
existing Better Auth `/login`. Consent is `/consent`.

**API keys** stay User-keyed Better Auth HTTP credentials for other clients.
They are not MCP credentials and they do not build an OrganizationActor.

## MCP allowlist and re-consent

Consent records an **MCP allowlist**: the Organizations that OAuth client may
pass as `organizationId` for that User. It is per `(oauthClientId, userId)`, not
one list for the User. Empty selection is valid. Changing the list requires
**re-consent** for that client; two OAuth clients stay isolated.

Allowlist is not Membership and not a Grant. Organization-scoped MCP calls still
require a live Membership (User attached, not soft-deleted). Leaving an
Organization fails Membership even if the id remains on the allowlist.
User-scoped MCP calls do not consult the allowlist, except `list-organizations`
which returns it.

## Builtin list-organizations

`list-organizations` is User-scoped, owned by McpModule’s `mcpUser()` hook, and
reserved as an MCP call name. It does not take `organizationId`. MCP clients
should call it before organization-scoped MCP calls to learn which Organization
ids they may use.

## Declaring MCP calls

Contribute MCP calls from the Backend Module, the way tRPC fragments are
contributed: `<module>.mcp.ts` plus `mcp()` (OrganizationActor) and optional
`mcpUser()` (UserActor). The Kernel merges those maps at boot **only if**
McpModule is registered. Map key is the tool name (flat, not `posts.list`).
Duplicate names fail at boot. Do not scrape Service properties. Do not name a
call `list-organizations`.

Use a free `defineMcpCall()` builder (`description` / `input` / `handle`).
`McpService` stores and invokes the merged catalog; it is not injected onto the
declaring service.

```ts
export function createPostsMcp(posts: PostsService) {
  return {
    "list-posts": defineMcpCall()
      .description("List posts in the selected Organization")
      .input(postSchemas.input.list)
      .handle(async (input, actor) =>
        posts.list(input, { actor, user: { id: actor.userId } })
      ),
    "create-post": defineMcpCall()
      .description("Create a draft post in the selected Organization")
      .input(postSchemas.input.create)
      .handle(async (input, actor) =>
        posts.create(input, { actor, user: { id: actor.userId } })
      ),
  };
}
```

`mcpUser()` handles receive `UserActor`. Any module may contribute User-scoped
calls the same way.

## organizationId stripping

Organization-scoped MCP calls require `organizationId` from the MCP client.
McpModule checks the MCP allowlist, resolves a live Membership, builds
`OrganizationActor`, and **strips** `organizationId` from handle input. The
handle sees only the declared Zod input plus `actor`. Attribute org-scoped
writes from `ctx.actor` (not `session.activeOrganizationId`).

## Grants

Grants are optional. Membership plus MCP allowlist only build OrganizationActor.
A handle may delegate to a Procedure (Grant check runs) or call unguarded
service methods. Starter Posts `list-posts` / `create-post` delegate to the
existing Procedures. An MCP call is still not a Procedure.

## HTTP

McpModule mounts `POST /mcp` only (MCP protocol `2026-07-28`, legacy rejected)
and origin `/.well-known/oauth-protected-resource` /
`/.well-known/oauth-authorization-server` so MCP clients can discover Auth
mounted at `/api/auth/*`. Authorization-server metadata is at the issuer-suffixed
path `/.well-known/oauth-authorization-server/api/auth`.

## Related

- [Better Auth 1.7.2 in 0.37.0](/guides/v0.37.0-better-auth-1.7.2-migration)
- [McpModule and MCP OAuth in 0.37.0](/guides/v0.37.0-mcp-oauth-migration)
- [Auth](/modules/auth)
