import { z } from "zod";
import type { QueryFilter, QueryFilters } from "./query.schema";

const QUERY_FILTER_METHOD_TO_OP = {
  equals: "$eq",
  contains: "$contains",
  starts_with: "$starts_with",
  ends_with: "$ends_with",
  greater_than: "$greater_than",
  less_than: "$less_than",
  on: "$on",
  between: "$between",
  before: "$before",
  after: "$after",
  oneOf: "$oneOf",
  intersect: "$intersect",
  isEmpty: "$isEmpty",
  isNotEmpty: "$isNotEmpty",
  is_null: "$is_null",
  is_not_null: "$is_not_null",
} as const;

export type QueryMatchOp = (typeof QUERY_FILTER_METHOD_TO_OP)[QueryFilter["method"]];

/** Scalar or list value in a QueryMatch field / operator payload. */
export type QueryMatchScalar = string | number | boolean | Date | null;

export interface QueryMatchIntersect {
  readonly endColumnId: string;
  readonly from: string;
  readonly to: string;
}

export interface QueryMatchOperators {
  readonly $eq?: QueryMatchScalar | readonly string[];
  readonly $ne?: QueryMatchScalar;
  readonly $gt?: QueryMatchScalar;
  readonly $gte?: QueryMatchScalar;
  readonly $lt?: QueryMatchScalar;
  readonly $lte?: QueryMatchScalar;
  readonly $in?: readonly QueryMatchScalar[];
  readonly $nin?: readonly QueryMatchScalar[];
  readonly $exists?: boolean;
  readonly $like?: string;
  readonly $contains?: QueryMatchScalar;
  readonly $starts_with?: QueryMatchScalar;
  readonly $ends_with?: QueryMatchScalar;
  readonly $greater_than?: QueryMatchScalar;
  readonly $less_than?: QueryMatchScalar;
  readonly $on?: QueryMatchScalar;
  readonly $between?: readonly [QueryMatchScalar, QueryMatchScalar];
  readonly $before?: QueryMatchScalar;
  readonly $after?: QueryMatchScalar;
  readonly $oneOf?: readonly string[];
  readonly $intersect?: QueryMatchIntersect;
  readonly $isEmpty?: boolean;
  readonly $isNotEmpty?: boolean;
  readonly $is_null?: boolean;
  readonly $is_not_null?: boolean;
  readonly $not?: QueryMatchOperators;
}

export type QueryMatchFieldValue = QueryMatchScalar | readonly string[] | QueryMatchOperators;

export interface QueryMatch {
  readonly $and?: readonly QueryMatch[];
  readonly $or?: readonly QueryMatch[];
  readonly $not?: QueryMatch;
  readonly [field: string]: QueryMatchFieldValue | readonly QueryMatch[] | QueryMatch | undefined;
}

export const queryMatchSchema: z.ZodType<QueryMatch> = z.lazy(() =>
  z.record(z.string(), z.unknown())
) as z.ZodType<QueryMatch>;

export const matchQuerySchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  match: queryMatchSchema.optional(),
  /** Global substring search. Clients should trim; servers treat empty / whitespace-only as no-op. */
  q: z.string().optional(),
});

export type MatchQueryInput = z.infer<typeof matchQuerySchema>;

function queryFilterToMatch(filter: QueryFilter): QueryMatch {
  const op = QUERY_FILTER_METHOD_TO_OP[filter.method];
  switch (filter.method) {
    case "between":
      return {
        [filter.columnId]: {
          $between: [String(filter.value), filter.valueTo ?? ""],
        },
      };
    case "intersect":
      return {
        [filter.columnId]: {
          $intersect: {
            endColumnId: filter.endColumnId ?? "",
            from: String(filter.value),
            to: filter.valueTo ?? "",
          },
        },
      };
    case "isEmpty":
    case "isNotEmpty":
    case "is_null":
    case "is_not_null":
      return { [filter.columnId]: { [op]: true } };
    default:
      return { [filter.columnId]: { [op]: filter.value } };
  }
}

/** Rename QueryFilters into a QueryMatch. Does not bake day bounds or gte. */
export function queryFiltersToMatch(filters: QueryFilters | undefined): QueryMatch {
  if (!filters || filters.length === 0) {
    return {};
  }
  if (filters.length === 1) {
    return queryFilterToMatch(filters[0]);
  }
  return { $and: filters.map(queryFilterToMatch) };
}
