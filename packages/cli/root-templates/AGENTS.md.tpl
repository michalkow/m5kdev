# AGENTS.md

## About the Project

**{{APP_NAME}}** is a minimal app scaffolded for the m5kdev stack.

{{APP_DESCRIPTION}}

## Repository Structure

- `apps/landing` holds the public one-page site and its Fly adapter.
// m5k:server:start
- `apps/shared` holds shared Zod schemas, constants, and the product Deploy home.
- `apps/server` holds the backend composition root, modules, auth wiring, and database scripts.
- `apps/email` holds the email templates used by auth flows and local email delivery.
// m5k:server:end
// m5k:webapp:start
- `apps/webapp` holds the React app shell, routes, providers, and the `posts` feature.
// m5k:webapp:end
// m5k:expo:start
- `apps/expo` holds the Expo (React Native) client.
// m5k:expo:end

// m5k:server:start
## Modules

`posts` is the reference module. Mirror its layout when adding a feature:

- `apps/shared/src/modules/posts/`
- `apps/server/src/modules/posts/`
// m5k:webapp:start
- `apps/webapp/src/modules/posts/`
// m5k:webapp:end

Read the matching `.cursor/rules` guide before editing a module file.
// m5k:server:end

## Agent skills

### Issue tracker

Issues live in GitHub Issues. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
