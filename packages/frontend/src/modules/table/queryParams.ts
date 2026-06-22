import type { QueryFilter, QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { filterSchema, filtersSchema } from "@m5kdev/commons/modules/schemas/query.schema";
import type { GroupingState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import { z } from "zod";

/** Each row: [columnId, type, method, value, valueTo?, endColumnId?] - validated after parse */
const filtersRawSchema = z.array(z.array(z.string()).min(4).max(6));

/** Escape `\`, `|`, `;` so we can split filters without JSON quotes/brackets. */
function escapeFilterField(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/;/g, "\\;");
}

function unescapeFilterField(encoded: string): string {
  let out = "";
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded[i];
    if (c === "\\" && i + 1 < encoded.length) {
      const next = encoded[i + 1];
      if (next === "\\" || next === "|" || next === ";") {
        out += next;
        i++;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/**
 * Split on `delimiter` only when not escaped as `\` + delimiter.
 */
function splitByEscapedDelimiter(s: string, delimiter: string): string[] {
  if (delimiter.length !== 1) {
    throw new Error("splitByEscapedDelimiter expects a single-character delimiter");
  }
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      buf += c + s[i + 1];
      i++;
      continue;
    }
    if (c === delimiter) {
      parts.push(unescapeFilterField(buf));
      buf = "";
      continue;
    }
    buf += c;
  }
  parts.push(unescapeFilterField(buf));
  return parts;
}

export function serializeFiltersParam(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }
  return rows.map((row) => row.map(escapeFilterField).join("|")).join(";");
}

export function parseFiltersParam(value: string): string[][] | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return [];
  }
  const rowStrings = splitByEscapedDelimiter(trimmed, ";");
  const rows: string[][] = [];
  for (const row of rowStrings) {
    if (row === "") {
      continue;
    }
    const fields = splitByEscapedDelimiter(row, "|");
    if (fields.length >= 4 && fields.length <= 6) {
      rows.push(fields);
    }
  }
  const parsed = filtersRawSchema.safeParse(rows);
  return parsed.success ? parsed.data : null;
}

const NULLISH_METHODS: ReadonlySet<QueryFilter["method"]> = new Set([
  "isEmpty",
  "isNotEmpty",
  "is_null",
  "is_not_null",
]);

function encodeFilterValue(filter: QueryFilter): string {
  if (NULLISH_METHODS.has(filter.method)) {
    return typeof filter.value === "string" ? filter.value : "";
  }
  const { type, method, value } = filter;
  switch (type) {
    case "number":
      return String(value as number);
    case "boolean":
      return (value as boolean) ? "true" : "false";
    case "enum":
    case "jsonArray":
      if (method === "oneOf" && Array.isArray(value)) {
        return JSON.stringify(value);
      }
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      return String(value);
    default:
      return String(value);
  }
}

function decodeFilterValue(
  type: QueryFilter["type"],
  method: QueryFilter["method"],
  valueStr: string
): QueryFilter["value"] {
  if (NULLISH_METHODS.has(method)) {
    return valueStr;
  }
  switch (type) {
    case "number": {
      const n = Number.parseFloat(valueStr);
      return Number.isNaN(n) ? 0 : n;
    }
    case "boolean":
      return valueStr === "true";
    case "enum":
    case "jsonArray":
      if (method === "oneOf") {
        try {
          const parsed = JSON.parse(valueStr) as unknown;
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      }
      if (valueStr.startsWith("[")) {
        try {
          const parsed = JSON.parse(valueStr) as unknown;
          if (Array.isArray(parsed)) {
            return parsed.map(String);
          }
        } catch {
          /* use raw string */
        }
      }
      return valueStr;
    default:
      return valueStr;
  }
}

/** Builds URL tuple; omits optional tails when unused (endColumnId requires valueTo slot - may be ""). */
export function encodeFilterToTuple(filter: QueryFilter): string[] {
  const tuple: string[] = [filter.columnId, filter.type, filter.method, encodeFilterValue(filter)];
  const hasValueTo = filter.valueTo != null && filter.valueTo !== "";
  const hasEndColumnId = filter.endColumnId != null && filter.endColumnId !== "";

  if (hasValueTo && filter.valueTo != null) {
    tuple.push(filter.valueTo);
  }

  if (hasEndColumnId && filter.endColumnId != null) {
    if (!hasValueTo) {
      tuple.push("");
    }
    tuple.push(filter.endColumnId);
  }

  return tuple;
}

export function decodeTupleToFilter(parts: readonly string[]): QueryFilter | null {
  if (parts.length < 4 || parts.length > 6) {
    return null;
  }

  const [columnId, typeStr, methodStr, valueStr, valueToStr, endColumnIdStr] = parts;

  const typeParsed = filterSchema.shape.type.safeParse(typeStr);
  const methodParsed = filterSchema.shape.method.safeParse(methodStr);
  if (!typeParsed.success || !methodParsed.success) {
    return null;
  }

  const type = typeParsed.data;
  const method = methodParsed.data;
  const value = decodeFilterValue(type, method, valueStr);

  const candidate: QueryFilter = {
    columnId,
    type,
    method,
    value,
  };

  if (valueToStr !== undefined) {
    candidate.valueTo = valueToStr;
  }
  if (endColumnIdStr !== undefined) {
    candidate.endColumnId = endColumnIdStr;
  }

  const parsed = filterSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function decodeFilterTuples(rows: readonly string[][]): QueryFilters {
  const decoded = rows
    .map((row) => decodeTupleToFilter(row))
    .filter((filter): filter is QueryFilter => filter != null);
  const parsed = filtersSchema.safeParse(decoded);
  return parsed.success ? parsed.data : [];
}

export type Order = "asc" | "desc";

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

export interface QueryParamsState {
  /** Global search string; absent when not set. */
  q: string | null;
  setQ: (value: string | null) => void;
  filters?: QueryFilters;
  setFilters?: (filters: QueryFilters) => void;
  granularity?: Granularity;
  setGranularity?: (value: Granularity) => void;
  sort?: string;
  order?: Order | null;
  setSorting?: (updater: Updater<SortingState>) => void;
  sorting?: SortingState;
  page?: number;
  limit?: number;
  setPagination?: (updater: Updater<PaginationState>) => void;
  pagination?: PaginationState;
  grouping: GroupingState;
  setGrouping: (updater: Updater<GroupingState>) => void;
}
