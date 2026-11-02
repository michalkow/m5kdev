import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import {
  and,
  arrayContains,
  arrayOverlaps,
  between,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { PgColumn, PgTableWithColumns } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import type { ConditionBuilder } from "./base.repository";

type ColumnDataType = "string" | "number" | "date" | "boolean" | "enum" | "jsonArray";

// Helper: Create UTC date boundaries from ISO string
const getUTCDateBoundaries = (isoString: string) => {
  const dateTime = DateTime.fromISO(isoString, { zone: "utc" });
  return {
    start: dateTime.startOf("day").toJSDate(),
    end: dateTime.endOf("day").toJSDate(),
  };
};

// biome-ignore lint/suspicious/noExplicitAny: Drizzle TableConfig is complex; we access columns dynamically by `columnId`.
export const getConditionsFromFilters = <T extends PgTableWithColumns<any>>(
  conditions: ConditionBuilder,
  filters: QueryFilters | undefined,
  table: T
): ConditionBuilder => {
  if (!filters || filters.length === 0) {
    return conditions;
  }

  // Process each filter (maximum one filter per column)
  for (const filter of filters) {
    const { columnId, type, method, value, valueTo } = filter;

    // Get the column from the table using columnId
    const column = (table as unknown as Record<string, PgColumn>)[columnId];
    if (!column) {
      continue; // Skip if column doesn't exist
    }

    // Handle isEmpty/isNotEmpty methods (work across types, ignore value)
    if (method === "isEmpty" || method === "isNotEmpty") {
      switch (type as ColumnDataType) {
        case "string":
        case "enum":
          // isEmpty: IS NULL OR = ''
          // isNotEmpty: IS NOT NULL AND != ''
          if (method === "isEmpty") {
            conditions.push(or(isNull(column), eq(column, "")));
          } else {
            conditions.push(and(isNotNull(column), ne(column, "")));
          }
          continue;
        case "jsonArray":
          if (method === "isEmpty") {
            conditions.push(or(isNull(column), eq(column, [])));
          } else {
            conditions.push(and(isNotNull(column), ne(column, [])));
          }
          continue;
        case "number":
          // isEmpty: IS NULL OR = 0
          // isNotEmpty: IS NOT NULL AND != 0
          if (method === "isEmpty") {
            conditions.push(or(isNull(column), eq(column, 0)));
          } else {
            conditions.push(and(isNotNull(column), ne(column, 0)));
          }
          continue;
        case "boolean":
          // Should not happen per plan, but handle gracefully
          continue;
        default:
          continue;
      }
    }

    // Apply filter based on type and method
    switch (type as ColumnDataType) {
      case "string":
        switch (method) {
          case "contains":
            if (typeof value === "string") {
              conditions.push(ilike(column, `%${value}%`));
            }
            break;
          case "equals":
            if (typeof value === "string") {
              conditions.push(eq(column, value));
            }
            break;
          case "starts_with":
            if (typeof value === "string") {
              conditions.push(ilike(column, `${value}%`));
            }
            break;
          case "ends_with":
            if (typeof value === "string") {
              conditions.push(ilike(column, `%${value}`));
            }
            break;
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }
        break;

      case "number":
        switch (method) {
          case "equals":
            if (typeof value === "number") {
              conditions.push(eq(column, value));
            }
            break;
          case "greater_than":
            if (typeof value === "number") {
              conditions.push(gte(column, value));
            }
            break;
          case "less_than":
            if (typeof value === "number") {
              conditions.push(lte(column, value));
            }
            break;
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }
        break;

      case "date":
        if (typeof value !== "string") break;

        switch (method) {
          case "on": {
            const { start, end } = getUTCDateBoundaries(value);
            conditions.push(and(gte(column, start), lte(column, end)));
            break;
          }
          case "between":
            if (valueTo) {
              const { start } = getUTCDateBoundaries(value);
              const { end } = getUTCDateBoundaries(valueTo);
              conditions.push(between(column, start, end));
            }
            break;
          case "before": {
            const { end } = getUTCDateBoundaries(value);
            conditions.push(lte(column, end));
            break;
          }
          case "after": {
            const { start } = getUTCDateBoundaries(value);
            conditions.push(gte(column, start));
            break;
          }
          case "intersect": {
            // Interval overlap: [columnId, endColumnId] intersects with [value, valueTo]
            // Logic: columnId <= valueTo AND (endColumnId IS NULL OR endColumnId >= value)
            if (!valueTo || !filter.endColumnId) break;

            const endColumn = (table as unknown as Record<string, PgColumn>)[filter.endColumnId];
            if (!endColumn) break;

            const { start } = getUTCDateBoundaries(value);
            const { end } = getUTCDateBoundaries(valueTo);

            conditions.push(and(lte(column, end), or(isNull(endColumn), gte(endColumn, start))));
            break;
          }
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }
        break;

      case "boolean":
        switch (method) {
          case "equals":
            if (typeof value === "boolean") {
              conditions.push(eq(column, value));
            }
            break;
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }

        break;

      case "enum":
        switch (method) {
          case "oneOf":
            if (Array.isArray(value) && value.length > 0) {
              conditions.push(inArray(column, value));
            }
            break;
          case "equals":
            if (typeof value === "string") {
              conditions.push(eq(column, value));
            }
            break;
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }
        break;

      case "jsonArray":
        switch (method) {
          case "oneOf": {
            if (Array.isArray(value) && value.length > 0) {
              const values = value.filter((entry): entry is string => typeof entry === "string");
              if (values.length > 0) {
                conditions.push(
                  column.dataType === "array"
                    ? arrayOverlaps(column, values)
                    : or(
                        ...values.map(
                          (entry) => sql`${column} @> ${JSON.stringify([entry])}::jsonb`
                        )
                      )
                );
              }
            }
            break;
          }
          case "equals": {
            if (Array.isArray(value) && value.length > 0) {
              const values = value.filter((entry): entry is string => typeof entry === "string");
              if (values.length > 0) {
                conditions.push(
                  column.dataType === "array"
                    ? arrayContains(column, values)
                    : sql`${column} @> ${JSON.stringify(values)}::jsonb`
                );
              }
            }
            break;
          }
          case "is_null":
            conditions.push(isNull(column));
            break;
          case "is_not_null":
            conditions.push(isNotNull(column));
            break;
        }
        break;
    }
  }

  return conditions;
};
