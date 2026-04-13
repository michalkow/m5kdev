import fs from "node:fs/promises";
import path from "node:path";
import { collectBackendSchema, generateBackendSchemaSource } from "@m5kdev/backend/app";
import { backendSchemaModules } from "../src/schema-modules";

export async function generateSchema(): Promise<void> {
  const collected = collectBackendSchema(backendSchemaModules, {
    env: process.env,
  });
  const outputDirectory = path.resolve(process.cwd(), "src/generated");
  const outputPath = path.join(outputDirectory, "schema.ts");

  const source = [
    'import { collectBackendSchema } from "@m5kdev/backend/app";',
    'import { backendSchemaModules } from "../schema-modules";',
    "",
    "const collected = collectBackendSchema(backendSchemaModules, {",
    "  env: process.env,",
    "});",
    "",
    generateBackendSchemaSource({
      schema: collected.schema,
      schemaExpression: "collected.schema",
    }),
  ].join("\n");

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, source, "utf8");

  console.info(`Generated Drizzle schema at ${outputPath}`);
}

void generateSchema();
