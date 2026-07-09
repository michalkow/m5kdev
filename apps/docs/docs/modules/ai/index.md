---
sidebar_position: 6
---

# AI module

The AI module is the LLM orchestration layer: Mastra agents, OpenRouter models,
embeddings and vector storage, Replicate and Ideogram image generation, plus
per-user usage tracking.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Model id constants (e.g. `GPT_5_1`, `CLAUDE_SONNET_4_6`, `GEMINI_3_PRO`) grouped by price tier, and prompt utilities such as `arrayToPseudoXML`. |
| `@m5kdev/backend` | `AIModule`: `chats` and `ai_usage` tables, repositories, `AIService`, `IdeogramService`, prompts, tRPC procedures. |

## Registration

```ts
import { AIModule } from "@m5kdev/backend/modules/ai/ai.module";

backendApp.use(
  new AIModule({
    libs: { mastra, openrouter, replicate }, // all optional
    options: {
      retryAttempts: 2,
      retryModels: [GEMINI_3_FLASH],
      repairAttempts: 1,
      repairModel: GPT_5_MINI,
      removeMDash: true,
    },
    vectorStore, // LibSQLVector, enables embedding storage
    enableIdeogram: true, // requires IDEOGRAM_API_KEY
  })
);
```

Depends on `auth` (usage rows are attributed to users).

## Service API

`AIService` groups its surface by concern:

- **Agents (Mastra)** — `getMastra()`, `agentUse`, `agentText`,
  `agentTextResult`, `agentObject(schema)`, `agentObjectResult(schema)`.
- **Direct generation (OpenRouter)** — `prepareModel`, `generateText`, and
  `generateObject(schema)` with built-in retry across `retryModels` and JSON
  repair via `repairModel`.
- **Embeddings** — `prepareEmbeddingModel`, `embed`, `embedMany`,
  `embedDocument`, `upsertEmbedDocument` (vector store required).
- **Media** — `generateReplicate` (Replicate predictions), `generateTranscript`
  (audio transcription), `generateIdeogram` (Ideogram images).
- **Usage** — every call is metered into `ai_usage`; `getUsage` aggregates per
  user and backs the `ai.getUserUsage` admin tRPC procedure.

All fallible calls return `ServerResultAsync`.

## Model constants

Import model ids from `@m5kdev/commons/modules/ai/ai.constants` instead of
hardcoding strings — constants are organized into over- and under-$1/M-token
tiers so cost decisions are explicit at the call site.

## Environment

`IDEOGRAM_API_KEY` when `enableIdeogram` is set; OpenRouter/Replicate clients
are constructed in app code with their own keys.
