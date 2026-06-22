import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { GroupingState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import type { Granularity, Order, QueryParamsState } from "../queryParams";

export const useTableQueryParams = (): QueryParamsState => {
  const [sort, setSort] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [qRaw, setQRaw] = useState<string | null>(null);
  const [filters, setFiltersRaw] = useState<QueryFilters>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [grouping, setGroupingRaw] = useState<GroupingState>([]);

  const setFilters = useCallback((next: QueryFilters) => {
    setFiltersRaw(next);
  }, []);

  const setQ = useCallback((value: string | null) => {
    setQRaw(value === "" || value == null ? null : value);
  }, []);

  const setGrouping = useCallback((updater: Updater<GroupingState>) => {
    setGroupingRaw((current) => (typeof updater === "function" ? updater(current) : updater));
  }, []);

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
    [sort, order]
  );

  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      setPage((currentPage) => {
        const currentState = { pageIndex: currentPage - 1, pageSize: limit };
        const next = typeof updater === "function" ? updater(currentState) : updater;
        setLimit(next.pageSize ?? 10);
        return (next.pageIndex ?? 0) + 1;
      });
    },
    [limit]
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
