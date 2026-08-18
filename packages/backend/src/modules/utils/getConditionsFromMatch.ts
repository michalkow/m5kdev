import type {
  QueryMatch,
  QueryMatchFieldValue,
  QueryMatchOperators,
} from "@m5kdev/commons/modules/schemas/queryMatch";
import {
  and,
  between,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import { DateTime } from "luxon";
import { err, ok, type Result } from "neverthrow";
import type { ConditionBuilder } from "../base/base.repository";
import { escapeLikeUserInput } from "./getGlobalSearchCondition";

type ColumnKind = "string" | "number" | "date" | "boolean" | "json";

const SQL_OPS = new Set([
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$exists",
  "$like",
]);

const UI_OPS = new Set([
  "$contains",
  "$starts_with",
  "$ends_with",
  "$greater_than",
  "$less_than",
  "$on",
  "$between",
  "$before",
  "$after",
  "$oneOf",
  "$intersect",
  "$isEmpty",
  "$isNotEmpty",
  "$is_null",
  "$is_not_null",
]);

function neverMatch(): SQL {
  return sql`1 = 0`;
}

function getUTCDateBoundaries(isoString: string): { start: Date; end: Date } {
  const dateTime = DateTime.fromISO(isoString, { zone: "utc" });
  return {
    start: dateTime.startOf("day").toJSDate(),
    end: dateTime.endOf("day").toJSDate(),
  };
}

function jsonArrayLike(column: SQLiteColumn, value: string): SQL {
  const needle = JSON.stringify(value);
  const pattern = `%${escapeLikeUserInput(needle)}%`;
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

function columnKind(column: SQLiteColumn): ColumnKind {
  const type = column.columnType;
  if (type.includes("Timestamp")) return "date";
  if (type.includes("Boolean")) return "boolean";
  if (type.includes("TextJson") || column.dataType === "json") return "json";
  if (type.includes("Integer") || type.includes("Real") || column.dataType === "number") {
    return "number";
  }
  return "string";
}

function asIsoString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === "string") {
    const d = DateTime.fromISO(value, { zone: "utc" });
    return d.isValid ? d.toJSDate() : undefined;
  }
  return undefined;
}

function compareValue(column: SQLiteColumn, value: unknown): unknown {
  if (columnKind(column) === "date") {
    return asDate(value) ?? value;
  }
  return value;
}

function isOperatorMap(value: unknown): value is QueryMatchOperators {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith("$"));
}

function isQueryMatch(value: unknown): value is QueryMatch {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
  );
}

