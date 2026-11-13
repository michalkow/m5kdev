---
"create-m5kdev": patch
---

Generate AGENTS-only instructions that retain m5kdev conventions and reference globally installed michalkow/skills instead of bundling Claude files and Cursor rules. Treat optional PROJECT.md as the App's functional North Star and flag conflicting changes before editing. Point agents to local or GitHub upstream source for the installed release and upstream PRs when a fix is needed. Require explicit user instruction for Production deployment and database migration while allowing Development migration generation and application within the existing integrity rules; Landing-only guidance omits database operations.
