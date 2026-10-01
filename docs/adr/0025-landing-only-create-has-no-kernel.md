# Landing-only create has no Kernel

`create-m5kdev --platform landing` emits a pnpm workspace whose only app package is Landing. There is no server, Email, Webapp, Expo, or Deploy home; env lives in the Landing package. Expo-only is unchanged (still a server). Starter still contains every package; its Landing is name and pitch only and does not link to the Webapp.

A landing-only app may later run `m5kdev update --platform web|expo|both`. That path only upgrades from Landing; it is not a general platform switcher and cannot downgrade. Upgrade keeps existing Landing sources, copies env into `apps/shared`, and then asks optional modules and e2e the same way create does.

## Considered Options

- **Always-on server, omit only Webapp and Expo** — rejected: a Kernel with no client is not the product; Landing would still CTA into a missing SPA.
- **Slim server (Auth/Email/Waitlist, no Posts)** plus a standalone flavor — rejected: two Kernel-less vs Kernel shapes to maintain; Waitlist UI today lives on the Webapp. If both Webapp and Expo are omitted, there is no server at all.
- **No server whenever Webapp is omitted** — rejected: expo-only already omits Webapp and still needs a server.
- **General `update --platform` switcher** (web↔expo, downgrade to landing) — rejected: version reconcile stays the default update; `--platform` is only the landing escape hatch.
