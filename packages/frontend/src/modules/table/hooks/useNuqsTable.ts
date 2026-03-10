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
}

const useNuqsTable = <TInput, TData>({
  getQueryOptions,
  queryParams = {} as TInput,
}: NuqsTableOptions<TInput, TData>): NuqsTableReturn<TData> => {
  // Get all URL query state
  const queryState = useNuqsQueryParams();

  // Get query result
  const queryResult = useQueryWithParams({
    getQueryOptions,
    queryParams,
    queryState,
  });

  // Table-specific row selection state
  const [rowSelection, setRowSelectionRaw] = useState<RowSelectionState>({});

  console.log("rowSelection", rowSelection);

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setRowSelectionRaw((prev: RowSelectionState) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  const params = useMemo(
    () => ({
      ...queryState,
      rowSelection,
      setRowSelection,
    }),
    [queryState, rowSelection, setRowSelection]
  );

  return {
    params,
    query: queryResult,
  };
};

export default useNuqsTable;
