import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const roots = [
  "packages/backend/src",
  "packages/frontend/src",
  "packages/web-ui/src",
  "apps/starter/server/src",
  "apps/starter/webapp/src",
  "apps/starter/expo/src",
  "apps/starter/landing/src",
];
const keys = new Set([
  "VITE_APP_URL",
  "VITE_SERVER_URL",
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_SERVER_URL",
  "APP_NAME",
]);
const allowed = {
  "packages/backend/src/presentation.ts": {
    keys: ["VITE_APP_URL", "VITE_SERVER_URL"],
    why: "One presentation normalization boundary",
  },
  "apps/starter/server/src/app.ts": {
    keys: ["VITE_APP_URL", "VITE_SERVER_URL", "APP_NAME"],
    why: "Explicit server composition authoring",
  },
  "apps/starter/webapp/src/Providers.tsx": {
    keys: ["VITE_SERVER_URL"],
    why: "Bootstrap transport address only",
  },
  "apps/starter/expo/src/config.ts": {
    keys: ["EXPO_PUBLIC_APP_URL", "EXPO_PUBLIC_SERVER_URL", "APP_NAME"],
    why: "Explicit standalone native/bootstrap authoring",
  },
  "apps/starter/landing/src/LandingPage.tsx": {
    keys: ["VITE_SERVER_URL"],
    why: "Separate static landing/docs composition",
  },
};
const organizationQueries = new Set([
  "listOrganizationMembers",
  "listChildOrganizations",
  "getOrganizationPreferences",
  "getOrganizationFlags",
  "getOrganizationOnboarding",
  "getOrganizationMetadata",
  "getMemberPreferences",
  "getMemberMetadata",
  "getMemberFlags",
  "getMemberOnboarding",
]);
const found = [];
const failures = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["tests", "test", "__tests__", "node_modules", "dist"].includes(entry.name)) scan(full);
    } else if (/\.tsx?$/.test(entry.name) && !/(\.test\.|\.spec\.|\.d\.ts$)/.test(entry.name)) {
      const relative = path.relative(root, full);
      const source = ts.createSourceFile(
        full,
        fs.readFileSync(full, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const record = (node, key) => {
        const permitted = allowed[relative];
        const item = {
          file: relative,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          key,
          ...(permitted?.keys.includes(key) ? { why: permitted.why } : {}),
        };
        found.push(item);
        if (!item.why) failures.push(item);
      };
      function visit(node) {
        if (
          ts.isPropertyAccessExpression(node) &&
          keys.has(node.name.text) &&
          node.expression.getText(source).endsWith("env")
        )
          record(node, node.name.text);
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "requireEnvValue" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          keys.has(node.arguments[0].text)
        )
          record(node, node.arguments[0].text);
        if (
          ts.isIdentifier(node) &&
          node.text === "APP_NAME" &&
          !ts.isImportSpecifier(node.parent) &&
          !(ts.isVariableDeclaration(node.parent) && node.parent.name === node) &&
          !ts.isExportSpecifier(node.parent)
        )
          record(node, "APP_NAME");
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "queryOptions" &&
          ts.isPropertyAccessExpression(node.expression.expression) &&
          organizationQueries.has(node.expression.expression.name.text) &&
          (!node.arguments[0] || node.arguments[0].getText(source) === "undefined")
        )
          failures.push({
            file: relative,
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            key: "unscoped " + node.expression.expression.name.text,
          });
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
for (const directory of roots) scan(path.join(root, directory));
if (failures.length) {
  process.stderr.write(JSON.stringify({ unclassifiedReaders: failures }, null, 2) + "\n");
  process.exitCode = 1;
} else
  process.stdout.write(
    JSON.stringify({ checkedRoots: roots, approvedReaders: found }, null, 2) + "\n"
  );
