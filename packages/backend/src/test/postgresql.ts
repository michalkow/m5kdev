import { Pool } from "pg";

export function createTestPool(): Pool {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
  }
  return new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
}

export async function prepareTestSchema(client: Pool): Promise<string> {
  const name = process.env.DATABASE_SCHEMA;
  if (!name || !/^test_[a-f0-9]+$/.test(name)) {
    throw new Error("Integration fixtures require an isolated test schema");
  }
  await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE; CREATE SCHEMA "${name}"`);
  return name;
}
