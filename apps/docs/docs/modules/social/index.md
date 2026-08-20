---
sidebar_position: 21
---

# Social module

The social module posts content to social networks on behalf of connected
accounts, using provider adapters and OAuth tokens from
[Connection](/modules/connect) (`id` `connect`).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/module-social` | `SocialModule`: provider adapters (LinkedIn), DTOs, types, `SocialService`. |

## Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { ConnectModule } from "@m5kdev/backend/modules/connect/connect.module";
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
import { createLinkedInProvider } from "@m5kdev/backend/modules/connect/connect.linkedin";
import { SocialModule } from "@m5kdev/module-social";
import { createLinkedInSocialProvider } from "@m5kdev/module-social/social.linkedin";

createBackendApp(config, [
  new SocialModule([createLinkedInSocialProvider()]),
  new ConnectModule([createLinkedInProvider()]),
  new FileModule(),
]);
```

`SocialModule` `dependsOn` Connection (`id` `connect`) and File in the Kernel.

## How it works

1. The user links their account through [Connection](/modules/connect)
   (e.g. LinkedIn OAuth). This is not Better Auth login OAuth.
2. App code calls `SocialService.postToProvider(...)` with the provider id and
   post content; the service resolves the connection, refreshes tokens when
   needed, and publishes through the provider adapter.
3. `getProvider(id)` returns a registered `SocialProvider` for provider-specific
   operations.

## Providers

- **LinkedIn** (`social.linkedin.ts`) — publish posts for the linked member.
  Uses the same `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` app as the
  connect provider.

Add a network by implementing the `SocialProvider` interface and passing it to
the module constructor.
