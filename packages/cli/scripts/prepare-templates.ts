/**
 * Builds the publishable templates from the real starter app.
 *
 * apps/starter is a compiling, running, e2e-tested workspace app. This script
 * tokenizes it back into the CLI's template format at build time, so the
 * template can never drift from working code:
 *   - concrete strings -> {{PACKAGE_SCOPE}} / {{APP_NAME}} / {{APP_SLUG}}
 *   - "@m5kdev/x": "workspace:*" -> "catalog:" (generated repos pin published versions)
 *   - text files gain a .tpl suffix; binaries are copied verbatim
 *   - committed root templates (repo-root files, .cursor rules, .env templates)
 *     are layered in from root-templates/
 *   - a manifest describes optional features (test harness, platforms) that
 *     `create` includes or strips based on prompts
 */
import fs from "node:fs";
import path from "node:path";
import {
  assertCatalogKeys,
  buildConsumerCatalog,
  readCatalog,
  renderConsumerWorkspace,
} from "../src/catalog";

const CLI_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CLI_ROOT, "../..");
const STARTER_DIR = path.join(REPO_ROOT, "apps/starter");
const ROOT_TEMPLATES_DIR = path.join(CLI_ROOT, "root-templates");
const OUT_DIR = path.join(CLI_ROOT, "templates/minimal-app");

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".svg",
  ".yaml",
  ".yml",
  ".txt",
]);
const TEXT_BASENAMES = new Set([".gitignore", ".env", ".env.example", ".npmrc"]);

/** Paths (relative to the starter root) never emitted into templates. */
const EXCLUDED = [
  "node_modules",
  "dist",
  ".turbo",
  ".expo",
  ".e2e",
  ".emails",
  "test-results",
  "playwright-report",
  "local.db",
  "tsconfig.tsbuildinfo",
  // real env files — the CLI renders .env from root-templates with a fresh secret
  "shared/.env",
  "shared/.env.example",
];

/** Optional features `create` prompts for. Paths are relative to the generated repo root. */
const FEATURE_MANIFEST = {
  schemaVersion: 1,
  features: {
    "test-harness": {
      paths: [
        "apps/e2e/",
        "apps/server/src/modules/test-harness/",
        "apps/server/drizzle/seed.e2e.ts",
      ],
    },
    webapp: {
      paths: ["apps/webapp/"],
    },
    expo: {
      paths: ["apps/expo/"],
    },
  },
  requiredPaths: [
    "package.json",
    "pnpm-workspace.yaml",
    "apps/shared/package.json",
    "apps/server/package.json",
    "apps/email/package.json",
  ],
  sync: {
    defaultPolicy: "merge",
    rules: [
      { pattern: ".env", policy: "ignore" },
      { pattern: "**/.env", policy: "ignore" },
      { pattern: "**/drizzle/*.sql", policy: "ignore" },
      { pattern: "**/drizzle/meta/**", policy: "ignore" },
    ],
    renames: [],
  },
} as const;

function isExcluded(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  return EXCLUDED.some((ex) => {
    if (ex.includes("/")) return relPath === ex || relPath.startsWith(`${ex}`);
    return parts.some((p) => p === ex || (ex === "local.db" && p.startsWith("local.db")));
  });
}

function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (TEXT_BASENAMES.has(base)) return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function tokenize(content: string): string {
  return content
    .replaceAll("@starter-app", "{{PACKAGE_SCOPE}}")
    .replaceAll("M5 Starter", "{{APP_NAME}}")
    .replaceAll("starter-app", "{{APP_SLUG}}")
    .replace(/"(@m5kdev\/[a-z-]+)": "workspace:\*"/g, '"$1": "catalog:"');
}

function tokenizePath(relPath: string): string {
  return relPath
    .replaceAll("@starter-app", "{{PACKAGE_SCOPE}}")
    .replaceAll("starter-app", "{{APP_SLUG}}");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function copyTree(src: string, dest: string): void {
  for (const file of walk(src)) {
    const rel = path.relative(src, file);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
  }
}

function main(): void {
  if (!fs.existsSync(STARTER_DIR)) {
    throw new Error(
      `Starter app not found at ${STARTER_DIR} — templates can only be built inside the m5kdev repo.`
    );
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. committed root templates (repo root files, .cursor, .env templates)
  copyTree(ROOT_TEMPLATES_DIR, OUT_DIR);

  // 2. tokenized starter app -> apps/**
  let emitted = 0;
  for (const file of walk(STARTER_DIR)) {
    const rel = path.relative(STARTER_DIR, file);
    if (isExcluded(rel)) continue;

    // starter/.gitignore covers app-relative runtime artifacts
    const destRel =
      rel === ".gitignore" ? path.join("apps", ".gitignore") : path.join("apps", tokenizePath(rel));

    if (isTextFile(file)) {
      const content = tokenize(fs.readFileSync(file, "utf8"));
      const target = path.join(OUT_DIR, `${destRel}.tpl`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    } else {
      const target = path.join(OUT_DIR, destRel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    }
    emitted++;
  }

  // 3. feature manifest for `create`
  fs.writeFileSync(
    path.join(OUT_DIR, "template.manifest.json"),
    `${JSON.stringify(FEATURE_MANIFEST, null, 2)}\n`,
    "utf8"
  );

  // 4. derive the generated-app catalog from actual starter usage and the
  // monorepo's tested versions. Root templates intentionally do not pin it.
  const consumerCatalog = buildConsumerCatalog({
    repoRoot: REPO_ROOT,
    starterDirectory: STARTER_DIR,
    rootTemplatesDirectory: ROOT_TEMPLATES_DIR,
  });
  const workspaceTemplatePath = path.join(OUT_DIR, "pnpm-workspace.yaml.tpl");
  const workspaceTemplate = fs.readFileSync(workspaceTemplatePath, "utf8");
  assertCatalogKeys(readCatalog(workspaceTemplate), [], "root template catalog placeholder");
  const renderedWorkspace = renderConsumerWorkspace(workspaceTemplate, consumerCatalog);
  assertCatalogKeys(
    readCatalog(renderedWorkspace),
    Object.keys(consumerCatalog),
    "generated consumer catalog"
  );
  fs.writeFileSync(workspaceTemplatePath, renderedWorkspace, "utf8");

  console.info(
    `Prepared templates: ${emitted} starter files, ${Object.keys(consumerCatalog).length} catalog entries -> ${OUT_DIR}`
  );
}

main();
