---
"@m5kdev/backend": minor
"create-m5kdev": minor
---

Kernel owns Database commands (`runDb`, `defineDrizzleKitConfig`) so apps no longer copy reset/sync/seed/guard scripts. Starter Database config is server `db.ts`; `m5kdev update` ensures it and drops unmodified old drizzle ops files.
