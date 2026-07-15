export interface RankedModel {
  id: string;
  inputCost: number;
  outputCost: number;
  quality: Record<Category, number>;
  speed: number;
}

export type Category =
  | "structured_output"
  | "creative"
  | "research"
  | "chat"
  | "tool_use"
  | "planning"
  | "classification";

export type SortType = "quality" | "price" | "speed";

export type TokenProfile = {
  inputTokens: number;
  outputTokens: number;
};

export type TokenSize = "xs" | "sm" | "md" | "lg" | "xl";
