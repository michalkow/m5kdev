import type { QueryFilter } from "../schemas/query.schema";

export type ColumnDataType = NonNullable<QueryFilter["type"]>;

export type ComponentForFilterMethod =
  | "text"
  | "number"
  | "date"
  | "range"
  | "radio"
  | "select"
  | "multiSelect";

export type FilterMethodName =
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "on"
  | "between"
  | "before"
  | "after"
  | "intersect"
  | "oneOf"
  | "isEmpty"
  | "isNotEmpty";

export type FilterMethod = {
  value: FilterMethodName;
  label: string;
  component?: ComponentForFilterMethod | null;
};

export type FilterMethods = {
  [key in ColumnDataType]: FilterMethod[];
};

