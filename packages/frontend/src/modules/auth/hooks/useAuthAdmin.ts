import {
  type AnyUseMutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { authClient } from "../auth.lib";

// import type { QueryFilter, QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
// import type {
//   FilterMethod,
//   FilterMethodName,
//   FilterMethods,
// } from "@m5kdev/commons/modules/table/filter.types";

type ListUsersArgs = Parameters<typeof authClient.admin.listUsers>;

/*
type ListUsersParams = Parameters<typeof authClient.admin.listUsers>;
type ListUsersArgs = Record<string, unknown>;

type FilterOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

type BetterAuthFilterParams = {
  filterField: string;
  filterValue: string | number | boolean;
  filterOperator: FilterOperator;
};

export const authFilterMethods: FilterMethods = {
  string: [{ value: "equals", label: "Equals", component: "text" }],
  number: [
    { value: "equals", label: "Equals", component: "number" },
    { value: "greater_than", label: "Greater Than", component: "number" },
    { value: "less_than", label: "Less Than", component: "number" },
  ],
  date: [
    { value: "on", label: "On", component: "date" },
    { value: "before", label: "Before", component: "date" },
    { value: "after", label: "After", component: "date" },
  ],
  boolean: [{ value: "equals", label: "Equals", component: "radio" }],
  enum: [{ value: "equals", label: "Equals", component: "select" }],
};

const baseMethodOperatorMap: Partial<Record<FilterMethodName, FilterOperator>> = {
  equals: "eq",
  greater_than: "gt",
  less_than: "lt",
  before: "lte",
  after: "gte",
  on: "eq",
};

const getAllowedMethods = (): Record<FilterMethodName, FilterOperator> => {
  const operatorMap: Partial<Record<FilterMethodName, FilterOperator>> = {};
  Object.values(authFilterMethods).forEach((methodsForType) => {
    methodsForType.forEach((method: FilterMethod) => {
      const operator = baseMethodOperatorMap[method.value];
      if (operator) {
        operatorMap[method.value] = operator;
      }
    });
  });
  return operatorMap as Record<FilterMethodName, FilterOperator>;
};

const filterMethodToOperatorMap = getAllowedMethods();

const mapFilterToBetterAuth = (filter?: QueryFilter): Partial<BetterAuthFilterParams> => {
  if (!filter) return {};
  if (!filter.type) return {};
  const allowedMethodsForType = authFilterMethods[filter.type]?.map((method) => method.value) ?? [];
  if (!allowedMethodsForType.includes(filter.method)) return {};
  const operator = filterMethodToOperatorMap[filter.method];
  if (!operator) return {};
  const { columnId, value, type } = filter;
  if (value === undefined || value === null) return {};
  if (type === "boolean" && typeof value === "boolean" && operator === "eq") {
    return { filterField: columnId, filterValue: value, filterOperator: operator };
  }
  if (type === "number" && typeof value === "number") {
    return { filterField: columnId, filterValue: value, filterOperator: operator };
  }
  if ((type === "string" || type === "enum" || type === "date") && typeof value === "string") {
    return { filterField: columnId, filterValue: value, filterOperator: operator };
  }
  return {};
};
*/

export function useInvalidateListUsers(...args: ListUsersArgs) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["auth-admin-list-users", ...args] });
}

/*
export function getListUsers(input: ListUsersArgs): any {
  const {
    filters,
    page,
    limit,
    sort,
    order,
    ...listUsersParams
  } = input as ListUsersArgs & QueryInput;
  const filterParams = mapFilterToBetterAuth(filters?.[0]);
  const sortDirection: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const queryPayload = {
    ...listUsersParams,
    limit,
    sortBy: sort,
    sortDirection,
    offset: (page - 1) * limit,
    ...filterParams,
  };

  return {
    queryKey: ["auth-admin-list-users", input],
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: queryPayload,
      });
      if (error) return Promise.reject(error);
      return data;
    },
  };
}
*/

export function useListUsers(...args: ListUsersArgs) {
  return useQuery({
    queryKey: ["auth-admin-list-users", ...args],
    queryFn: async ({ queryKey }) => {
      const listUserArgs = queryKey.slice(1) as ListUsersArgs;
      const { data, error } = await authClient.admin.listUsers(...listUserArgs);
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
