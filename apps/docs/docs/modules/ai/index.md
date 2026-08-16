---
sidebar_position: 6
---

# AI module

The AI module is the LLM orchestration layer: Mastra agents, OpenRouter models,
embeddings and vector storage, Replicate and Ideogram image generation, plus
usage tracking attributed to User and optional Member.

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
      defaultModelSuffix: ":online", // optional OpenRouter model suffix
    },
    vectorStore: {
      url: process.env.VECTOR_DATABASE_URL,
      authToken: process.env.VECTOR_AUTH_TOKEN,
      localUrl: "file:./vector.db",
    },
    enableIdeogram: true, // requires IDEOGRAM_API_KEY
  })
);
```

Depends on `auth`. Usage rows stamp `userId` plus optional `memberId` /
`organizationId` / `teamId` when `ctx.actor` is passed.

`vectorStore` may be a preconfigured `LibSQLVector` (caller owns `close()`) or
a config object the module resolves and shuts down. Remote URLs are always
direct connections; a local file is a dev-only fallback and must not be the app
database file. See [libsql resilience](/guides/libsql-resilience-migration).

## Service API

`AIService` groups its surface by concern:

- **Agents (Mastra)** — `getMastra()`, `agentUse`, `agentText`,
  `agentTextResult`, `agentObject(schema)`, `agentObjectResult(schema)`.
- **Direct generation (OpenRouter)** — `prepareModel`, `generateText`,
  `generateObject(schema)`, `extractObject`, `generateExtractedObject`.
  Text/object calls retry across `retryModels` and repair JSON via
  `repairModel`. Pass either `prompt` or `messages`, not both.
- **Images** — `generateImage` (OpenRouter image models via
  `prepareImageModel`).
- **Embeddings** — `prepareEmbeddingModel`, `embed`, `embedMany`,
  `embedDocument`, `upsertEmbedDocument` (vector store required).
- **Media** — `generateReplicate` (Replicate predictions), `generateTranscript`
  (Whisper diarization via Replicate), `generateIdeogram` (Ideogram images).
- **Usage** — metered into `ai_usage`; `getUsage(userId)` aggregates per User
  and backs the `ai.getUserUsage` admin tRPC procedure.

All fallible calls return `ServerResultAsync`.

### Generation options

Per-call options overlay module `AIServiceOptions`:

| Option | Effect |
| --- | --- |
| `model` / `models` / `preferredModels` / `presetModels` | Candidate list. Failures sort candidates so healthier models run first. |
| `modelSuffix` | Appended to the OpenRouter model id (`defaultModelSuffix` when omitted). |
| `webSearch` | OpenRouter `web` plugin (`maxResults`, `searchPrompt`). |
| `retryAttempts` / `retryModels` | After a provider failure, rotate retry models. |
| `repairAttempts` / `repairModel` | Object generation only: JSON/schema repair. |
| `ctx` | Actor used for usage attribution. |

`generateExtractedObject` generates text first, then runs `extractObject` (default
extractor prompt) to parse it against a Zod schema.

### Prompts

`Prompt` renders Mustache templates. `createGeneratePromptParams` builds a
typed factory that merges a context-derived param object with an optional
override — useful when a service method should not wrap `generateText` /
`generateObject` itself:

```ts
import { Prompt, createGeneratePromptParams } from "@m5kdev/backend/modules/ai/ai.prompt";

const summaryPrompt = new Prompt("Summarize {{title}}:\n{{body}}");

export const summaryTextParams = createGeneratePromptParams<"text", { title: string; body: string }>(
  (context) => ({
    model: GPT_5_MINI,
    prompt: summaryPrompt.compile(context),
  })
);

await ai.generateText(summaryTextParams({ title, body }, { temperature: 0.2 }));
```

### Failure tracking

Text and object generation keep **separate in-memory** failure caches per
`AIService` instance (not shared across processes). Defaults:

- Threshold `2` consecutive failures before skip (`modelFailureThreshold`).
- Then skip `5` runs, doubling each additional failure up to `40`
  (`modelFailureInitialSkipRuns` / `modelFailureMaxSkipRuns`).
- A success clears that model's cache for that generation kind.

Retries still rotate `retryModels` independently of this skip list.

## Model constants

Import model ids from `@m5kdev/commons/modules/ai/ai.constants` instead of
hardcoding strings — constants are organized into over- and under-$1/M-token
tiers so cost decisions are explicit at the call site.

## Environment

| Variable | When |
| --- | --- |
| `IDEOGRAM_API_KEY` | `enableIdeogram: true` |
| `VECTOR_DATABASE_URL` / `VECTOR_AUTH_TOKEN` | Production vector store (names are app-defined) |

OpenRouter and Replicate clients are constructed in app code with their own keys.
