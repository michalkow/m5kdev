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
import { createBackendApp } from "@m5kdev/backend/app";
import { AIModule } from "@m5kdev/backend/modules/ai/ai.module";

createBackendApp(config, [
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
  }),
]);
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

## Conversation UI

`AiConversation` is a layout-agnostic compound in `@m5kdev/web-ui`: pass
`agentId` and `threadId`, then compose `.Messages` and `.Prompt` (or omit
`.Prompt` for a read-only transcript). Default children are Messages + Prompt.

The frontend hook `useAiChat` hydrates the Thread, then POSTs through Vercel AI
SDK `useChat`. Two mounts with the same `agentId` + `threadId` share one Chat
instance; unmounting does not evict it.

HTTP (mounted by `AIModule.express` at `/ai`, authenticated):

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/ai/chat/:agentId/threads/:threadId` | Hydrate. Without Memory: `{ messages: [], memory: false }`. With Memory: recalled Thread messages adapted to `UIMessage`, `memory: true`, scoped to the Actor UserId. 401 unauthenticated, 404 unknown Agent. |
| POST | `/ai/chat/:agentId` | `handleChatStream` (`version: 'v7'`) + `pipeUIMessageStreamToResponse`. Without Memory the client sends the full in-memory history. With Memory the client sends only the last user message plus `memory.thread`; the server stamps `memory.resource` from the Actor UserId and ignores a client-supplied resource. Stream finish records `ai_usage` with `feature` = `agentId`. 401 / 404 as above. |

Do not use Mastra's own HTTP server or `chats.conversation` for this UI
(see ADR-0007). Memory is optional on the app’s Mastra Agent — the Kernel does
not own a Memory store.

## Model constants

Import model ids from `@m5kdev/commons/modules/ai/ai.constants` instead of
hardcoding strings — constants are organized into over- and under-$1/M-token
tiers so cost decisions are explicit at the call site.

## Starter and create-m5kdev

Starter dogsfoods Conversation behind the `ai` create flag (`// m5k:ai`
markers), the same opt-in as Files and Workflows. `--yes` does not enable it.

When the flag is on:

- `AIModule` is registered with an app-owned Mastra Agent (`assistant`) and
  OpenRouter. The Agent has no Memory — the webapp Conversation is session-only.
- Schema exports `chats` and `ai_usage`. After adding those tables, generate
  and apply a Drizzle migration; do not hand-edit SQL.
- The webapp mounts `/conversation` with `AiConversation`.
- Set `OPENROUTER_API_KEY` for a live reply. Hydrate still works without it.

When the flag is off, `AIModule` is not registered and the Conversation route
is omitted. Expo create does not add Conversation UI.

## Environment

`IDEOGRAM_API_KEY` when `enableIdeogram` is set; OpenRouter/Replicate clients
are constructed in app code with their own keys. Starter Conversation uses
`OPENROUTER_API_KEY`.
