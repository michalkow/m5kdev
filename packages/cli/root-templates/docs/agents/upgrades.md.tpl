# Verify a framework upgrade

Template reconciliation establishes which source changes were applied. It does
not establish that the upgraded app works. Use the exact target CLI release
throughout the upgrade; `PROJECT.md`, when present, supplies product goals.

## Before changing the app

1. Read the applicable guides between the app's recorded and target releases.
   Identify their Automatic, Manual, and Conditional steps and the affected
   migration, CI, deployment, documentation, and user-journey paths.
2. Run `pnpm dlx create-m5kdev@<target-version> doctor` and record its preflight
   evidence. Inspect installed versions, package executable targets/shims, and
   required configuration, rather than trusting package declarations alone.
3. Commit or stash unrelated changes, then preview with
   `pnpm dlx create-m5kdev@<target-version> update --dry-run`.
   Update also runs preflight automatically. Resolve unsafe metadata/path
   blockers; baseline issues that the upgrade can repair do not prevent that
   repair. A dry-run performs no installation or application.

## Apply and verify

1. Apply a reviewed, conflict-free update. Installation can run when dependency
   inputs changed or existing packages/executables are missing or stale.
   With `--skip-install`, run the outstanding install step yourself. A failed
   installation leaves applied sources in place and is reported as blocked.
2. Complete the remaining Manual and Conditional guide steps. `applied` and the
   recorded template version describe source application, not working-upgrade
   evidence. Keep the original preflight separate from post-application results.
3. Run `pnpm dlx create-m5kdev@<target-version> doctor --full` after guide work.
   It runs required typecheck/lint/build scripts and the configured docs build;
   missing scripts and failed commands are blockers rather than silent skips.
4. Verify each affected path with its own evidence:
   - **CI:** inspect workflow jobs and dependencies, then record actual affected
     job runs and results. Local validation does not prove CI execution.
   - **Deployment:** inspect referenced Fly/Docker/build inputs and validate the
     affected image/runtime path. Record remote behavior only when it was tested.
     Production deployment requires explicit user instruction; a feature or
     upgrade request is not authorization.
   - **Documentation:** build all configured locales, inspect changed guides and
     navigation, and distinguish a successful build from published hosting.
// m5k:server:start
   - **Migrations:** inspect scripts, Drizzle/schema configuration, and direct
     versus pooled URL requirements. Follow `docs/agents/database-migrations.md`
     to generate/review/apply and verify only local or Development changes.
     Production migrations require explicit instruction and the deploy workflow.
// m5k:server:end
   - **User journeys:** verify the complete affected flow reaches its intended
     outcome. Apply the North Star guidance in `AGENTS.md`; measure user-visible
     waiting when responsiveness is a product priority.

Doctor and update do not execute database migrations, CI jobs, or deployments. Presence
of their configuration is not proof that those paths work. Never trigger a
Production operation merely to turn a verification item green.

## Report evidence

Report every affected check under one of these categories:

- **Verified:** state exactly what was checked, the command or run, its result,
  and the environment/scope. A successful local build verifies that build only.
- **Configured but untested:** identify the files/scripts that are present and
  the execution still needed. Report lack of a suitable environment or missing
  authorization explicitly; do not imply a configured path was exercised.
- **Blocked:** identify the missing prerequisite or failed check and the next
  step required to proceed.

Keep untested and blocked work visible in the final summary. A successful
reconciliation or a doctor report with no error diagnostics is not enough to
claim that every upgrade path was verified.
