import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDb } from "./db";
import { createTestPool } from "./test/postgresql";

const namespace = `migrate_${process.pid}`;
const migrationsSchema = `migrations_${process.pid}`;

async function writeHistory(statements: string[]): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "m5kdev-migrate-"));
  await mkdir(path.join(folder, "meta"));
  const entries = statements.map((_sql, idx) => ({
    idx,
    version: "7",
    when: 1_700_000_000_000 + idx,
    tag: `000${idx}_fixture`,
    breakpoints: true,
  }));
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries })
  );
  await Promise.all(
    statements.map((sql, idx) => writeFile(path.join(folder, `000${idx}_fixture.sql`), sql))
  );
  return folder;
}

async function migrate(config: Parameters<typeof runDb>[0]): Promise<void> {
  const previous = process.argv;
  process.argv = ["node", "db.ts", "migrate"];
  try {
    await runDb(config);
  } finally {
    process.argv = previous;
  }
}

describe("migrate Database command", () => {
  const pool = createTestPool();
  const environment = process.env;
  let folder = "";

  beforeEach(async () => {
    process.env = { ...environment, DATABASE_DIRECT_URL: environment.TEST_DATABASE_DIRECT_URL };
    await pool.query(
      `DROP SCHEMA IF EXISTS "${namespace}" CASCADE; DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`
    );
  });

  afterEach(async () => {
    process.env = environment;
    if (folder) await rm(folder, { recursive: true, force: true });
  });

  afterAll(async () => {
    await pool.query(
      `DROP SCHEMA IF EXISTS "${namespace}" CASCADE; DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`
    );
    await pool.end();
  });

  it("applies a migration once when two runners start together", async () => {
    folder = await writeHistory([
      `CREATE SCHEMA "${namespace}";\n--> statement-breakpoint\nCREATE TABLE "${namespace}"."widgets" ("id" text PRIMARY KEY);`,
    ]);
    const config = { schema: {}, migrationsFolder: folder, migrationsSchema, log: () => {} };

    await expect(Promise.all([migrate(config), migrate(config)])).resolves.toBeDefined();

    const applied = await pool.query(
      `SELECT count(*)::int AS count FROM "${migrationsSchema}"."__drizzle_migrations"`
    );
    expect(applied.rows[0].count).toBe(1);
  });

  it("gives up on a migration blocked by a held table lock after the lock timeout", async () => {
    await pool.query(
      `CREATE SCHEMA "${namespace}"; CREATE TABLE "${namespace}"."widgets" ("id" text PRIMARY KEY)`
    );
    folder = await writeHistory([`ALTER TABLE "${namespace}"."widgets" ADD COLUMN "label" text;`]);
    const holder = await pool.connect();
    try {
      await holder.query(`BEGIN; LOCK TABLE "${namespace}"."widgets" IN ACCESS EXCLUSIVE MODE`);
      await expect(
        migrate({
          schema: {},
          migrationsFolder: folder,
          migrationsSchema,
          lockTimeout: "200ms",
          log: () => {},
        })
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/lock timeout/i) }),
      });
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  }, 10_000);

  it("logs the target database and pending migrations without credentials", async () => {
    folder = await writeHistory([`CREATE SCHEMA "${namespace}";`]);
    const direct = new URL(environment.TEST_DATABASE_DIRECT_URL ?? "");
    direct.password = "never-logged-secret";
    process.env.DATABASE_DIRECT_URL = direct.toString();
    const lines: string[] = [];

    await migrate({
      schema: {},
      migrationsFolder: folder,
      migrationsSchema,
      log: (line) => lines.push(line),
    });

    const output = lines.join("\n");
    expect(output).toContain(`${direct.hostname}:${direct.port}${direct.pathname}`);
    expect(output).toContain("0000_fixture");
    expect(output).not.toContain("never-logged-secret");
    expect(output).not.toContain(direct.username + ":");
  });
});
