import { type UseQueryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { NuqsQueryParams } from "./useNuqsQueryParams";

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

export interface QueryWithParamsOptions<TInput, TData> {
  getQueryOptions: GetQueryOptionsFn<TInput, TData>;
  queryParams?: TInput;
  queryState: Pick<NuqsQueryParams, "filters" | "sort" | "order" | "page" | "limit">;
  enabled?: boolean;
}

/**
 * Hook to integrate query state with React Query
 * Combines queryParams with queryState and manages data fetching
 */
export const useQueryWithParams = <TInput, TData>({
  getQueryOptions,
  queryParams = {} as TInput,
  queryState,
  enabled = true,
}: QueryWithParamsOptions<TInput, TData>): UseQueryResult<TData> => {
  const { filters, sort, order, page, limit } = queryState;

  const input = useMemo(
    () => ({
      ...queryParams,
      page,
      limit,
      sort,
      order: order ?? undefined,
      filters,
    }),
    [queryParams, page, limit, sort, order, filters]
  );

  const queryOptions = useMemo(
    () => ({
      ...getQueryOptions(input),
      placeholderData: (previousData: TData | undefined) => previousData,
      enabled,
    }),
    [getQueryOptions, input, enabled]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(queryOptions as any) as UseQueryResult<TData>;
};
