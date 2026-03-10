// Models > $1/M tokens
export const GPT_5_CHAT = "openai/gpt-5-chat";
export const GPT_5_1 = "openai/gpt-5.1";
export const GPT_5_2 = "openai/gpt-5.2";
export const GEMINI_3_1_PRO = "google/gemini-3.1-pro-preview";
export const GEMINI_2_5_PRO = "google/gemini-2.5-pro";
export const GEMINI_3_PRO = "google/gemini-3-pro-preview";
export const GEMINI_3_FLASH = "google/gemini-3-flash-preview";
export const GROK_4 = "x-ai/grok-4";
export const CLAUDE_SONNET_4 = "anthropic/claude-sonnet-4";
export const CLAUDE_SONNET_4_5 = "anthropic/claude-sonnet-4.5";
export const CLAUDE_OPUS_4_5 = "anthropic/claude-opus-4.5";
export const CLAUDE_SONNET_4_6 = "anthropic/claude-sonnet-4.6";
export const CLAUDE_OPUS_4_6 = "anthropic/claude-opus-4.6";
export const MINIMAX_M2 = "minimax/minimax-m2";
export const QWEN3_MAX = "qwen/qwen3-max";
export const O3 = "openai/o3";

// Models < $1/M tokens
export const GPT_5_MINI = "openai/gpt-5-mini";
export const GEMINI_2_5_FLASH = "google/gemini-2.5-flash";
export const GROK_3_MINI = "x-ai/grok-3-mini";
export const GROK_4_FAST = "x-ai/grok-4-fast";
export const KIMI_K2_THINKING = "moonshotai/kimi-k2-thinking";
export const KIMI_K2 = "moonshotai/kimi-k2-0905";
export const KIMI_K2_5 = "moonshotai/kimi-k2.5";
export const CLAUDE_SONNET_3_HAIKU = "anthropic/claude-3-haiku";
export const GLM_4_5V = "z-ai/glm-4.5v";
export const GLM_4_6 = "z-ai/glm-4.6";
export const DEEPSEEK_V3_1 = "deepseek/deepseek-chat-v3.1";
export const DEEPSEEK_R1 = "deepseek/deepseek-r1-0528";
export const LLAMA_3_3_70B_INSTRUCT = "meta-llama/llama-3.3-70b-instruct";
export const MISTRAL_3_1_MEDIUM = "mistralai/mistral-medium-3.1";

// Models < $0.1/M tokens
export const QWEN3_30B_A3B = "qwen/qwen3-30b-a3b";
export const GPT_5_NANO = "openai/gpt-5-nano";
export const GEMINI_2_5_FLASH_LITE = "google/gemini-2.5-flash-lite";

// Embedding Models
export const OPENAI_TEXT_EMBEDDING_3_SMALL = "openai/text-embedding-3-small";

export const AI_EMBEDDING_MODELS = [OPENAI_TEXT_EMBEDDING_3_SMALL] as const;

export type AiEmbeddingModel = (typeof AI_EMBEDDING_MODELS)[number];

// Models by utility
export const SCORER_BEST = GEMINI_3_FLASH;
export const SCORER_FAST = KIMI_K2_5;
export const RESONING_BEST = GEMINI_3_1_PRO;
export const RESONING_FAST = KIMI_K2_5;
export const STRUCTURED_OUTPUT_BEST = CLAUDE_SONNET_4_5;
export const STRUCTURED_OUTPUT_FAST = GPT_5_MINI;
export const TOOL_CALL_BEST = CLAUDE_SONNET_4_5;
export const TOOL_CALL_FAST = GPT_5_MINI;

export const AI_MODELS = [
  LLAMA_3_3_70B_INSTRUCT,
  QWEN3_30B_A3B,
  GEMINI_2_5_PRO,
  GEMINI_3_PRO,
  GEMINI_3_FLASH,
  DEEPSEEK_R1,
  O3,
  GPT_5_1,
  GPT_5_2,
  GPT_5_CHAT,
  GROK_4,
  CLAUDE_SONNET_4,
  CLAUDE_SONNET_4_5,
  CLAUDE_OPUS_4_5,
  GPT_5_MINI,
  GLM_4_5V,
  MISTRAL_3_1_MEDIUM,
  GEMINI_2_5_FLASH,
  GROK_3_MINI,
  CLAUDE_SONNET_3_HAIKU,
  GPT_5_NANO,
  GEMINI_2_5_FLASH_LITE,
  GROK_4_FAST,
  MINIMAX_M2,
  KIMI_K2,
  KIMI_K2_THINKING,
  DEEPSEEK_V3_1,
  GLM_4_6,
  QWEN3_MAX,
] as const;