function joinAnd(parts: SQL[]): SQL | undefined {
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

function joinOr(parts: SQL[]): SQL | undefined {
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return or(...parts);
}

function jsonEqualsAnd(column: SQLiteColumn, values: readonly string[]): SQL | undefined {
  const clauses = values.filter((v) => v.length > 0).map((v) => jsonArrayLike(column, v));
  return joinAnd(clauses);
}

function jsonOneOfOr(column: SQLiteColumn, values: readonly string[]): SQL | undefined {
  const clauses = values.filter((v) => v.length > 0).map((v) => jsonArrayLike(column, v));
  return joinOr(clauses);
}

function emptyCondition(column: SQLiteColumn, isEmpty: boolean): SQL | undefined {
  const kind = columnKind(column);
  if (kind === "string") {
    return isEmpty ? or(isNull(column), eq(column, "")) : and(isNotNull(column), ne(column, ""));
  }
  if (kind === "json") {
    return isEmpty
      ? or(isNull(column), eq(column, ""), eq(column, "[]"))
      : and(isNotNull(column), ne(column, ""), ne(column, "[]"));
  }
  if (kind === "number") {
    return isEmpty ? or(isNull(column), eq(column, 0)) : and(isNotNull(column), ne(column, 0));
  }
  return undefined;
}

function applyEq(column: SQLiteColumn, value: unknown): Result<SQL | undefined, string> {
  if (value === null) return ok(isNull(column));
  if (Array.isArray(value)) {
    if (columnKind(column) === "json") {
      const strings = value.filter((v): v is string => typeof v === "string");
      return ok(jsonEqualsAnd(column, strings));
    }
    return err("$eq array is only valid on json columns");
  }
  return ok(eq(column, compareValue(column, value)));
}

function applyOneOf(column: SQLiteColumn, value: unknown): Result<SQL | undefined, string> {
  if (!Array.isArray(value)) {
    return err("$oneOf requires an array");
  }
  if (value.length === 0) return ok(undefined);
  if (columnKind(column) === "json") {
    const strings = value.filter((v): v is string => typeof v === "string");
    return ok(jsonOneOfOr(column, strings));
  }
  return ok(inArray(column, value));
}

function applyOperator(
  column: SQLiteColumn,
  op: string,
  value: unknown,
  table: Record<string, SQLiteColumn>
): Result<SQL | undefined, string> {
  switch (op) {
    case "$eq":
      return applyEq(column, value);
    case "$ne":
      if (value === null) return ok(isNotNull(column));
      return ok(ne(column, compareValue(column, value)));
    case "$gt":
      return ok(gt(column, compareValue(column, value)));
    case "$gte":
      return ok(gte(column, compareValue(column, value)));
    case "$lt":
      return ok(lt(column, compareValue(column, value)));
    case "$lte":
      return ok(lte(column, compareValue(column, value)));
    case "$in":
      if (!Array.isArray(value)) return err("$in requires an array");
      if (value.length === 0) return ok(neverMatch());
      return ok(
        inArray(
          column,
          value.map((item) => compareValue(column, item))
        )
      );
    case "$nin":
      if (!Array.isArray(value)) return err("$nin requires an array");
      if (value.length === 0) return ok(undefined);
      return ok(
        notInArray(
          column,
          value.map((item) => compareValue(column, item))
        )
      );
    case "$exists":
      if (typeof value !== "boolean") return err("$exists requires a boolean");
      return ok(value ? isNotNull(column) : isNull(column));
    case "$like":
      if (typeof value !== "string") return err("$like requires a string");
      return ok(like(column, value));
    case "$contains":
      if (typeof value !== "string") return err("$contains requires a string");
      return ok(like(column, `%${value}%`));
    case "$starts_with":
      if (typeof value !== "string") return err("$starts_with requires a string");
      return ok(like(column, `${value}%`));
    case "$ends_with":
      if (typeof value !== "string") return err("$ends_with requires a string");
      return ok(like(column, `%${value}`));
    case "$greater_than":
      return ok(gte(column, compareValue(column, value)));
    case "$less_than":
      return ok(lte(column, compareValue(column, value)));
    case "$on": {
      const iso = asIsoString(value);
      if (!iso) return err("$on requires a date string");
      const { start, end } = getUTCDateBoundaries(iso);
      return ok(and(gte(column, start), lte(column, end)));
    }
    case "$between": {
      if (!Array.isArray(value) || value.length !== 2) {
        return err("$between requires [from, to]");
      }
      const fromIso = asIsoString(value[0]);
      const toIso = asIsoString(value[1]);
      if (columnKind(column) === "date") {
        if (!fromIso || !toIso) return err("$between requires date strings");
        const { start } = getUTCDateBoundaries(fromIso);
        const { end } = getUTCDateBoundaries(toIso);
        return ok(between(column, start, end));
      }
      return ok(and(gte(column, value[0]), lte(column, value[1])));
    }
    case "$before": {
      const iso = asIsoString(value);
      if (!iso) return err("$before requires a date string");
      const { end } = getUTCDateBoundaries(iso);
      return ok(lte(column, end));
    }
    case "$after": {
      const iso = asIsoString(value);
      if (!iso) return err("$after requires a date string");
      const { start } = getUTCDateBoundaries(iso);
      return ok(gte(column, start));
    }
    case "$oneOf":
      return applyOneOf(column, value);
    case "$intersect": {
      if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !("endColumnId" in value) ||
        !("from" in value) ||
        !("to" in value)
      ) {
        return err("$intersect requires { endColumnId, from, to }");
      }
      const payload = value as { endColumnId: unknown; from: unknown; to: unknown };
      if (
        typeof payload.endColumnId !== "string" ||
        payload.endColumnId.length === 0 ||
        typeof payload.from !== "string" ||
        typeof payload.to !== "string"
      ) {
        return err("$intersect requires { endColumnId, from, to }");
      }
      const endColumn = table[payload.endColumnId];
      if (!endColumn) {
        return err(`Unknown column '${payload.endColumnId}'`);
      }
      const { start } = getUTCDateBoundaries(payload.from);
      const { end } = getUTCDateBoundaries(payload.to);
      return ok(and(lte(column, end), or(isNull(endColumn), gte(endColumn, start))));
    }
    case "$isEmpty":
      if (typeof value !== "boolean") return err("$isEmpty requires a boolean");
      return ok(emptyCondition(column, value));
    case "$isNotEmpty":
      if (typeof value !== "boolean") return err("$isNotEmpty requires a boolean");
      return ok(emptyCondition(column, !value));
    case "$is_null":
      if (typeof value !== "boolean") return err("$is_null requires a boolean");
      return ok(value ? isNull(column) : isNotNull(column));
    case "$is_not_null":
      if (typeof value !== "boolean") return err("$is_not_null requires a boolean");
      return ok(value ? isNotNull(column) : isNull(column));
    default:
      return err(`Unknown operator '${op}'`);
  }
}

