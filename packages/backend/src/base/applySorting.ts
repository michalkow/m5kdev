import { asc, desc } from "drizzle-orm";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

/**
 * Applies sorting to a drizzle query builder.
 * Returns the query builder with sorting applied.
 * If no sort or order is specified, defaults to createdAt descending.
 * If createdAt column doesn't exist, returns the query unchanged.
 */

export const applySorting = <TQuery, TTable extends SQLiteTableWithColumns<any>>(
  query: TQuery,
  table: TTable,
  sort?: string,
  order?: "asc" | "desc"
): TQuery => {
  const column = sort ? table[sort] : table.createdAt || table.id;
  if (!column) throw new Error(`Column ${sort} not found in table ${table.name}`);
  (query as any).orderBy(order === "asc" ? asc(column) : desc(column));
  return query;
};
