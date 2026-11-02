---
sidebar_position: 6
---

# AI module

The AI module is the LLM orchestration layer: app-owned Mastra agents,
OpenRouter models, embeddings and vector storage, Replicate and Ideogram image
generation, plus per-user usage tracking.

The Kernel does **not** export `createAgent` or `createMastra`. Construct
`Agent` and `Mastra` in app code and pass the instance in. Upgrade steps:
[App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Model id constants (e.g. `GPT_5_1`, `CLAUDE_SONNET_4_6`, `GEMINI_3_PRO`) grouped by price tier, and prompt utilities such as `arrayToPseudoXML`. |
| `@m5kdev/backend` | `AIModule`: `chats` and `ai_usage` tables, repositories, `AIService`, `IdeogramService`, prompts, tRPC procedures. |

## Registration

Apps own the Mastra instance. Starter keeps that construction in
`conversation.mastra.ts`:

```ts
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createBackendApp } from "@m5kdev/backend/app";
import { AIModule } from "@m5kdev/backend/modules/ai/ai.module";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const storage = new PostgresStore({
  id: "app-mastra",
  connectionString: process.env.MASTRA_DATABASE_URL || process.env.DATABASE_URL!,
  schemaName: process.env.MASTRA_DATABASE_SCHEMA ?? "mastra",
  disableInit: true,
});

const assistant = new Agent({
  id: "assistant",
  name: "Assistant",
  instructions: "You are a helpful assistant.",
  memory: new Memory({ storage, options: { semanticRecall: false } }),
  model: openrouter.chat("google/gemini-2.5-flash", { usage: { include: true } }),
});

const mastra = new Mastra({
  storage,
  agents: { assistant },
});

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
    vectorStore: {
      connectionString: process.env.VECTOR_DATABASE_URL || process.env.DATABASE_URL!,
      schemaName: process.env.VECTOR_DATABASE_SCHEMA ?? "vectors",
    },
    enableIdeogram: true, // requires IDEOGRAM_API_KEY
  }),
]);
```

Depends on `auth` (usage rows are attributed to users). `libs.mastra` is
optional — OpenRouter `generateText` / `generateObject` work without agents.
The app owns the injected storage and closes it during shutdown. Provision
storage and the embedding index through direct connections before startup;
see Starter's `mastra.ts` and `conversation.persistence.ts` for the complete
initialization and readiness lifecycle.

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
`showToolCalls` defaults to `true` (`false` hides tools; a string array
allowlists names).

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
  OpenRouter. The Agent uses durable PostgreSQL-backed Mastra Memory. Personal
  Threads use UserId as resource and Conversation id as thread id.
  Do not import `createAgent` / `createMastra`; they were removed in 0.34.0.
- Schema exports `chats` and `ai_usage`. After adding those tables, generate
  and apply a Drizzle migration; do not hand-edit SQL.
- The webapp mounts `/conversation` with `AiConversation`.
- Set `OPENROUTER_API_KEY` for a live reply. Hydrate still works without it.

When the flag is off, `AIModule` is not registered and the Conversation route
is omitted. Expo create does not add Conversation UI.

## Environment

`IDEOGRAM_API_KEY` when `enableIdeogram` is set; OpenRouter/Replicate clients
are constructed in app code with their own keys. Starter Conversation uses
`OPENROUTER_API_KEY`. The Kernel no longer reads `MASTRA_MAIN_DATABASE_URL` /
`MASTRA_VECTOR_DATABASE_URL`. Starter composes `PostgresStore` and `Memory` on
the app-owned Agent and Mastra instance. Runtime uses `DATABASE_URL` through
PgBouncer; provisioning uses `DATABASE_DIRECT_URL`. Optional `MASTRA_DATABASE_URL`
and `VECTOR_DATABASE_URL` overrides each have a corresponding direct URL.
Keep `app`, `mastra`, and `vectors` schemas separately owned. Provision pgvector
in `public` and run `mastra:init` before startup; normal startup never initializes
storage. The adapter retains its supported `mastra_` table names.

## Related docs

- [App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration)
- [CLI package](/packages/cli)
