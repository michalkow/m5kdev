---
sidebar_position: 15
---

# McpModule

McpModule is the Core Module that serves **MCP clients** (Cursor, Claude Desktop,
and the like) over HTTP. It discovers **MCP calls** declared on services, holds
the per-client **MCP allowlist**, and ships the builtin `list-organizations`
call. Apps **omit** `new McpModule()` from `createBackendApp` to disable MCP.

`create-m5kdev` has an `mcp` template flag that defaults **off**. Starter
registers McpModule so the kernel dogfoods the HTTP adapter; it does not declare
example app MCP calls on Posts, File, Billing, or other Starter services.

1.0 catalogs only builtin `list-organizations` plus whatever the app declares.
No other Core Module ships MCP calls.

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

Allowlist is not Membership and not a Grant. Invoke still requires a live
Membership (User attached, not soft-deleted). Leaving an Organization fails
Membership even if the id remains on the allowlist.

## Builtin list-organizations

`list-organizations` is UserActor, owned by McpModule, and reserved as an MCP
call name. It does not take `organizationId`. MCP clients should call it before
org-scoped MCP calls to learn which Organization ids they may use.

## Declaring MCP calls

Declare MCP calls as service properties through `McpService` (`description` /
`input` / `handle`). The Kernel discovers them at boot the same way it discovers
Workflow job definitions. The property key is the protocol tool name.

```ts
import type { OrganizationActor } from "@m5kdev/backend/base/base.actor";
import { BaseService } from "@m5kdev/backend/base/base.service";
import type { McpService } from "@m5kdev/backend/modules/mcp/mcp.service";
import { z } from "zod";

export class OrdersService extends BaseService<
  Record<string, never>,
  { mcp: McpService }
> {
  readonly listOpen = this.service.mcp
    .description("List open orders in the selected Organization")
    .input(z.object({ status: z.string().optional() }))
    .handle(async (input, actor: OrganizationActor) => {
      return this.listOpenOrders({ status: input.status, actor });
    });
}
```

Inject `McpService` from `McpModule` in the app module `services()` hook, the
same way Demo Workflow injects `WorkflowService`. Do not name a call
`list-organizations`.

## organizationId stripping

App-declared MCP calls require `organizationId` from the MCP client. McpModule
checks the MCP allowlist, resolves a live Membership, builds
`OrganizationActor`, and **strips** `organizationId` from handle input. The
handle sees only the declared Zod input plus `actor`.

## Grants honor system

McpModule does **not** enforce Grants. Membership plus MCP allowlist are the
Actor gate, not `read` / `write` / `delete` / `publish`. Handle authors may call
unguarded service or repository methods. Review is the control — the same rhyme
as Workflow job handlers.

Use a Procedure when the work must run a Grant check. An MCP call is a different
noun.

## HTTP

McpModule mounts `POST /mcp` only (MCP protocol `2026-07-28`, legacy rejected)
and origin `/.well-known/oauth-protected-resource` /
`/.well-known/oauth-authorization-server` so MCP clients can discover Auth
mounted at `/api/auth/*`.
