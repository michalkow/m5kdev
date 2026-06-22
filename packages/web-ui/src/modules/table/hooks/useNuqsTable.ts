import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
import type { QueryParamsState } from "@m5kdev/frontend/modules/table/queryParams";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { useNuqsQueryParams } from "./useNuqsQueryParams";

export interface TableParams extends QueryParamsState {
  rowSelection: RowSelectionState;
  setRowSelection: (updater: Updater<RowSelectionState>) => void;
}

/**
 * Alias for TableParams - used by TablePagination and other table components
 */
export type TableProps = TableParams;

export interface NuqsTableReturn<TData> {
  params: TableParams;
  query: UseQueryResult<TData>;
}

// tRPC queryOptions carries branded query keys and error types that are still valid
// React Query options, so keep this adapter boundary intentionally permissive.
// biome-ignore lint/suspicious/noExplicitAny: preserves compatibility with tRPC queryOptions.
type QueryOptionsLike<TData> = UseQueryOptions<TData, any, TData, any>;

type GetQueryOptionsFn<TInput, TData> = (
  input: TInput,
  // biome-ignore lint/suspicious/noExplicitAny: preserves compatibility with tRPC queryOptions.
  ...args: any[]
) => QueryOptionsLike<TData>;

export interface NuqsTableOptions<TInput, TData> {
  getQueryOptions: GetQueryOptionsFn<TInput, TData>;
  queryParams?: TInput;
  prefix?: string;
  additionalFilters?: QueryFilters;
  onAdditionalFiltersChange?: (filters: QueryFilters) => void;
}

const useNuqsTable = <TInput, TData>({
  getQueryOptions,
  queryParams = {} as TInput,
  prefix,
  additionalFilters,
  onAdditionalFiltersChange,
}: NuqsTableOptions<TInput, TData>): NuqsTableReturn<TData> => {
  const queryState = useNuqsQueryParams(prefix);

  const queryResult = useQueryWithParams({
    getQueryOptions,
    queryParams,
    queryState,
    grouping: queryState.grouping,
    additionalFilters,
  });

  const [rowSelection, setRowSelectionRaw] = useState<RowSelectionState>({});

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setRowSelectionRaw((prev: RowSelectionState) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  const displayFilters = useMemo<QueryFilters>(() => {
    if (!additionalFilters?.length) return queryState.filters ?? [];
    return [...additionalFilters, ...(queryState.filters ?? [])];
  }, [additionalFilters, queryState.filters]);

  const additionalColumnIds = useMemo(
    () => new Set(additionalFilters?.map((f) => f.columnId) ?? []),
    [additionalFilters]
  );

  const wrappedSetFilters = useCallback(
    (newFilters: QueryFilters) => {
      if (!additionalColumnIds.size) {
        queryState.setFilters?.(newFilters);
        return;
      }
      const ownFilters = newFilters.filter((f) => !additionalColumnIds.has(f.columnId));
      queryState.setFilters?.(ownFilters);

      if (onAdditionalFiltersChange) {
        const updatedAdditional = newFilters.filter((f) => additionalColumnIds.has(f.columnId));
        onAdditionalFiltersChange(updatedAdditional);
      }
    },
    [additionalColumnIds, queryState.setFilters, onAdditionalFiltersChange]
  );

  const params = useMemo(
    () => ({
      ...queryState,
      filters: displayFilters,
      setFilters: wrappedSetFilters,
      rowSelection,
      setRowSelection,
    }),
    [queryState, displayFilters, wrappedSetFilters, rowSelection, setRowSelection]
  );

  return {
    params,
    query: queryResult,
  };
};

export default useNuqsTable;
