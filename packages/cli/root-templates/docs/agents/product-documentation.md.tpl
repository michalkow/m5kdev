# Maintain product documentation

The public help site lives in `apps/docs`; reader-facing guides live in
`apps/docs/docs/`. Its audience is the people using this product, including
people without technical knowledge.

Before completing a task that adds, changes, or removes user-facing behavior:

1. Read the affected guides and inspect the finished behavior, visible labels,
   access requirements, and limitations.
2. Update those guides and every supported locale in the same change. Add a guide for a new user task;
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
5. Run `pnpm docs:build` and resolve broken links and build errors. In the final
   task summary, name the guides updated and the verification performed.

Internal refactors with no user-visible effect need no guide edit. State that
the documentation was reviewed and why no update was needed. A user-facing
feature task is complete only when its affected documentation matches the app.

The sidebar is generated from the guide files. Keep paths stable when practical;
update incoming links whenever a path changes. App-specific guides belong to
the app: framework updates must preserve their local content.

## Locales

`apps/locales.ts` (Starter: `apps/starter/locales.ts`) is the locale source for
both the app and Docusaurus. Region tags such as `en_GB` become `en-GB` in docs.
Maintain translated guides under `i18n/<locale>/docusaurus-plugin-content-docs/current`
and translated navigation under `i18n/<locale>/docusaurus-theme-classic` in the
help-site package. Match the default guide set in each locale; the build rejects
missing guide translations. Update affected headings, links, navigation labels,
and screenshots in every locale when behavior changes. When adding a locale,
provide its complete guides and Docusaurus UI translations before completing work.
Run the full multi-locale build; a single-locale development server does not
verify the other languages. Preserve app-authored translations during updates.
