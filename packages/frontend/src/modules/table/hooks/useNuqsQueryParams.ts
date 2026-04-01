import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { filtersSchema } from "@m5kdev/commons/modules/schemas/query.schema";
import type { GroupingState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { useCallback, useEffect, useMemo } from "react";

const parseAsFilters = parseAsJson<QueryFilters>((value) => filtersSchema.parse(value)).withDefault(
  []
);

const parseAsGrouping = parseAsArrayOf(parseAsString).withDefault([]);

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
 * Manages: filters, q, sort, order, page, limit, groupBy, granularity
 * Accepts an optional prefix to namespace params when multiple tables share a view.
 */
export const useNuqsQueryParams = (prefix?: string): NuqsQueryParams => {
  const k = (name: string) => (prefix ? `${prefix}_${name}` : name);

  const [sort, setSort] = useQueryState<string>(k("sort"), parseAsString.withDefault(""));
  const [order, setOrder] = useQueryState<Order>(k("order"), parseAsStringLiteral(["asc", "desc"]));
  const [page, setPage] = useQueryState<number>(k("page"), parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState<number>(k("limit"), parseAsInteger.withDefault(10));
  const [qRaw, setQRaw] = useQueryState(k("q"), parseAsString);
  const [filters, setFilters] = useQueryState<QueryFilters>(k("filters"), parseAsFilters);

  const setQ = useCallback(
    (value: string | null) => {
      void setQRaw(value === "" || value == null ? null : value);
    },
    [setQRaw]
  );
  const [granularity, setGranularity] = useQueryState<Granularity>(
    k("granularity"),
    parseAsStringLiteral(["daily", "weekly", "monthly", "yearly"]).withDefault("daily")
  );
  const [groupingRaw, setGroupingRaw] = useQueryState<string[]>(k("groupBy"), parseAsGrouping);
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
      // Build current sorting state from current values
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

  // Sync order to "asc" if sort is set but order is null (handles URL state inconsistencies)
  useEffect(() => {
    if (sort && !order) {
      setOrder("asc");
    }
  }, [sort, order, setOrder]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dependent on page and limit only
  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      // TanStack Table uses 0-based indexing, but URL uses 1-based
      const currentState = { pageIndex: page - 1, pageSize: limit };
      const next = typeof updater === "function" ? updater(currentState) : updater;
      // Convert back to 1-based for URL
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
