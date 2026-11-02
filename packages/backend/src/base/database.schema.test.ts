import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createTestPool, prepareTestSchema } from "../test/postgresql";
import { appDatabaseSchema, jsonbValue } from "./database.schema";

const nativeValues = appDatabaseSchema.table("native_values", {
  id: text("id").primaryKey(),
  payload: jsonbValue("payload"),
  labels: text("labels").array().notNull(),
  enabled: boolean("enabled").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
});

describe("PostgreSQL native field roundtrips", () => {
  const pool = createTestPool();
  const orm = drizzle(pool);
  const instant = new Date("2026-11-02T17:23:45.123+05:30");

  beforeAll(async () => {
    const namespace = await prepareTestSchema(pool);
    await pool.query(`CREATE TABLE "${namespace}".native_values (
      id text PRIMARY KEY, payload jsonb, labels text[] NOT NULL,
      enabled boolean NOT NULL, occurred_at timestamptz NOT NULL
    )`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it.each([
    { id: "document", payload: { nested: { quoted: '"\\%_', list: [true, null, 4] } } },
    { id: "array", payload: ['quoted"', "back\\slash", [], null] },
    { id: "empty", payload: [] },
    { id: "string", payload: '{"not":"an object"}' },
    { id: "true-string", payload: "true" },
    { id: "null-string", payload: "null" },
    { id: "number-string", payload: "42" },
    { id: "boolean", payload: false },
    { id: "number", payload: 42 },
    { id: "null", payload: null },
  ])("preserves $id without string reparsing or timezone shifts", async ({ id, payload }) => {
    const labels = id === "empty" ? [] : ['quoted"\\%_', "null"];
    await orm
      .insert(nativeValues)
      .values({ id, payload, labels, enabled: false, occurredAt: instant });
    const [row] = await orm.select().from(nativeValues).where(eq(nativeValues.id, id));
    expect(row).toEqual({ id, payload, labels, enabled: false, occurredAt: instant });
  });

  it("uses exact native array element semantics for quoted and wildcard characters", async () => {
    await orm.insert(nativeValues).values([
      { id: "membership-exact", labels: ['quoted"\\%_'], enabled: true, occurredAt: instant },
      {
        id: "membership-prefix",
        labels: ['quoted"\\%_suffix'],
        enabled: true,
        occurredAt: instant,
      },
      { id: "membership-empty", labels: [], enabled: true, occurredAt: instant },
    ]);
    const rows = await orm
      .select()
      .from(nativeValues)
      .where(
        and(
          inArray(nativeValues.id, ["membership-exact", "membership-prefix", "membership-empty"]),
          arrayContains(nativeValues.labels, ['quoted"\\%_'])
        )
      );
    expect(rows.map((row) => row.id)).toEqual(["membership-exact"]);
  });
});
