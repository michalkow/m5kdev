import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { type NuqsQueryParams, useNuqsQueryParams } from "./useNuqsQueryParams";
import { useQueryWithParams } from "./useQueryWithParams";

export interface TableParams extends NuqsQueryParams {
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

/**
 * Flexible query options type that accepts both standard TanStack Query options
 * and tRPC's queryOptions function return type.
 * Uses permissive generics to handle type differences between TanStack Query and tRPC.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryOptionsLike<TData> = UseQueryOptions<TData, any, TData, any>;

/**
 * Function type that accepts both standard query options functions and tRPC's queryOptions.
 * tRPC's queryOptions accepts (input, opts?) while standard functions may only accept (input).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GetQueryOptionsFn<TInput, TData> = (input: TInput, ...args: any[]) => QueryOptionsLike<TData>;

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
  // Get all URL query state (includes grouping)
  const queryState = useNuqsQueryParams(prefix);

  // Get query result — passes grouping so limit can be overridden when grouped
  const queryResult = useQueryWithParams({
    getQueryOptions,
    queryParams,
    queryState,
    grouping: queryState.grouping,
    additionalFilters,
  });

  // Table-specific row selection state
  const [rowSelection, setRowSelectionRaw] = useState<RowSelectionState>({});

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setRowSelectionRaw((prev: RowSelectionState) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  // Merge additionalFilters into displayed filters so the table UI shows all active filters.
  // On write, strip the additional filters so only the table's own go to the prefixed URL param.
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
