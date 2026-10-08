---
sidebar_position: 15
---

# McpModule

McpModule is the Core Module that serves **MCP clients** (Cursor, Claude Desktop,
and the like) over HTTP. It is a thin **tRPC-MCP adapter**: it walks the tRPC
router for procedures opted in with `meta.mcp`, serves them as tools on
`POST /mcp`, and enforces the per-client **MCP allowlist** plus consent. It
ships the builtin `list-organizations` tool. Apps **omit** `new McpModule()`
from `createBackendApp` to disable MCP; the Kernel then does not enable MCP
OAuth or MCP HTTP.

`create-m5kdev` has an `mcp` template flag that defaults **off**. When the flag
is on, Starter registers McpModule and Posts marks `list-posts` / `create-post`
with `meta.mcp` on its tRPC procedures (stripped, with the MCP e2e specs, when
the flag is off). File, Billing, and other Core Modules do not mark procedures
with `meta.mcp`.

1.0 catalogs builtin `list-organizations` plus Starter Posts `list-posts` and
`create-post`.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `McpModule`: `mcp_allowlist_entries`, `McpService`, the tRPC-MCP adapter, `POST /mcp`, origin well-known OAuth discovery, consent tRPC. |
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
They are not MCP credentials: the MCP allowlist never applies to them. API keys
may still call the same org-scoped tRPC procedures by passing `organizationId`
on input (cookieless callers must name the Organization), and they still need a
live Membership in that Organization.

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

`list-organizations` is a User-scoped tRPC procedure on McpModule, opted into
the catalog with `meta.mcp`. The name is reserved — do not mark another
procedure with it. It does not take `organizationId`. MCP clients should call it
before organization-scoped tools to learn which Organization ids they may use.

## Declaring MCP tools

Opt a tRPC procedure into the MCP catalog with `.meta({ mcp: ... })`. Both
fields are required: `name` is the flat tool name (collisions fail at boot —
never `posts.list`), and `description` is instruction-style copy telling the
MCP client when and how to use the tool, not user-facing OpenAPI text. There
are no `<module>.mcp.ts` files and no `mcp()` / `mcpUser()` hooks.

```ts
list: procedure
  .meta({
    mcp: {
      name: "list-posts",
      description:
        "List posts in an Organization. Call list-organizations first to learn organizationId values, then pass one as organizationId.",
    },
  })
  .input(postSchemas.input.list)
  .output(postSchemas.output.list)
  .query(async ({ ctx, input }) => handleTRPCResult(await postsService.list(input ?? {}, ctx))),
```

Whether a tool is Organization-, User-, or Admin-scoped follows the procedure
builder that created it — `organizationProcedure`, `userProcedure`, and
`adminProcedure` stamp `meta.actorScope`, so the adapter never guesses scope.
`organizationProcedure` adds optional `organizationId` to caller input for you;
do not add it by hand on each shared Zod schema, and do not add it to
`userProcedure` or `adminProcedure`. Starter Posts marks only `list-posts` and
`create-post`; update/publish/delete stay webapp-only unless you opt them in.

## organizationId on org-scoped tools

Organization-scoped tools advertise `organizationId` as required in their tool
schema. Resolution order: input `organizationId` when present (it wins over the
session active Organization and over an existing Actor) → else the session
active Organization → else an OrganizationActor already on the call
(Workflow jobs / internal) → else 400 Bad Request. When named from input or
session, a live Membership builds the OrganizationActor; a missing Membership
is forbidden/not-found, not 400. `organizationId` is stripped before `handle`,
so handlers and Grants read the Organization from `ctx.actor` only — attribute
org-scoped writes from `ctx.actor` (not `session.activeOrganizationId`).
User-scoped tools take no `organizationId` and skip the allowlist; Admin tools
run as AdminActor and skip both.

## Grants

Grant checks always run. An MCP tool **is** its tRPC procedure: McpModule
invokes the procedure in-process with the OAuth User and the tool arguments, so
Starter Posts `list-posts` / `create-post` enforce the same Posts Grants as the
webapp. An MCP client cannot write what its Role cannot.

## Breaking catalog change

The MCP catalog used to be a second code surface: `<module>.mcp.ts` files,
`mcp()` / `mcpUser()` module hooks, and `defineMcpCall` builders with a custom
invoke path. That surface is removed — tools come only from tRPC procedures
with `meta.mcp`, and every tool call runs its procedure (Grants included).
Delete any surviving `*.mcp.ts` files and `override mcp(` hooks instead of
porting them.

The same change altered four org-scoped Auth procedures whose inputs were not
objects and therefore could not chain after the new `organizationId` object
input. They now take object inputs: `setOrganizationFlags` / `setMemberFlags`
take `{ flags }`, and `setOrganizationOnboarding` / `setMemberOnboarding` take
`{ onboarding }`. External callers passing a bare array or number must send the
object shape. (No versioned migration guide is published for this yet; when the
maintainer names the release, it moves into `guides/`.)

## HTTP

McpModule mounts `POST /mcp` only (streamable HTTP). The MCP TypeScript SDK
serves `2025-11-25` in **stateless** legacy mode so Cursor can initialize, and
still accepts `2026-07-28`. `GET /mcp` is the baked SPA when configured, not an
MCP transport — do not add SSE. Origin
`/.well-known/oauth-protected-resource` /
`/.well-known/oauth-authorization-server` let MCP clients discover Auth
mounted at `/api/auth/*`. Authorization-server metadata is at the issuer-suffixed
path `/.well-known/oauth-authorization-server/api/auth`. That document advertises
CIMD (`client_id_metadata_document_supported`) and, for clients such as Cursor
that still require RFC 7591, DCR (`registration_endpoint` →
`/api/auth/oauth2/register`).

## Related

- [Better Auth 1.7.2 in 0.37.0](/guides/v0.37.0-better-auth-1.7.2-migration)
- [McpModule and MCP OAuth in 0.37.0](/guides/v0.37.0-mcp-oauth-migration)
- [Auth](/modules/auth)
