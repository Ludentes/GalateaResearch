# Known Gaps: Phase 2 Memory Layer

**Date:** 2026-02-07
**Context:** Gap analysis comparing the approved Phase 2 plan against PSYCHOLOGICAL_ARCHITECTURE.md, REFERENCE_SCENARIOS.md, and the Memory Lifecycle document.
**Plan:** See `~/.claude/plans/snappy-crafting-unicorn.md`

---

## Gaps Addressed in Phase 2 (additions to plan)

### 1. `lastRetrievedAt` on facts table

**Source:** Memory Lifecycle doc, Metric 3 (Memory Freshness)

The lifecycle doc queries `last_retrieved_at` to detect stale facts for confidence decay. The original plan omitted this column. **Added to Stage 1 schema.**

Cost: one timestamp column. Benefit: enables Phase 6 confidence decay without schema migration.

### 2. Entity normalization map

**Source:** REFERENCE_SCENARIOS.md, Scenario 15b

The scenarios explicitly require normalizing tech name variants:
- Postgres / PostgreSQL
- React.js / React / ReactJS
- k8s / Kubernetes
- JS / JavaScript, TS / TypeScript
- Node / Node.js / NodeJS
- RN / React Native
- Next / Next.js

Without this, `searchFactsByText("PostgreSQL")` won't match a fact stored as "Postgres". **Added to Stage 2 patterns.ts** as a `ENTITY_ALIASES` lookup map applied during extraction and retrieval.

---

## Gaps Accepted for Phase 2 (deferred, with reasoning)

### 3. Cognitive model types are simplified

**Source:** PSYCHOLOGICAL_ARCHITECTURE.md, Cognitive Models section

**Architecture defines:**
```
SelfModel: identity (name, role, domain), capabilities (strong, weak, tools),
           limitations, available_models[], current_state
UserModel: identity (user_id, first_seen, interaction_count),
           theories (statement, confidence, evidence_for, evidence_against),
           preferences, expertise
```

**Current implementation:**
```
SelfModel: { strengths, weaknesses, recentMisses }
UserModel: { preferences, expectations, communicationStyle }
```

**Why deferred:** The existing simplified types are sufficient for Phase 2's goal (wire cognitive models into context assembly). Phase 3's Activity Router will need `available_models` and `current_state` on SelfModel, and the Homeostasis Engine may benefit from richer UserModel. Enriching the types is a Phase 3 task — it's a consumer-side change, not a memory-layer change.

**Risk:** Low. The types can be extended without breaking existing callers.

### 4. Domain Model and Relationship Model not implemented

**Source:** PSYCHOLOGICAL_ARCHITECTURE.md (4 cognitive models defined)
**Scenarios:** 8c traces Relationship Model lifecycle (trust_level, relationship_phase)