function applyOperatorMap(
  column: SQLiteColumn,
  ops: QueryMatchOperators,
  table: Record<string, SQLiteColumn>
): Result<SQL | undefined, string> {
  const parts: SQL[] = [];
  for (const [op, raw] of Object.entries(ops)) {
    if (raw === undefined) continue;
    if (op === "$not") {
      if (!isOperatorMap(raw)) return err("$not on a field requires an operator map");
      const inner = applyOperatorMap(column, raw, table);
      if (inner.isErr()) return inner;
      if (inner.value) parts.push(not(inner.value));
      continue;
    }
    if (!SQL_OPS.has(op) && !UI_OPS.has(op)) {
      return err(`Unknown operator '${op}'`);
    }
    const applied = applyOperator(column, op, raw, table);
    if (applied.isErr()) return applied;
    if (applied.value) parts.push(applied.value);
  }
  return ok(joinAnd(parts));
}

function applyFieldValue(
  column: SQLiteColumn,
  value: QueryMatchFieldValue,
  table: Record<string, SQLiteColumn>
): Result<SQL | undefined, string> {
  if (isOperatorMap(value)) {
    return applyOperatorMap(column, value, table);
  }
  return applyEq(column, value);
}

function applyDocument(
  match: QueryMatch,
  table: Record<string, SQLiteColumn>
): Result<SQL | undefined, string> {
  const parts: SQL[] = [];

  for (const [key, value] of Object.entries(match)) {
    if (value === undefined) continue;

    if (key === "$and") {
      if (!Array.isArray(value) || value.length === 0) {
        return err("$and requires a non-empty array of QueryMatches");
      }
      const inner: SQL[] = [];
      for (const child of value) {
        if (!isQueryMatch(child)) return err("$and entries must be QueryMatches");
        const applied = applyDocument(child, table);
        if (applied.isErr()) return applied;
        if (applied.value) inner.push(applied.value);
      }
      const joined = joinAnd(inner);
      if (joined) parts.push(joined);
      continue;
    }

    if (key === "$or") {
      if (!Array.isArray(value) || value.length === 0) {
        return err("$or requires a non-empty array of QueryMatches");
      }
      const inner: SQL[] = [];
      for (const child of value) {
        if (!isQueryMatch(child)) return err("$or entries must be QueryMatches");
        const applied = applyDocument(child, table);
        if (applied.isErr()) return applied;
        if (applied.value) inner.push(applied.value);
      }
      const joined = joinOr(inner);
      if (joined) parts.push(joined);
      continue;
    }

    if (key === "$not") {
      if (!isQueryMatch(value) || Array.isArray(value)) {
        return err("$not requires a QueryMatch");
      }
      const applied = applyDocument(value, table);
      if (applied.isErr()) return applied;
      if (applied.value) parts.push(not(applied.value));
      continue;
    }

    if (key.startsWith("$")) {
      return err(`Unknown operator '${key}'`);
    }

    const column = table[key];
    if (!column) {
      return err(`Unknown column '${key}'`);
    }
    const applied = applyFieldValue(column, value as QueryMatchFieldValue, table);
    if (applied.isErr()) return applied;
    if (applied.value) parts.push(applied.value);
  }

  return ok(joinAnd(parts));
}

export function getConditionsFromMatch<T extends SQLiteTableWithColumns<any>>(
  conditions: ConditionBuilder,
  match: QueryMatch | undefined,
  table: T
): Result<undefined, string> {
  if (!match || Object.keys(match).length === 0) {
    return ok(undefined);
  }
  const applied = applyDocument(match, table as unknown as Record<string, SQLiteColumn>);
  if (applied.isErr()) return err(applied.error);
  conditions.push(applied.value);
  return ok(undefined);
}
