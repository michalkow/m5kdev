# Maintain product documentation

The public help site lives in `apps/starter/docs`; reader-facing guides live in
`apps/starter/docs/docs/`. Its audience includes people using the screens, including
people without technical knowledge, and consumers of any exposed backend API
or MCP interface.

Before completing a task that adds, changes, or removes user-facing behavior:

1. Read the affected guides and inspect the finished behavior, visible labels,
   access requirements, and limitations.
2. Update those guides and every supported locale in the same change. Add a guide for a new user task;
   revise existing instructions for changed behavior; remove obsolete advice
   and repair links when a feature is removed. Cover fixes when they change
   what a user needs to know or do.
3. Write for the affected screen or interface's audience using the structure
   below. Use plain language, explain unfamiliar terms, and describe only
   capabilities the app actually provides. Make web/mobile differences explicit.
4. Keep engineering setup, API implementation internals, architecture,
   deployment instructions, agent rules, and secrets in repository documentation outside the public
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

## Screens and user journeys

Organize frontend help around the app's navigation, screens and user journeys,
rather than backend modules or implementation structure. Cover every user-facing
screen, grouping connected screens into a journey when that helps the reader.

For each screen, explain its purpose, how to reach it, who can access it, and
any prerequisites. Describe the controls and actions with the actual visible
labels: what to enter or select, numbered steps to follow, expected outcomes, and
how to continue to related screens. Cover relevant loading, empty, success,
and error states, limits, and recovery from common problems. Make differences
between web and mobile clear. Link related journeys instead of duplicating them.

## API and MCP usage

If the app exposes a backend API or MCP interface, document its consumer-facing
usage in separate sections from screen walkthroughs and from each other, with
separate navigation entries:

- **API:** explain how to connect, authentication and permissions, supported
  endpoints and operations, inputs and outputs, request/response examples,
  limits, errors, and recovery.
- **MCP:** explain client connection/setup, authentication and permissions,
  available tools and their names, inputs and outputs, example interactions,
  limits, errors, and recovery.

Verify contracts and examples against the interfaces the app actually exposes,
including enabled-feature and access differences. Cross-link relevant screen
workflows where helpful. Consumer usage belongs in these public sections;
implementation and operations details stay in repository documentation.
Do not invent interfaces or create empty reference sections for capabilities
the app does not expose. Maintain these guides and their navigation in every
supported locale, just like screen guides.

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