**Why deferred:** The architecture defines 4 cognitive models (Self, User, Domain, Relationship). Phase 2 implements only Self and User. Domain and Relationship models are **consumers** of memory, not producers. The Activity Router doesn't need them. The Homeostasis Engine's 6 dimensions can function without them (communication_health doesn't require a formal relationship model).

Facts about domains and relationships CAN be stored in the general `facts` table. The formal model types can be added when Phase 3 or Phase 4 needs them.

**Risk:** Low. No Phase 3 component has a hard dependency on these models.

### 5. Memory promotion pipeline not built

**Source:** Memory Lifecycle Phase 5, REFERENCE_SCENARIOS Scenario 7

The full promotion chain: `episode -> observation -> fact -> rule -> procedure -> shared`

Promotion is how memories mature over time. It requires:
- Detecting similar episodes (needs embeddings or LLM comparison)
- Counting supporting observations without contradictions
- Circular promotion prevention
- Cross-agent pattern detection

**Why deferred to Phase 6:** Promotion is a background process, not a real-time requirement. Phase 3 (Activity Router + Homeostasis Engine) works with whatever facts and procedures exist — it doesn't care whether they were promoted or directly extracted. Phase 2 provides the storage for all memory types; Phase 6 adds the promotion logic.

**Risk:** Medium. Without promotion, facts only come from extraction (gatekeeper patterns + LLM). Manually created facts and procedures (seeds, user input) fill the gap initially. The extraction pipeline IS the primary creation pathway for Phase 2.

### 6. Cross-agent pattern detection not implemented

**Source:** REFERENCE_SCENARIOS Scenario 5, Memory Lifecycle Trace C

Detecting patterns like "Agent-Dev-1 tends to miss null checks" across multiple agents requires:
- Tracking which agent produced each fact/episode
- Querying patterns across agents
- Shared fact creation

**Why deferred to Phase 6:** Requires multi-agent deployment (Phase 3+). Single-agent Phase 2 has no cross-agent data to detect patterns from.

**Risk:** None for Phase 2-3. Becomes relevant only in Phase 4+ (multi-agent work).

### 7. Confidence decay and archival not implemented

**Source:** REFERENCE_SCENARIOS Scenario 9, Memory Lifecycle Phase 4

Facts unused for 90 days should have confidence decay. Below-threshold facts should be archived (not deleted) to cold storage.

**Why deferred to Phase 6:** Requires `lastRetrievedAt` tracking (added to Phase 2 schema) and a periodic background job. No facts will be 90 days old during Phase 2-3 development.

**Risk:** None. The `lastRetrievedAt` column is being added to facts in Stage 1, so the data will be available when we build this.

### 8. Contradiction handling is simplified

**Source:** REFERENCE_SCENARIOS Scenario 6, Memory Lifecycle Phase 4

Full contradiction resolution requires: comparing confidence levels, checking if facts address different aspects, flagging for user review, storing resolution with reasoning.

Phase 2 implements `deduplicateFact(candidate, existing) -> 'new' | 'duplicate' | 'supersede'` which handles basic cases (exact duplicates and clear supersessions). Complex contradictions (two conflicting but equally confident facts) are stored alongside each other rather than resolved.

**Why acceptable:** Most contradictions in practice are temporal supersessions ("we used JWT, now we use Clerk") which the basic logic handles. True contradictions (equal confidence, same aspect) are rare and arguably need human input anyway.

**Risk:** Low. Both facts are preserved (never-delete principle). Retrieval ranking by confidence + recency naturally surfaces the more relevant one.

### 9. pgvector / embedding-based retrieval not implemented

**Source:** Memory Lifecycle retrieval layer, PSYCHOLOGICAL_ARCHITECTURE Memory Layer

The architecture envisions embedding-based semantic search. Phase 2 uses ILIKE + word boundary text search for local facts and Graphiti's hybrid search for its knowledge.

**Why deferred:** Text search is sufficient for the current fact volume (hundreds, not millions). pgvector requires Ollama `nomic-embed-text` for embeddings, adding complexity. Can be added transparently later — the `searchFactsByText` function can be swapped to use pgvector without changing callers.

**Risk:** Low at current scale. Becomes important as fact volume grows.

### 10. Reprocessing pipeline not built

**Source:** Memory Lifecycle, Raw Data Preservation section

The ability to re-extract memories from raw data when extraction improves. Phase 2 stores all raw data (`rawUserMessage`, `rawAssistantMessage`, `extractionMethod`, `extractionVersion` on every fact), but doesn't build the reprocessing pipeline itself.

**Why deferred:** Build when we actually have improved extraction to reprocess with. The data preservation in Phase 2 makes reprocessing possible; building the pipeline before we need it is premature.

**Risk:** None. Raw data is preserved from day 1.

### 11. Multi-entity list splitting

**Source:** REFERENCE_SCENARIOS Scenario 15c

"My favorite languages are Python, JavaScript, and Rust" should produce 3 separate facts. This is an extraction quality concern handled by Stage 2's pattern library. The plan mentions golden dataset coverage but doesn't explicitly call out list splitting as a pattern.

**Action:** Ensure Stage 2 tests include list splitting cases. This is a test coverage item, not a design gap.

### 12. Episodic memory has no local table

**Source:** PSYCHOLOGICAL_ARCHITECTURE Memory Layer

Episodes (EpisodeRecord) are stored only in Graphiti via `getEpisodes()`. There is no local `episodes` table in PostgreSQL. This is intentional — Graphiti handles episodic memory well (its weakness is fact extraction, not episode storage).

**Risk:** If Graphiti is eventually removed, episode storage would need to migrate. The `homeostasis_states` table partially covers this need for Phase 3 (it tracks dimension assessments per message).

---

## Summary

| Gap | Severity | Phase 2 Action | When Fixed |
|-----|----------|----------------|------------|
| `lastRetrievedAt` column | Low | **Added to plan** | Stage 1 |
| Entity normalization | Medium | **Added to plan** | Stage 2 |
| Cognitive model richness | Low | Deferred | Phase 3 |
| Domain/Relationship models | Low | Deferred | Phase 3+ |
| Promotion pipeline | Medium | Deferred | Phase 6 |
| Cross-agent patterns | Low | Deferred | Phase 6 |
| Confidence decay | Low | Deferred | Phase 6 |
| Contradiction resolution | Low | Simplified | Phase 6 |
| pgvector embeddings | Low | Deferred | When scale demands |
| Reprocessing pipeline | Low | Deferred | When extraction improves |
| Multi-entity list splitting | Low | Test coverage | Stage 2 |
| Local episodic table | Low | Deferred | If Graphiti removed |
