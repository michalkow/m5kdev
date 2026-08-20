# Mastra Thread over chats.conversation

Conversation history is a Mastra Memory Thread (`resource` = UserId, `thread` = Conversation id), not the unused `chats.conversation` JSON column. The `chats` table stays until a maintainer-run drizzle migration drops it; do not persist new Conversations there.

## Considered Options

- **Revive `chats.conversation`** — rejected: the table is unused, the column is an untyped JSON blob, and Mastra already stores Threads when an Agent has Memory.
- **Drop `chats` in this change** — rejected: schema drops are maintainer-run migrations, not in-agent generates.
