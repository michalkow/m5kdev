import type { QueryFilter, QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { filterSchema, filtersSchema } from "@m5kdev/commons/modules/schemas/query.schema";
import type { GroupingState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import {
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";

/** Each row: [columnId, type, method, value, valueTo?, endColumnId?] — validated after parse */
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

function serializeFiltersParam(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }
  return rows.map((row) => row.map(escapeFilterField).join("|")).join(";");
}

function parseFiltersParam(value: string): string[][] | null {
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

const parseAsFilterTuples = createParser<string[][]>({
  parse: (value) => parseFiltersParam(value),
  serialize: (rows) => serializeFiltersParam(rows),
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
}).withDefault([]);

const parseAsGrouping = parseAsArrayOf(parseAsString).withDefault([]);

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

/** Builds URL tuple; omits optional tails when unused (endColumnId requires valueTo slot — may be ""). */
function encodeFilterToTuple(filter: QueryFilter): string[] {
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

function decodeTupleToFilter(parts: readonly string[]): QueryFilter | null {
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

export type Order = "asc" | "desc";

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

export interface NuqsQueryParams {
  /** Global search string from URL (`q`); absent when not in URL. */
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

/**
 * Hook to manage all query parameters via nuqs (URL query parameters)
 * Manages: `f` (filters as tuple arrays), `q`, `s`/`o`, `p`/`l`, `g`, `r`
 * Accepts an optional prefix to namespace params when multiple tables share a view.
 */
export const useNuqsQueryParams = (prefix?: string): NuqsQueryParams => {
  const k = (name: string) => (prefix ? `${prefix}_${name}` : name);

  const [sort, setSort] = useQueryState<string>(k("s"), parseAsString.withDefault(""));
  const [order, setOrder] = useQueryState<Order>(k("o"), parseAsStringLiteral(["asc", "desc"]));
  const [page, setPage] = useQueryState<number>(k("p"), parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState<number>(k("l"), parseAsInteger.withDefault(10));
  const [qRaw, setQRaw] = useQueryState(k("q"), parseAsString);
  const [filtersRaw, setFiltersRaw] = useQueryState<string[][]>(k("f"), parseAsFilterTuples);

  const filters = useMemo((): QueryFilters => {
    const decoded = filtersRaw
      .map((row) => decodeTupleToFilter(row))
      .filter((f): f is QueryFilter => f != null);
    const parsed = filtersSchema.safeParse(decoded);
    return parsed.success ? parsed.data : [];
  }, [filtersRaw]);

  const setFilters = useCallback(
    (next: QueryFilters) => {
      void setFiltersRaw(next.length === 0 ? null : next.map(encodeFilterToTuple));
    },
    [setFiltersRaw]
  );

  const setQ = useCallback(
    (value: string | null) => {
      void setQRaw(value === "" || value == null ? null : value);
    },
    [setQRaw]
  );
  const [granularity, setGranularity] = useQueryState<Granularity>(
    k("r"),
    parseAsStringLiteral(["daily", "weekly", "monthly", "yearly"]).withDefault("daily")
  );
  const [groupingRaw, setGroupingRaw] = useQueryState<string[]>(k("g"), parseAsGrouping);
  const grouping: GroupingState = groupingRaw;

  const setGrouping = useCallback(
    (updater: Updater<GroupingState>) => {
      const next = typeof updater === "function" ? updater(groupingRaw) : updater;
      setGroupingRaw(next.length > 0 ? next : null);
    },
    [groupingRaw, setGroupingRaw]
  );

  const sorting = useMemo(() => {
    if (!sort) {
      return [];
    }
    const effectiveOrder = order ?? "asc";
    return [{ id: sort, desc: effectiveOrder === "desc" }];
  }, [sort, order]);

  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: limit }), [page, limit]);

  const setSorting = useCallback(
    (updater: Updater<SortingState>) => {
      const currentSorting: SortingState = sort
        ? [{ id: sort, desc: (order ?? "asc") === "desc" }]
        : [];

      const next = typeof updater === "function" ? updater(currentSorting) : updater;
      const first = next[0];

      if (!first || !first.id) {
        setSort("");
        setOrder(null);
        return;
      }

      setSort(first.id);
      setOrder(first.desc ? "desc" : "asc");
    },
    [sort, order, setSort, setOrder]
  );

  useEffect(() => {
    if (sort && !order) {
      setOrder("asc");
    }
  }, [sort, order, setOrder]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dependent on page and limit only
  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      const currentState = { pageIndex: page - 1, pageSize: limit };
      const next = typeof updater === "function" ? updater(currentState) : updater;
      setPage((next.pageIndex ?? 0) + 1);
      setLimit(next.pageSize ?? 10);
    },
    [page, limit]
  );

  return useMemo(
    () => ({
      q: qRaw,
      setQ,
      filters,
      setFilters,
      granularity,
      setGranularity,
      sort,
      order,
      setSorting,
      sorting,
      page,
      limit,
      setPagination,
      pagination,
      grouping,
      setGrouping,
    }),
    [
      qRaw,
      setQ,
      filters,
      setFilters,
      granularity,
      setGranularity,
      sort,
      order,
      setSorting,
      sorting,
      page,
      limit,
      setPagination,
      pagination,
      grouping,
      setGrouping,
    ]
  );
};