export const AI_MODELS_REGISTRY: AiModelRegistry = {
  [O3]: {
    name: "O3",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "pro",
    order: 1,
  },
  [MISTRAL_3_1_MEDIUM]: {
    name: "Mistral 3.1 Medium",
    provider: "mistralai",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [DEEPSEEK_R1]: {
    name: "DeepSeek R1",
    provider: "deepseek",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [QWEN3_30B_A3B]: {
    name: "Qwen3 30B A3B",
    provider: "qwen",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [LLAMA_3_3_70B_INSTRUCT]: {
    name: "LLama 3.3 70B",
    provider: "meta-llama",
    icon: "ti-brand-meta",
    tier: "pro",
    order: 1,
  },
  [GLM_4_5V]: {
    name: "GLM 4.5V",
    provider: "z-ai",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [GLM_4_6]: {
    name: "GLM 4.6",
    provider: "z-ai",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [QWEN3_MAX]: {
    name: "Qwen3 Max",
    provider: "qwen",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [DEEPSEEK_V3_1]: {
    name: "DeepSeek V3.1",
    provider: "deepseek",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [KIMI_K2]: {
    name: "Kimi K2",
    provider: "moonshotai",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [KIMI_K2_THINKING]: {
    name: "Kimi K2 Thinking",
    provider: "moonshotai",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [CLAUDE_SONNET_4_5]: {
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [GPT_5_1]: {
    name: "GPT-5.1",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "pro",
    order: 1,
  },
  [GPT_5_2]: {
    name: "GPT-5.2",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "pro",
    order: 1,
  },
  [MINIMAX_M2]: {
    name: "MiniMax M2",
    provider: "minimax",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [GEMINI_2_5_PRO]: {
    name: "Gemini 2.5 Pro",
    provider: "google",
    icon: "ti-brand-google",
    tier: "pro",
    order: 1,
  },
  [GEMINI_3_PRO]: {
    name: "Gemini 3 Pro",
    provider: "google",
    icon: "ti-brand-google",
    tier: "pro",
    order: 1,
  },
  [GEMINI_3_FLASH]: {
    name: "Gemini 3 Flash",
    provider: "google",
    icon: "ti-brand-google",
    tier: "pro",
    order: 1,
  },
  [GPT_5_CHAT]: {
    name: "GPT-5",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "pro",
    order: 2,
  },
  [GROK_4]: {
    name: "Grok 4",
    provider: "x-ai",
    icon: "ti-brand-x",
    tier: "pro",
    order: 3,
  },
  [GROK_4_FAST]: {
    name: "Grok 4 Fast",
    provider: "x-ai",
    icon: "ti-brand-x",
    tier: "pro",
    order: 4,
  },
  [CLAUDE_SONNET_4]: {
    name: "Claude Sonnet 4",
    provider: "anthropic",
    icon: "ti-ai",
    tier: "pro",
    order: 4,
  },
  [CLAUDE_OPUS_4_5]: {
    name: "Claude Opus 4.5",
    provider: "anthropic",
    icon: "ti-ai",
    tier: "pro",
    order: 1,
  },
  [GPT_5_MINI]: {
    name: "GPT-5 Mini",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "standard",
    order: 5,
  },
  [GEMINI_2_5_FLASH]: {
    name: "Gemini 2.5 Flash",
    provider: "google",
    icon: "ti-brand-google",
    tier: "standard",
    order: 6,
  },
  [GROK_3_MINI]: {
    name: "Grok 3 Mini",
    provider: "x-ai",
    icon: "ti-brand-x",
    tier: "standard",
    order: 7,
  },
  [CLAUDE_SONNET_3_HAIKU]: {
    name: "Claude Sonnet 3 Haiku",
    provider: "anthropic",
    icon: "ti-brand-anthropic",
    tier: "standard",
    order: 8,
  },
  [GPT_5_NANO]: {
    name: "GPT-5 Nano",
    provider: "openai",
    icon: "ti-brand-openai",
    tier: "fast",
    order: 9,
  },
  [GEMINI_2_5_FLASH_LITE]: {
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    icon: "ti-brand-google",
    tier: "fast",
    order: 10,
  },
};

export type AiModel = (typeof AI_MODELS)[number];
export type AiModelRegistry = Record<
  AiModel,
  {
    name: string;
    provider: string;
    icon: string;
    tier: string;
    order: number;
  }
>;
