import { RANKED_MODELS } from "./ai.models.contsants";
import type { TokenSize } from "./ai.types";

export const TOKEN_PRESETS: Record<TokenSize, number> = {
  xs: 30,
  sm: 150,
  md: 400,
  lg: 1_000,
  xl: 4_000,
} as const;

// Embedding Models
export const OPENAI_TEXT_EMBEDDING_3_SMALL = "openai/text-embedding-3-small";

export const AI_EMBEDDING_MODELS = [OPENAI_TEXT_EMBEDDING_3_SMALL] as const;

export type AiEmbeddingModel = (typeof AI_EMBEDDING_MODELS)[number];

export { RANKED_MODELS };
