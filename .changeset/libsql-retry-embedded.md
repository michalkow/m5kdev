---
"@m5kdev/backend": patch
---

Recognize embedded-replica `Hrana(Api("status=404...stream not found"))` failures (surfaced as `SQLITE_*` LibsqlErrors) in `isRetryableLibsqlError` so `withLibsqlRetry` reconnects instead of leaving the process stuck on a dead stream.
