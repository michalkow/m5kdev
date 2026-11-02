import { ilike, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

interface SqlConditionSink {
  push(condition?: SQL): void;
}

/** Escape `%`, `_`, and `\` for use in SQL `LIKE … ESCAPE '\\'`. */
export function escapeLikeUserInput(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Builds `(col1 LIKE %q% ESCAPE '\') OR …` across the given text columns.
 * Returns undefined when `q` is empty or there are no columns.
 */
export function getGlobalSearchCondition(
  q: string | undefined,
  columns: readonly PgColumn[]
): SQL | undefined {
  const trimmed = q?.trim();
  if (!trimmed || columns.length === 0) {
    return undefined;
  }

  const pattern = `%${escapeLikeUserInput(trimmed)}%`;
  const clauses = columns.map((column) => ilike(column, pattern));

  if (clauses.length === 1) {
    return clauses[0];
  }

  return or(...clauses);
}

export function pushGlobalSearch(
  builder: SqlConditionSink,
  q: string | undefined,
  columns: readonly PgColumn[]
): void {
  const cond = getGlobalSearchCondition(q, columns);
  if (cond) {
    builder.push(cond);
  }
}
