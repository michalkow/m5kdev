---
"@m5kdev/frontend": patch
"@m5kdev/web-ui": patch
---

AuthProvider now calls an optional onSignIn callback only after a successful authentication action, not a session load or refresh.
Public login, signup, and OAuth flows record those completions, and AuthPublicRouter mounts `/auth/sign-in/:attemptId` so the callback also runs after social redirects.
