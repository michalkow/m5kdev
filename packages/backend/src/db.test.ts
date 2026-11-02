import { drizzle } from "drizzle-orm/node-postgres";
import { pgSchema, text } from "drizzle-orm/pg-core";
import { runDb } from "./db";
import { createTestPool } from "./test/postgresql";

const namespace = `operations_${process.pid}`;
const auxiliaryNamespace = `auxiliary_${process.pid}`;
const items = pgSchema(namespace).table("items", { id: text("id").primaryKey() });
const otherItems = pgSchema(auxiliaryNamespace).table("items", { id: text("id").primaryKey() });
const schema = { items };

async function command(name: string, config: Parameters<typeof runDb>[0]): Promise<void> {
  const previous = process.argv;
  process.argv = ["node", "db.ts", name];
  try {
    await runDb(config);
  } finally {
    process.argv = previous;
  }
}

describe("PostgreSQL Database commands", () => {
  const pool = createTestPool();
  const orm = drizzle(pool);
  const environment = process.env;

  beforeAll(async () => {
    await pool.query(
      `CREATE SCHEMA "${namespace}"; CREATE TABLE "${namespace}".items (id text PRIMARY KEY)`
    );
    await pool.query(
      `CREATE SCHEMA "${auxiliaryNamespace}"; CREATE TABLE "${auxiliaryNamespace}".items (id text PRIMARY KEY)`
    );
  });

  beforeEach(async () => {
    process.env = { ...environment };
    delete process.env.DATABASE_DIRECT_URL;
    delete process.env.DATABASE_DISPOSABLE;
    await pool.query(`TRUNCATE "${namespace}".items, "${auxiliaryNamespace}".items`);
  });

  afterEach(() => {
    process.env = environment;
  });

  afterAll(async () => {
    await pool.query(
      `DROP SCHEMA "${namespace}" CASCADE; DROP SCHEMA "${auxiliaryNamespace}" CASCADE`
    );
    await pool.end();
  });

  it("rejects removed replica sync commands", async () => {
    await expect(command("sync", { schema })).rejects.toThrow(/unknown database command/i);
  });

  it("never falls back to the runtime URL for commands", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await expect(command("seed", { schema, seed: async () => {} })).rejects.toThrow(
      "DATABASE_DIRECT_URL"
    );
  });

  it("seeds through the direct connection without opening the runtime URL", async () => {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:1/not-runtime";
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    await command("seed", {
      schema,
      seed: async ({ orm: seedOrm }) => {
        await seedOrm.insert(items).values({ id: "seeded" });
      },
    });
    expect(await orm.select().from(items)).toEqual([{ id: "seeded" }]);
  });

  it("requires an explicit disposable declaration before reset", async () => {
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    await orm.insert(items).values({ id: "seeded" });
    await expect(command("reset", { schema, databaseSchema: namespace })).rejects.toThrow(
      /disposable/i
    );
    expect(await orm.select().from(items)).toEqual([{ id: "seeded" }]);
  });

  it("resets only app data and leaves other schemas and table structures intact", async () => {
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    process.env.DATABASE_DISPOSABLE = "true";
    await orm.insert(items).values({ id: "removed" });
    await orm.insert(otherItems).values({ id: "preserved" });
    await command("reset", { schema, databaseSchema: namespace });
    expect(await orm.select().from(items)).toEqual([]);
    expect(await orm.select().from(otherItems)).toEqual([{ id: "preserved" }]);
  });

  it("rejects protected schemas even in disposable environments", async () => {
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    process.env.DATABASE_DISPOSABLE = "true";
    for (const databaseSchema of ["public", "mastra", "vectors", "pg_catalog"]) {
      await expect(command("reset", { schema, databaseSchema })).rejects.toThrow(/schema/i);
    }
  });

  it("reports the maintainer baseline checkpoint before attempting migration", async () => {
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    await expect(
      command("migrate", { schema, migrationsFolder: "./missing-postgresql-history" })
    ).rejects.toThrow(/maintainer.*drizzle:generate/i);
  });

  it("refuses to cascade a reset through cross-schema foreign keys", async () => {
    process.env.DATABASE_DIRECT_URL = process.env.TEST_DATABASE_DIRECT_URL;
    process.env.DATABASE_DISPOSABLE = "true";
    await orm.insert(items).values({ id: "referenced" });
    await pool.query(
      `CREATE TABLE "${auxiliaryNamespace}".references_app (id text REFERENCES "${namespace}".items(id))`
    );
    try {
      await pool.query(`INSERT INTO "${auxiliaryNamespace}".references_app VALUES ('referenced')`);
      await expect(command("reset", { schema, databaseSchema: namespace })).rejects.toThrow(
        /foreign key/i
      );
      expect(await orm.select().from(items)).toEqual([{ id: "referenced" }]);
      expect(
        (await pool.query(`SELECT id FROM "${auxiliaryNamespace}".references_app`)).rows
      ).toEqual([{ id: "referenced" }]);
    } finally {
      await pool.query(`DROP TABLE "${auxiliaryNamespace}".references_app`);
    }
  });
});
