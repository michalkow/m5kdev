import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { type UseQueryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { GroupingState } from "@tanstack/react-table";
import { useEffect, useMemo, useRef } from "react";
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

const FETCH_ALL_LIMIT = 99999;

export interface QueryWithParamsOptions<TInput, TData> {
  getQueryOptions: GetQueryOptionsFn<TInput, TData>;
  queryParams?: TInput;
  queryState: Pick<NuqsQueryParams, "filters" | "sort" | "order" | "page" | "limit">;
  grouping?: GroupingState;
  additionalFilters?: QueryFilters;
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
  grouping = [],
  additionalFilters,
  enabled = true,
}: QueryWithParamsOptions<TInput, TData>): UseQueryResult<TData> => {
  const { filters, sort, order, page, limit } = queryState;
  const isGrouped = grouping.length > 0;

  const input = useMemo(() => {
    let mergedFilters: QueryFilters | undefined;
    if (additionalFilters?.length) {
      const additionalColumnIds = new Set(additionalFilters.map((f) => f.columnId));
      const ownFiltersOnly = (filters ?? []).filter((f) => !additionalColumnIds.has(f.columnId));
      mergedFilters = [...additionalFilters, ...ownFiltersOnly];
    } else {
      mergedFilters = filters;
    }

    return {
      ...queryParams,
      page: isGrouped ? 1 : page,
      limit: isGrouped ? FETCH_ALL_LIMIT : limit,
      sort,
      order: order ?? undefined,
      filters: mergedFilters,
    };
  }, [queryParams, page, limit, sort, order, filters, isGrouped, additionalFilters]);

  const prevIsGroupedRef = useRef(isGrouped);

  const groupingTransitioned = prevIsGroupedRef.current !== isGrouped;

  useEffect(() => {
    prevIsGroupedRef.current = isGrouped;
  }, [isGrouped]);

  const queryOptions = useMemo(
    () => ({
      ...getQueryOptions(input),
      placeholderData: groupingTransitioned
        ? undefined
        : (previousData: TData | undefined) => previousData,
      enabled,
    }),
    [getQueryOptions, input, enabled, groupingTransitioned]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(queryOptions as any) as UseQueryResult<TData>;
};
