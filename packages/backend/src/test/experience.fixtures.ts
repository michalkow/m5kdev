import { is, SQL, sql } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { prepareTestSchema } from "./postgresql";

export const experienceConfig = {
  defaultExperience: "radar",
  brands: {
    radar: { name: "Gastro Raider" },
    horeka: { name: "Horeka AI" },
    partner: { name: "Partner Radar" },
  },
  definitions: {
    radar: {
      product: "radar",
      brand: "radar",
      webOrigin: "https://radar.example.test",
      apiOrigin: "https://radar.example.test",
    },
    horeka: {
      product: "horeka",
      brand: "horeka",
      webOrigin: "https://horeka.example.test",
      apiOrigin: "https://horeka.example.test",
    },
    partner: {
      product: "radar",
      brand: "partner",
      webOrigin: "https://partner.example.test",
      apiOrigin: "https://partner.example.test",
    },
  },
};

/** Disposable test tables from the actual Drizzle model, not production migration artifacts. */
export async function prepareExperienceTables(client: Pool, schema: Record<string, unknown>) {
  const namespace = await prepareTestSchema(client);
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
    await client.query(`CREATE TABLE "${namespace}"."${config.name}" (${columns.join(",")})`);
  }
}
