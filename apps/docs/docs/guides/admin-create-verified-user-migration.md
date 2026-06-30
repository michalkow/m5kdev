---
sidebar_position: 4
---

# Admin create verified user migration

Users created from the admin panel can be marked as email-verified at creation
time. The backend only applies this when **both** conditions are met:

1. The request includes the shared opt-in header.
2. The authenticated session user has `role === "admin"`.

This avoids inferring intent from the Better Auth route path and keeps the
behavior explicit to admin-panel flows.

## What changed in the stack

| Layer | Change |
| --- | --- |
| `@m5kdev/commons` | Added `ADMIN_CREATE_VERIFIED_USER_HEADER` and `ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE` in `modules/auth/auth.constants`. |
| `@m5kdev/backend` | `createBetterAuth` reads the header from the request context and sets `emailVerified: true` during user creation when the admin session check passes. |
| `@m5kdev/web-ui` | `AuthAdminUserManagement` sends the header on `authClient.admin.createUser`. |
| App server bootstrap | CORS must allow the custom header through browser preflight. |

New apps scaffolded from the minimal CLI template already include the CORS
entry. Existing apps must add it manually.

## Required change for existing apps

Update `apps/<app>/server/src/app.ts` (or wherever Express CORS is configured)
and add `Admin-Create-Verified-User` to `allowedHeaders`:

```ts
import cors from "cors";

app.use(
  cors({
    origin: [appUrl],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Waitlist-Invitation-Code",
      "Organization-Invitation-Code",
      "Admin-Create-Verified-User",
    ],
  })
);
```

If your app uses a different CORS setup (reverse proxy, API gateway, or
framework middleware), allow the same header name there as well.

### Why this is required

Browsers send a preflight `OPTIONS` request before cross-origin `POST`s that
include non-simple headers. If CORS does not expose
`Admin-Create-Verified-User`, the browser drops the header and the backend
creates the user with the default unverified email state.

Server-to-server calls and same-origin requests are not affected by CORS, but
the admin panel in the web app is cross-origin in the usual Vite dev setup
(`localhost:5173` → `localhost:8080`), so the CORS allowlist matters during
development and in split-origin deployments.

## Frontend behavior

### Using `@m5kdev/web-ui`

If the app mounts `AuthAdminUserManagement` from a current `@m5kdev/web-ui`
release, no extra frontend work is needed beyond the CORS change above. The
component already sends:

```ts
import {
  ADMIN_CREATE_VERIFIED_USER_HEADER,
  ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE,
} from "@m5kdev/commons/modules/auth/auth.constants";

await authClient.admin.createUser(body, {
  headers: {
    [ADMIN_CREATE_VERIFIED_USER_HEADER]: ADMIN_CREATE_VERIFIED_USER_HEADER_VALUE,
  },
});
```

### Custom admin create-user UI

Import the constants from `@m5kdev/commons` and pass the same header in the
second argument to `authClient.admin.createUser`. Do not hardcode the header
string in app code.

Only send this header from authenticated admin UI flows. The backend ignores it
when the session user is not an admin.

## Upgrade checklist

1. Upgrade `@m5kdev/backend`, `@m5kdev/commons`, and `@m5kdev/web-ui` to a
   release that includes this behavior.
2. Add `Admin-Create-Verified-User` to server CORS `allowedHeaders`.
3. Redeploy the API (and web app if you ship admin UI changes separately).
4. Verify in the admin panel:
   - Create a test user.
   - Confirm `emailVerified` is `true` in admin user search / list output.
   - Confirm the new user can sign in without completing email verification
     (when `requireEmailVerification` is enabled for normal signups).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| User is created but `emailVerified` is `false` | CORS stripped the header, or the request was not made by an admin session. |
| Preflight fails in the browser network tab | Missing `Admin-Create-Verified-User` in `allowedHeaders`. |
| Header present but still unverified | Session user is not `role: "admin"`, or header value is not exactly `"true"`. |

## Related docs

- [Auth module](/modules/auth)
- [Backend package](/packages/backend)
- [Commons package](/packages/commons)
