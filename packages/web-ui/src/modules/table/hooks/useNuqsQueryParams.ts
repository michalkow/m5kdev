import {
  decodeFilterTuples,
  encodeFilterToTuple,
  type Granularity,
  parseFiltersParam,
  type QueryParamsState,
  serializeFiltersParam,
} from "@m5kdev/frontend/modules/table/queryParams";
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

const parseAsFilterTuples = createParser<string[][]>({
  parse: (value) => parseFiltersParam(value),
  serialize: (rows) => serializeFiltersParam(rows),
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
}).withDefault([]);

const parseAsGrouping = parseAsArrayOf(parseAsString).withDefault([]);

/**
 * Hook to manage all query parameters via nuqs (URL query parameters)
 * Manages: `f` (filters as tuple arrays), `q`, `s`/`o`, `p`/`l`, `g`, `r`
 * Accepts an optional prefix to namespace params when multiple tables share a view.
 */
export const useNuqsQueryParams = (prefix?: string): QueryParamsState => {
  const k = (name: string) => (prefix ? `${prefix}_${name}` : name);

  const [sort, setSort] = useQueryState<string>(k("s"), parseAsString.withDefault(""));
  const [order, setOrder] = useQueryState<"asc" | "desc">(
    k("o"),
    parseAsStringLiteral(["asc", "desc"])
  );
  const [page, setPage] = useQueryState<number>(k("p"), parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState<number>(k("l"), parseAsInteger.withDefault(10));
  const [qRaw, setQRaw] = useQueryState(k("q"), parseAsString);
  const [filtersRaw, setFiltersRaw] = useQueryState<string[][]>(k("f"), parseAsFilterTuples);

  const filters = useMemo(() => decodeFilterTuples(filtersRaw), [filtersRaw]);

  const setFilters = useCallback(
    (next: NonNullable<QueryParamsState["filters"]>) => {
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

  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      const currentState = { pageIndex: page - 1, pageSize: limit };
      const next = typeof updater === "function" ? updater(currentState) : updater;
      setPage((next.pageIndex ?? 0) + 1);
      setLimit(next.pageSize ?? 10);
    },
    [page, limit, setPage, setLimit]
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
