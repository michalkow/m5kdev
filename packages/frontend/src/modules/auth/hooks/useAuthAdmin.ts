import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import {
  type AnyUseMutationOptions,
  type QueryClient,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { authClient } from "../auth.lib";

type ListUsersArgs = Parameters<typeof authClient.admin.listUsers>;

type ListUsersResult = Awaited<ReturnType<typeof authClient.admin.listUsers>>;

/**
 * Data shape returned from Better Auth `admin.listUsers` (tRPC-style query data).
 */
export type ListUsersQueryData = NonNullable<ListUsersResult["data"]>;

export const AUTH_ADMIN_LIST_USERS_KEY = "auth-admin-list-users" as const;

/**
 * Input aligned with `useQueryWithParams` / Nuqs table URL state (page, limit, sort, order, q, filters).
 * Maps to Better Auth `listUsers` query payload.
 */
export interface ListUsersNuqsInput {
  page: number;
  limit: number;
  sort?: string;
  order?: "asc" | "desc" | null;
  q?: string;
  filters?: QueryFilters;
}

type ListUsersFirstArg = ListUsersArgs[0];

function mapNuqsInputToListUsersArg(input: ListUsersNuqsInput): ListUsersFirstArg {
  const page = Math.max(1, input.page);
  return {
    query: {
      searchField: "name",
      searchOperator: "contains",
      searchValue: input.q?.trim() ?? "",
      limit: input.limit,
      offset: (page - 1) * input.limit,
      sortBy: (input.sort ?? "createdAt") as "name" | "email" | "role" | "createdAt",
      sortDirection: (input.order ?? "desc") as "asc" | "desc",
    },
  };
}

/**
 * Query key factory (tRPC-style). Omit input to match all list-users queries for invalidation.
 */
export function listUsersQueryKey(input?: ListUsersNuqsInput): readonly unknown[] {
  if (input === undefined) {
    return [AUTH_ADMIN_LIST_USERS_KEY] as const;
  }
  return [AUTH_ADMIN_LIST_USERS_KEY, mapNuqsInputToListUsersArg(input)] as const;
}

/**
 * Query options factory for use with `useQuery`, `useNuqsTable` / `useQueryWithParams`, or `queryClient.fetchQuery`.
 * Signature mirrors tRPC `procedure.queryOptions(input, opts?)`.
 */
export function listUsersQueryOptions(
  input: ListUsersNuqsInput,
  opts?: Omit<
    UseQueryOptions<ListUsersQueryData, Error, ListUsersQueryData, readonly unknown[]>,
    "queryKey" | "queryFn"
  >
): UseQueryOptions<ListUsersQueryData, Error, ListUsersQueryData, readonly unknown[]> {
  const arg = mapNuqsInputToListUsersArg(input);
  return {
    queryKey: listUsersQueryKey(input),
    queryFn: async (): Promise<ListUsersQueryData> => {
      const { data, error } = await authClient.admin.listUsers(arg);
      if (error) return Promise.reject(error);
      if (data == null) {
        return Promise.reject(new Error("listUsers returned no data"));
      }
      return data;
    },
    ...opts,
  };
}

export function invalidateListUsersQuery(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: [AUTH_ADMIN_LIST_USERS_KEY] });
}

export function useInvalidateListUsers(...args: ListUsersArgs) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [AUTH_ADMIN_LIST_USERS_KEY, ...args] });
}

export function useListUsers(...args: ListUsersArgs) {
  return useQuery({
    queryKey: [AUTH_ADMIN_LIST_USERS_KEY, ...args],
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers(...args);
      if (error) return Promise.reject(error);
      return data;
    },
  });
}

export function useRemoveUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.admin.removeUser>) =>
      authClient.admin.removeUser(...args),
    ...options,
  });
}

export function useUpdateUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.admin.updateUser>) =>
      authClient.admin.updateUser(...args),
    ...options,
  });
}

export function useBanUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.admin.banUser>) =>
      authClient.admin.banUser(...args),
    ...options,
  });
}

export function useUnbanUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.admin.unbanUser>) =>
      authClient.admin.unbanUser(...args),
    ...options,
  });
}

export function useImpersonateUser(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: (...args: Parameters<typeof authClient.admin.impersonateUser>) =>
      authClient.admin.impersonateUser(...args),
    ...options,
  });
}

export function useStopImpersonating(options: AnyUseMutationOptions) {
  return useMutation({
    mutationFn: () => authClient.admin.stopImpersonating(),
    ...options,
  });
}
