import { is, SQL, sql } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import type { Pool } from "pg";

/** Disposable test tables from the actual Drizzle model, not production migration artifacts. */
export async function prepareExperienceTables(client: Pool, schema: Record<string, unknown>) {
  const namespace = process.env.DATABASE_SCHEMA;
  if (!namespace || !/^test_[a-f0-9]+$/.test(namespace))
    throw new Error("Reference requires an owned test schema");
  await client.query(`CREATE SCHEMA "${namespace}"`);
  const dialect = new PgDialect();
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const value = column.default;
      const defaultSql =
        value === undefined
          ? ""
          : ` DEFAULT ${dialect.sqlToQuery(value instanceof SQL ? value : sql`${column.mapToDriverValue(value)}`.inlineParams()).sql}`;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${column.isUnique ? " UNIQUE" : ""}${defaultSql}`;
    });
    await client.query(
      `CREATE TABLE "${namespace}"."${config.name}" (${[...columns, ...config.uniqueConstraints.map((c) => `CONSTRAINT "${c.name}" UNIQUE (${c.columns.map((column) => `"${column.name}"`).join(",")})`)].join(",")})`
    );
  }
}
