import { pgSchema, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { createBackendApp } from "./app";
import { createTestPool } from "./test/postgresql";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

describe("Kernel PostgreSQL pool ownership", () => {
  it("rejects startup with missing app tables without creating them", async () => {
    const pool = createTestPool();
    const missing = pgSchema(`unprepared_${process.pid}`).table("items", {
      id: text("id").primaryKey(),
    });
    const built = createBackendApp({ db: { client: pool }, schema: { missing } });
    try {
      await expect(built.start({ listen: false })).rejects.toThrow(/migrations/i);
      const result = await pool.query("SELECT to_regclass($1) AS relation", [
        `unprepared_${process.pid}.items`,
      ]);
      expect(result.rows[0].relation).toBeNull();
    } finally {
      await built.shutdown();
      await pool.end();
    }
  });

  it("leaves an injected pool available to its owner after shutdown", async () => {
    const pool = new Pool({ connectionString: "postgresql://localhost/example" });
    const built = createBackendApp({ db: { client: pool } });

    expect(built.db.client).toBe(pool);
    await built.shutdown();

    await expect(pool.end()).resolves.toBeUndefined();
  });
});
