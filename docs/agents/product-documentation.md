# Maintain product documentation

The public help site lives in `apps/starter/docs`; reader-facing guides live in
`apps/starter/docs/docs/`. Its audience is the people using this product, including
people without technical knowledge.

Before completing a task that adds, changes, or removes user-facing behavior:

1. Read the affected guides and inspect the finished behavior, visible labels,
   access requirements, and limitations.
2. Update those guides in the same change. Add a guide for a new user task;
   revise existing instructions for changed behavior; remove obsolete advice
   and repair links when a feature is removed. Cover fixes when they change
   what a user needs to know or do.
3. Write around the user's goal: what the feature does, when to use it,
   prerequisites, numbered steps using actual UI labels, expected results,
   relevant limits, and how to recover from common problems. Use plain language
   and explain unfamiliar product terms. Document only capabilities the app
   actually provides, with differences between web and mobile made explicit.
4. Keep engineering setup, API internals, architecture, deployment instructions,
   agent rules, and secrets in repository documentation outside the public
   guides. The entire help site is public; sign-in is never an access control
   for material published there.
5. Run `pnpm --filter @starter-app/docs build` and resolve broken links and build errors. In the final
   task summary, name the guides updated and the verification performed.

Internal refactors with no user-visible effect need no guide edit. State that
the documentation was reviewed and why no update was needed. A user-facing
feature task is complete only when its affected documentation matches the app.

The sidebar is generated from the guide files. Keep paths stable when practical;
update incoming links whenever a path changes. App-specific guides belong to
the app: framework updates must preserve their local content.
