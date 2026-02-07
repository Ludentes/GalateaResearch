# Phase 2: Memory System — Progress Tracker

**Plan:** [2026-02-05-phase2-memory-system-design.md](./2026-02-05-phase2-memory-system-design.md)
**Research:** [2026-02-05-graphiti-ecosystem-research.md](./2026-02-05-graphiti-ecosystem-research.md)
**Original Design:** [2026-02-02-memory-system-design.md](./2026-02-02-memory-system-design.md)
**Started:** 2026-02-05
**Branch:** TBD

---

## Scope Notes

**Auth**: Not implemented, not needed. See Phase 1 scope notes.

**Simplifications vs Original Design**: Phase 2 uses Graphiti's native entity model (Entity nodes + RELATES_TO edges) rather than the original design's rich node/edge taxonomy. No Memory Router, no promotion engine, no custom edge types. These are deferred to Phase 3+. See "What's NOT in Phase 2" in the design doc.

**Graphiti response types**: Marked as PROVISIONAL in the design. Must be verified against actual Swagger docs during Stage A and updated before Stage B.

---

## Prerequisites

| # | Prerequisite | Status | Notes |
|---|-------------|--------|-------|
| P1 | Verify `zepai/graphiti` image supports FalkorDB | TODO | If not, build custom image from repo |
| P2 | Pull `gpt-oss:latest` in Ollama (20GB) | TODO | Verify VRAM/RAM budget |
| P3 | Pull `nomic-embed-text` in Ollama | TODO | 768-dim vectors — verify Graphiti index compatibility |
| P4 | Docker Compose healthy (PostgreSQL + FalkorDB) | DONE | Phase 1 |
| P5 | Capture actual Graphiti API response shapes | TODO | Hit Swagger, update types.ts |

---

## Tasks

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| **Stage A: Graphiti Sidecar Deployment** | | | |
| A1 | Add Graphiti service to docker-compose.yml | TODO | | Port 18000, extra_hosts for Linux |
| A2 | Configure Ollama as LLM + embedding provider | TODO | | gpt-oss:latest + nomic-embed-text |
| A3 | Verify healthcheck returns healthy | TODO | | `GET /healthcheck` |
| A4 | POST test episode, verify 202 Accepted | TODO | | |
| A5 | POST search, verify results from test data | TODO | | |
| A6 | Capture actual API response shapes from Swagger | TODO | | Update provisional types |
| A7 | Update .env.example with Graphiti vars | TODO | | |
| A8 | Save sample responses as test fixtures | TODO | | `server/memory/__tests__/fixtures/` |
| A9 | Write integration test: sidecar health + add/search | TODO | | |
| **Stage B: TypeScript Client + Basic Ingestion** | | | |
| B1 | Create `server/memory/types.ts` | TODO | | Update with real API shapes from A6 |
| B2 | Create `server/memory/graphiti-client.ts` | TODO | | HTTP wrapper with timeouts (2s/5s/1s) |
| B3 | Wire ingestion into `chat.logic.ts` onFinish | TODO | | Both streamMessageLogic + sendMessageLogic |
| B4 | Use sessionId as group_id for episode isolation | TODO | | |
| B5 | Unit tests for client (mocked HTTP) | TODO | | |
| B6 | Integration test: chat message → episode in Graphiti | TODO | | |
| **Stage C: Context Assembly** | | | |
| C1 | Create `server/memory/constants.ts` | TODO | | Budgets, weights, scoring coefficients |
| C2 | Create `server/memory/context-assembler.ts` | TODO | | 6-step pipeline |
| C3 | Integrate into chat.logic.ts (both logic functions) | TODO | | Replace preprompt concatenation |
| C4 | Add graceful degradation (fallback to preprompts) | TODO | | try/catch around assembleContext() |
| C5 | Hard rules always included regardless of Graphiti | TODO | | |
| C6 | Log assembly metadata via Langfuse | TODO | | Token counts, retrieval stats, timing |
| C7 | Unit tests with mocked Graphiti client | TODO | | |
| C8 | Integration test: enriched prompts include Graphiti knowledge | TODO | | |
| **Stage D: Memory Panel UI** | | | |
| D1 | Create `app/routes/memories/index.tsx` | TODO | | Memory browser page |
| D2 | Create Nitro route `GET /api/memories/search` | TODO | | Proxy to Graphiti search |
| D3 | Create Nitro route `GET /api/memories/episodes` | TODO | | Proxy to Graphiti episodes |
| D4 | UI: recent episodes, entities, relationships, search | TODO | | |
| **Stage E: Memory Gatekeeper** | | | |
| E1 | Create `server/memory/gatekeeper.ts` | TODO | | LLM-based filter, fail-open policy |
| E2 | Rules-based fast path (always keep/skip lists) | TODO | | |
| E3 | Wire into chat.logic.ts ingestion flow | TODO | | Before Graphiti POST |
| E4 | Make gatekeeper configurable (can disable) | TODO | | |
| E5 | Unit tests with example conversations | TODO | | |
| E6 | Integration test: general knowledge filtered, specific kept | TODO | | |
| **Stage F: Cognitive Models** | | | |
| F1 | Create `server/memory/cognitive-models.ts` | TODO | | getSelfModel, getUserModel, updateSelfModel, updateUserModel |
| F2 | Define when to update models | TODO | | After corrections, errors, preference expressions |
| F3 | Integrate into context assembly (sections 4 & 5) | TODO | | |
| F4 | Use POST /entity-node for explicit model creation | TODO | | Not episode ingestion |
| F5 | Direct FalkorDB Cypher for structured model retrieval | TODO | | Via getGraph("galatea_memory") |
| F6 | Unit tests with mocked graph data | TODO | | |
| F7 | Integration test: correction → self-model updated → next response includes self-awareness | TODO | | |

---

## Verification Log

*(Entries added as tasks are completed and verified)*

---

## Key Lessons Learned

*(Updated during implementation)*

---

*Created: 2026-02-05*
*Updated: 2026-02-05*
