import { randomUUID } from "node:crypto";
import { createTestPool } from "./postgresql";

process.env.DATABASE_SCHEMA = `test_${randomUUID().replaceAll("-", "")}`;
// Kernel boot requires a Deployment environment; tests run as `local`.
process.env.APP_ENV ??= "local";
process.env.APP_SLUG ??= "m5kdev-test";

afterAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const client = createTestPool();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${process.env.DATABASE_SCHEMA}" CASCADE`);
  } finally {
    await client.end();
  }
});
