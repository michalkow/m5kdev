# 03 — Persist Starter Conversations and embeddings in PostgreSQL

**What to build:** Starter Conversations survive restart through app-owned Mastra storage/Memory, while existing embedding upserts use pgvector without libSQL or a new retrieval API.

**Blocked by:** 01 — Run the Kernel and app repositories on PostgreSQL; 02 — Operate migrations, seed, and reset safely.

**GitHub issue:** michalkow/m5kdev#27 (parent #24)

**Status:** ready-for-agent — blocked by #25 and #26

- [ ] Verify the Mastra PostgreSQL adapter's actual schema, prefix, initialization, pool, and shutdown APIs.
- [ ] Configure separate Mastra/vector schemas and supported mastra_ names without vendor patches.
- [ ] Keep agent, Memory, and storage composition app-owned; preserve existing UserId resource isolation.
- [ ] Initialize storage before ordinary startup and report missing infrastructure clearly.
- [ ] Preserve embedding upserts with explicit model/dimensions/metric and dimension validation.
- [ ] Remove framework libSQL vector integration and close only pools/stores the owning component creates.
- [ ] Verify persistence across restart and vector behavior at the agreed public seams.
