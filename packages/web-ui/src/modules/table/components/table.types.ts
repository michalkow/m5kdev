import type { ColumnDataType as CommonColumnDataType } from "@m5kdev/commons/modules/table/filter.types";

export type ColumnDataType = CommonColumnDataType;

export type ColumnItem = {
  id: string;
  label: string;
  visibility: boolean;
  options?: { label: string; value: string }[];
  type?: ColumnDataType;
};
