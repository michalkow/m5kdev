import { spawnSync } from "node:child_process";

for (const key of ["TEST_DATABASE_URL", "TEST_REDIS_URL"])
  if (!process.env[key])
    throw new Error(
      `${key} must name explicitly owned disposable infrastructure; see apps/experience-reference/README.md`
    );
function run(args, env = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["node", "scripts/check-experience-readers.mjs"]);
if (!process.argv.includes("--built"))
  for (const name of ["commons", "backend", "frontend", "web-ui"])
    run(["pnpm", "--filter", `@m5kdev/${name}`, "build"]);
run([
  "pnpm",
  "--filter",
  "@m5kdev/backend",
  "test",
  "--runInBand",
  "--no-cache",
  "--runTestsByPath",
  "src/test/experience.schema.test.ts",
  "src/app.presentation.test.ts",
  "src/app.environment.test.ts",
  "src/app.experience.http.test.ts",
  "src/modules/auth/tests/auth.presentation.test.ts",
  "src/modules/auth/tests/auth.experience.test.ts",
  "src/modules/auth/tests/auth.recovery-experience.test.ts",
  "src/modules/auth/tests/auth.invitation-experience.test.ts",
  "src/modules/connect/tests/connect.experience.http.test.ts",
  "src/modules/connect/tests/connect.http.test.ts",
  "src/modules/email/tests/email.communication.test.ts",
  "src/modules/email/tests/email.communication.workflow.test.ts",
  "src/modules/email/tests/email.service.test.ts",
  "src/modules/billing/tests/billing.experience.http.test.ts",
  "src/modules/billing/tests/billing.portal.http.test.ts",
  "src/modules/billing/tests/billing.trial-experience.http.test.ts",
  "src/modules/billing/tests/billing.privacy.http.test.ts",
  "src/modules/billing/tests/billing.service.test.ts",
  "src/modules/mcp/tests/mcp.experience-auth.test.ts",
  "src/modules/file/tests/file.module.environment.test.ts",
  "src/modules/file/tests/file.download.test.ts",
  "src/modules/file/tests/file.initiate.test.ts",
]);
for (const name of ["webapp", "expo"])
  run(["pnpm", "--filter", `@starter-app/${name}`, "test", "--runInBand", "--no-cache"]);
run(["pnpm", "--filter", "@m5kdev/experience-reference", "check-types"]);
run(["pnpm", "--filter", "@m5kdev/experience-reference", "build"]);
for (const topology of ["local", "shared"])
  run(["pnpm", "--filter", "@m5kdev/experience-reference", "test"], {
    REFERENCE_TOPOLOGY: topology,
  });
