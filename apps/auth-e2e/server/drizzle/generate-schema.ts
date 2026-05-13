import fs from "node:fs/promises";
import path from "node:path";

export async function generateSchema(): Promise<void> {
  const outputDirectory = path.resolve(process.cwd(), "src/generated");
  const outputPath = path.join(outputDirectory, "schema.ts");

  const source = [
    'export * from "@m5kdev/backend/modules/auth/auth.db";',
    'export * from "../modules/posts/posts.db";',
    "",
    'import * as authTables from "@m5kdev/backend/modules/auth/auth.db";',
    'import * as postsTables from "../modules/posts/posts.db";',
    "",
    "export const schema = {",
    "  ...authTables,",
    "  ...postsTables,",
    "};",
    "",
    "export type AppDbSchema = typeof schema;",
    "",
  ].join("\n");

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, source, "utf8");
  console.info(`Generated Drizzle schema at ${outputPath}`);
}

void generateSchema();
