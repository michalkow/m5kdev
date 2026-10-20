import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";

/**
 * Input aligned with `useQueryWithParams` table state (page, limit, sort, order, q, filters).
 * Maps to Better Auth `listUsers` query payload.
 */
export interface ListUsersQueryInput {
  page: number;
  limit: number;
  sort?: string;
  order?: "asc" | "desc" | null;
  q?: string;
  filters?: QueryFilters;
}

export interface ListUsersQueryArg {
  query: {
    searchField: "email" | "name";
    searchOperator: "contains";
    searchValue: string;
    limit: number;
    offset: number;
    sortBy: "name" | "email" | "role" | "createdAt";
    sortDirection: "asc" | "desc";
  };
}

export function mapQueryInputToListUsersArg(input: ListUsersQueryInput): ListUsersQueryArg {
  const page = Math.max(1, input.page);
  const searchValue = input.q?.trim() ?? "";
  return {
    query: {
      searchField: searchValue.includes("@") ? "email" : "name",
      searchOperator: "contains",
      searchValue,
      limit: input.limit,
      offset: (page - 1) * input.limit,
      sortBy: (input.sort ?? "createdAt") as "name" | "email" | "role" | "createdAt",
      sortDirection: (input.order ?? "desc") as "asc" | "desc",
    },
  };
}
