---
sidebar_position: 21
---

# Social module

The social module posts content to social networks on behalf of connected
accounts, using provider adapters and OAuth tokens from the
[connect module](/modules/connect).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `SocialModule`: provider adapters (LinkedIn), DTOs, types, `SocialService`. |

## Registration

```ts
import { SocialModule } from "@m5kdev/backend/modules/social/social.module";
import { createLinkedInSocialProvider } from "@m5kdev/backend/modules/social/social.linkedin";

backendApp.use(new SocialModule([createLinkedInSocialProvider()]));
```

## How it works

1. The user links their account through the [connect module](/modules/connect)
   (e.g. LinkedIn OAuth).
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
