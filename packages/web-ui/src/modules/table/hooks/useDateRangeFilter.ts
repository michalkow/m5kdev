import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
import type { QueryParamsState } from "@m5kdev/frontend/modules/table/queryParams";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { useNuqsQueryParams } from "./useNuqsQueryParams";

export interface DateRangeFilterReturn<TData> {
  params: QueryParamsState;
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

export interface DateRangeFilterOptions<TInput, TData> {
  getQueryOptions: GetQueryOptionsFn<TInput, TData>;
  queryParams?: TInput;
}

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
