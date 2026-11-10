import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pgSchema, text } from "drizzle-orm/pg-core";
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

const widgets = pgSchema(namespace).table("widgets", { id: text("id").primaryKey() });
const widgetHistory = [
  `CREATE SCHEMA "${namespace}";\n--> statement-breakpoint\nCREATE TABLE "${namespace}"."widgets" ("id" text PRIMARY KEY);`,
];

async function migrate(config: Parameters<typeof runDb>[0], name = "migrate"): Promise<void> {
  const previous = process.argv;
  process.argv = ["node", "db.ts", name];
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

  it("logs the Deployment environment, target database and pending migrations without credentials", async () => {
    folder = await writeHistory([`CREATE SCHEMA "${namespace}";`]);
    const direct = new URL(environment.TEST_DATABASE_DIRECT_URL ?? "");
    direct.password = "never-logged-secret";
    process.env.DATABASE_DIRECT_URL = direct.toString();
    process.env.APP_ENV = "staging";
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
    expect(output).toContain("APP_ENV=staging");
    expect(output).not.toContain("never-logged-secret");
    expect(output).not.toContain(direct.username + ":");
  });

  it("omits the Deployment environment from the log when APP_ENV is unset", async () => {
    folder = await writeHistory([`CREATE SCHEMA "${namespace}";`]);
    delete process.env.APP_ENV;
    const lines: string[] = [];

    await migrate({
      schema: {},
      migrationsFolder: folder,
      migrationsSchema,
      log: (line) => lines.push(line),
    });

    expect(lines.join("\n")).not.toContain("APP_ENV");
  });

  describe("rebuild", () => {
    const rebuild = (config: Parameters<typeof runDb>[0]) => migrate(config, "rebuild");
    const columns = async () =>
      (
        await pool.query<{ column_name: string }>(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'widgets' ORDER BY column_name",
          [namespace]
        )
      ).rows.map((row) => row.column_name);

    it("restores the schema the migration history describes after out-of-band drift", async () => {
      process.env.DATABASE_DISPOSABLE = "true";
      folder = await writeHistory(widgetHistory);
      const config = {
        schema: { widgets },
        databaseSchema: namespace,
        migrationsFolder: folder,
        migrationsSchema,
        log: () => {},
      };
      await migrate(config);
      await pool.query(`ALTER TABLE "${namespace}"."widgets" ADD COLUMN "stray" text`);

      await rebuild(config);

      expect(await columns()).toEqual(["id"]);
    });

    it("rebuilds a database whose app schema does not exist yet", async () => {
      process.env.DATABASE_DISPOSABLE = "true";
      folder = await writeHistory(widgetHistory);

      await rebuild({
        schema: { widgets },
        databaseSchema: namespace,
        migrationsFolder: folder,
        migrationsSchema,
        log: () => {},
      });

      expect(await columns()).toEqual(["id"]);
    });

    it("refuses a database that is not marked disposable", async () => {
      delete process.env.DATABASE_DISPOSABLE;
      folder = await writeHistory(widgetHistory);
      await expect(
        rebuild({
          schema: { widgets },
          databaseSchema: namespace,
          migrationsFolder: folder,
          migrationsSchema,
          log: () => {},
        })
      ).rejects.toThrow(/DATABASE_DISPOSABLE=true/);
    });

    it("keeps other schemas' data and refuses to cascade through their foreign keys", async () => {
      process.env.DATABASE_DISPOSABLE = "true";
      folder = await writeHistory(widgetHistory);
      const config = {
        schema: { widgets },
        databaseSchema: namespace,
        migrationsFolder: folder,
        migrationsSchema,
        log: () => {},
      };
      const other = `other_${process.pid}`;
      await migrate(config);
      await pool.query(
        `CREATE SCHEMA "${other}"; CREATE TABLE "${other}".notes (id text PRIMARY KEY); INSERT INTO "${other}".notes VALUES ('kept')`
      );
      try {
        await rebuild(config);
        expect((await pool.query(`SELECT id FROM "${other}".notes`)).rows).toEqual([
          { id: "kept" },
        ]);

        await pool.query(`INSERT INTO "${namespace}".widgets VALUES ('w1')`);
        await pool.query(
          `CREATE TABLE "${other}".links (widget_id text REFERENCES "${namespace}".widgets(id))`
        );
        await expect(rebuild(config)).rejects.toThrow(/foreign key/i);
        expect((await pool.query(`SELECT id FROM "${namespace}".widgets`)).rows).toEqual([
          { id: "w1" },
        ]);
      } finally {
        await pool.query(`DROP SCHEMA "${other}" CASCADE`);
      }
    });
  });
});
