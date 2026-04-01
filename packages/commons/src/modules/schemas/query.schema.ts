import { z } from "zod";

export const filterSchema = z.object({
  columnId: z.string(),
  type: z.enum(["string", "number", "date", "boolean", "enum", "jsonArray"]),
  method: z.enum([
    "contains",
    "equals",
    "starts_with",
    "ends_with",
    "greater_than",
    "less_than",
    "on",
    "between",
    "before",
    "after",
    "oneOf",
    "intersect",
    "isEmpty",
    "isNotEmpty",
    "is_null",
    "is_not_null",
  ]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  valueTo: z.string().optional(),
  endColumnId: z.string().optional(),
});

export const filtersSchema = z.array(filterSchema);

export const querySchema = z.object({
  // TODO: Remove default values
  page: z.number().optional(),
  limit: z.number().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  filters: filtersSchema.optional(),
  /** Global substring search. Clients should trim; servers treat empty / whitespace-only as no-op. */
  q: z.string().optional(),
});

export type QueryListOutput<T> = { rows: T[]; total: number };

export type QueryInput = z.infer<typeof querySchema>;
export type QueryFilter = z.infer<typeof filterSchema>;
export type QueryFilters = z.infer<typeof filtersSchema>;
