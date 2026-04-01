import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { type NuqsQueryParams, useNuqsQueryParams } from "./useNuqsQueryParams";
import { useQueryWithParams } from "./useQueryWithParams";

export interface DateRangeFilterReturn<TData> {
  params: NuqsQueryParams;
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

export interface DateRangeFilterOptions<TInput, TData> {
  getQueryOptions: GetQueryOptionsFn<TInput, TData>;
  queryParams?: TInput;
}

/**
 * Hook for charts with URL-synced query parameters and data fetching
 * Similar to useNuqsTable but without rowSelection (not needed for charts)
 */
export const useDateRangeFilter = <TInput, TData>({
  getQueryOptions,
  queryParams = {} as TInput,
}: DateRangeFilterOptions<TInput, TData>): DateRangeFilterReturn<TData> => {
  const nuqs = useNuqsQueryParams();

  const queryResult = useQueryWithParams({
    getQueryOptions,
    queryParams,
    queryState: {
      filters: nuqs.filters,
      q: nuqs.q,
      sort: nuqs.sort,
      order: nuqs.order,
      page: nuqs.page,
      limit: nuqs.limit,
    },
  });

  return {
    params: nuqs,
    query: queryResult,
  };
};
