---
sidebar_position: 12
---

# Access module

The access module bridges Better Auth's access-control statements with m5kdev
services: it answers "can this actor perform this action on this resource" using
role definitions you pass in.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `AccessModule`: access repository, `AccessService`, and `AccessControlRoles` utilities built on `better-auth/plugins/access`. |

## Registration

```ts
import { AccessModule } from "@m5kdev/backend/modules/access/access.module";

backendApp.use(new AccessModule(accessControlRoles));
```

The module is generic over your Better Auth `Statements` type, so checks stay
typed against the permissions you actually defined. Depends on `auth`.

## Service API

| Method | Description |
| --- | --- |
| `authorize(...)` | Synchronous permission decision from role statements |
| `checkAccess(...)` | Async check that resolves the actor's memberships/roles first |
| `hasAccess(...)` | Boolean convenience wrapper |

## Relationship to grants

Module grants ([base module](/modules/base)) govern module-internal service
procedures with `own`/`all` semantics. The access module is for app-level,
statement-based checks that reuse Better Auth's access-control vocabulary —
use it when your app defines custom resources and permissions on top of the
role config.
