import { randomUUID } from "node:crypto";
import { createTestPool } from "./postgresql";

process.env.DATABASE_SCHEMA = `test_${randomUUID().replaceAll("-", "")}`;

afterAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const client = createTestPool();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${process.env.DATABASE_SCHEMA}" CASCADE`);
  } finally {
    await client.end();
  }
});
