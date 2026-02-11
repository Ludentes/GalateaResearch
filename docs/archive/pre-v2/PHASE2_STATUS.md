# Phase 2: Complete Memory Layer — Status Report

**Date:** 2026-02-07 (Updated)
**Branch:** `graphiti-testing-suite`
**Tests:** 277 passing across 22 test files
**Plan:** `~/.claude/plans/snappy-crafting-unicorn.md`

---

## 🎯 Recent Updates (Session 2026-02-07)

### Memory Browser (NEW)
- ✅ **3-tab UI** at `/memories`: Local Facts, Graphiti Search, Episodes
- ✅ **Local Facts tab** shows PostgreSQL facts with category badges, confidence, entities
- ✅ **Search functionality** for filtering facts by content
- ✅ **API endpoint** `/api/memories/local-facts` for PostgreSQL fact retrieval

### Memory Clearing Utilities (FIXED)
- ✅ **Fixed critical bugs** in clear scripts (no longer exit early, directly delete graphs)
- ✅ **npm commands**: `pnpm memory:clear-graphiti`, `pnpm memory:clear-all`
- ✅ **Idempotent** — safe to run multiple times
- ✅ **Works with shared graph** — properly deletes `galatea_memory` graph

### Documentation (NEW)
- ✅ **DATA_MODEL.md** (697 lines) — Complete schema, access patterns, data flow
- ✅ **DEDUP_REDUNDANCY_ANALYSIS.md** — Redundancy problem analysis + Phase 6 roadmap
- ✅ **GRAPHITI_USAGE.md** — Integration points, optional status, configuration

### Key Findings
- **Graphiti uses ONE shared graph** (`galatea_memory`) not per-session graphs
- **Redundant facts are a known limitation** — deferred to Phase 6 promotion pipeline
- **Graceful degradation works** — system functions without Graphiti (empty sections)

---

## 1. What Is Implemented

### Stage 1: Database Schema (4 new tables)

| Table | Columns | Purpose |
|-------|---------|---------|
| `facts` | id, content, category, confidence, entities[], domain, validFrom, validUntil, supersededBy, sourceType, sourceId, extractionMethod, extractionVersion, rawUserMessage, rawAssistantMessage, lastRetrievedAt, createdAt, updatedAt | Structured fact storage with dedup, supersession, raw data preservation |
| `procedures` | id, name, triggerPattern, triggerContext[], steps (JSONB), notes, successRate, timesUsed, learnedFrom[], validUntil, supersededBy, sourceType, extractionVersion, createdAt, updatedAt | Procedure storage with trigger matching and success tracking |
| `gatekeeper_log` | id, timestamp, userMessage, assistantMessage, sessionId, decision, reason, patternMatched, extractionMethod, factsExtracted, factIds[], gatekeeperVersion | Audit log for all gatekeeper decisions |
| `homeostasis_states` | id, sessionId, messageId, knowledgeSufficiency, certaintyAlignment, progressMomentum, communicationHealth, productiveEngagement, knowledgeApplication, assessmentMethod (JSONB), assessedAt | Phase 3 readiness — 6 dimension storage |

**Seed data:** 4 procedures (Expo project, auth, NativeWind flicker fix, PR submission), 2 personas, 2 preprompts.

### Stage 2: Pattern Library + Fact Extraction

**Files:**
- `server/memory/patterns.ts` — 6 pattern categories (PREFERENCE, POLICY, TECHNOLOGY, DECISION, TEMPORAL, RELATIONSHIP) + 3 negative pattern sets (greetings, questions, confirmations) + `ENTITY_ALIASES` normalization map (30 entries: postgres→PostgreSQL, k8s→Kubernetes, etc.)
- `server/memory/fact-extractor.ts` — `extractFactsWithPatterns(userMessage, assistantMessage?)` returns `ExtractedFact[]`. Includes entity extraction against 83 known tech/tool names, conditional confidence reduction (×0.5), content entity normalization.

**Quality metrics (golden dataset, 22 cases):**
- Pattern recall: >50% (84.4% currently, 27/32 expected facts matched)
- Pattern precision: >80% (84.2% currently)
- 5 misses: 1 multi-turn coreference (needs LLM), 1 dedup variant, 3 entity-level splits

### Stage 3: Procedures Table + Trigger Matching

**File:** `server/db/queries/procedures.ts`
- `storeProcedure(db, proc)` — Store with validation
- `getProcedureByTrigger(db, trigger)` — ILIKE match on trigger_pattern
- `getProceduresByTopic(db, topic)` — Full-text search on name + notes
- `updateProcedureSuccessRate(db, id, succeeded)` — Rolling average (weight=0.3)
- `supersedeProcedure(db, oldId, newProc, reason)` — Creates new, links old via supersededBy

### Stage 4: Unified Gatekeeper with Extraction

**Modified:** `server/memory/gatekeeper.ts`
- `evaluateAndExtract(userMessage, assistantResponse)` → `{ decision, extractedFacts, needsLlmExtraction }`
- Combines existing gatekeeper decision logic with pattern-based fact extraction
- Sets `needsLlmExtraction = true` when gatekeeper says ingest but patterns find nothing
- Original `evaluateGatekeeper()` unchanged for backward compatibility

**Pluggable extractor system:**
- `server/memory/extractors/interface.ts` — `MemoryExtractor` interface (name, extract, isAvailable, estimatedLatency, cost)
- `server/memory/extractors/ollama.ts` — Ollama LLM extractor (local, $0, ~300ms)
- `server/memory/extraction-orchestrator.ts` — Cheap-first strategy: tries extractors by cost, stops after first success

### Stage 5: Fact Storage + Enhanced Context Assembly

**File:** `server/db/queries/facts.ts`
- `storeFact(db, fact)` — Store with dedup check
- `searchFactsByText(db, query, options)` — ILIKE + word boundary text search
- `getHardRules(db, domain?)` — Always injected, no confidence threshold
- `supersedeFact(db, oldId, newContent, reason)` — Create new, link old
- `deduplicateFact(db, candidate, existingFacts)` → `'new' | 'duplicate' | 'supersede'`

**Modified:** `server/memory/context-assembler.ts` — 6-section pipeline:

| Priority | Section | Source | Truncatable |
|----------|---------|--------|-------------|
| 1 | CONSTRAINTS | preprompts (priority≤10) + facts (category=hard_rule) | No |
| 2 | RELEVANT PROCEDURES | procedures table, trigger-matched, ranked by success_rate | Yes |
| 3 | RELEVANT KNOWLEDGE | local facts + Graphiti search, scored | Yes |
| 3.5 | RECENT ACTIVITY | Graphiti getEpisodes(sessionId) | Yes |
| 4 | SELF-AWARENESS | getSelfModel(personaId) | Yes |
| 5 | USER CONTEXT | getUserModel(userName) | Yes |

Scoring formula: `finalScore = textRelevance * 0.4 + recency * 0.2 + confidence * 0.3 + sourceBoost * 0.1`

### Stage 6: Cognitive Models + Episode Wiring

- `getSelfModel(personaId)` and `getUserModel(userName)` now called during context assembly when options provided
- `getEpisodes(sessionId)` retrieves recent episodes into RECENT ACTIVITY section
- Graceful degradation if Graphiti unavailable
- `episodesIncluded` metadata reflects actual episode count (no longer hardcoded 0)

### Stage 7: Chat Flow Integration

**Modified:** `server/functions/chat.logic.ts` — Full pipeline:

```
1. Store user message
2. Get conversation history
3. assembleContext(sessionId, message, budget, { personaId, userName })
4. Generate LLM response
5. Store assistant response
6. Fire-and-forget: processMemoryPipeline()
   a. evaluateAndExtract(message, response)
   b. Store extracted facts in PostgreSQL
   c. If needsLlmExtraction → runExtractionOrchestrator([ollamaExtractor])
   d. Log gatekeeper decision to gatekeeper_log
   e. If shouldIngest → ingest to Graphiti
   f. If correction → updateSelfModel
   g. If preference → updateUserModel
```

Steps 6a–6g are all fire-and-forget (zero added latency to chat response).

**File:** `server/db/queries/gatekeeper-log.ts` — `logGatekeeperDecision(db, input)` for audit trail.

---

## 2. What Is Deferred

| Item | Severity | Reasoning | When |
|------|----------|-----------|------|
| **Cognitive model type enrichment** | Low | Current simplified SelfModel/UserModel sufficient for Phase 2-3. Phase 3 Activity Router will extend with `available_models[]` and `current_state`. | Phase 3 |
| **Domain Model + Relationship Model** | Low | Architecture defines 4 cognitive models; only Self + User implemented. Domain/Relationship are consumers of memory, not producers. | Phase 3+ |
| **Memory promotion pipeline** | Medium | Full chain: episode → observation → fact → rule → procedure → shared. Requires embeddings or LLM comparison. Extraction is primary creation pathway for now. | Phase 6 |
| **Cross-agent pattern detection** | Low | Needs multi-agent deployment. Single-agent system has no cross-agent data. | Phase 6 |
| **Confidence decay + archival** | Low | Facts unused for 90 days decay confidence. `lastRetrievedAt` column added to enable this. No facts will be 90 days old during Phase 2-3. | Phase 6 |
| **Full contradiction resolution** | Low | Basic dedup/supersede handles temporal cases ("switched from X to Y"). True contradictions stored alongside each other, ranked by confidence+recency. | Phase 6 |
| **pgvector embeddings** | Low | ILIKE text search sufficient for current scale (hundreds of facts). `searchFactsByText` can be swapped to pgvector without changing callers. | When scale demands |
| **Reprocessing pipeline** | Low | Raw data preserved (`rawUserMessage`, `rawAssistantMessage`, `extractionVersion`). Build pipeline when extraction improves. | When needed |
| **Multi-entity list splitting** | Low | "Python, JavaScript, and Rust" produces 1 fact (not 3). Patterns extract all entities but don't split into separate facts. | Phase 6 |
| **Local episodic memory table** | Low | Episodes stored in Graphiti only. `homeostasis_states` table partially covers this need for Phase 3. | If Graphiti removed |
| **Observation pipeline / OTEL** | Low | Phase 4 concern. Memory layer stores facts and procedures; observation layer is separate. | Phase 4 |

---

## 3. Phase 3 Readiness Verification

Phase 3 introduces the **Homeostasis Engine** (6-dimension balance-seeking) and **Activity Router** (level 0-3 classification).

### Dependencies checked:

| Phase 3 Need | Provided By | Status |
|---|---|---|
| `getProcedureByTrigger(trigger)` | `server/db/queries/procedures.ts` | ✅ Ready |
| `procedure.successRate` for ranking | procedures table + `updateProcedureSuccessRate()` | ✅ Ready |
| `searchFactsByText(topic)` | `server/db/queries/facts.ts` | ✅ Ready |
| `getHardRules(domain?)` | `server/db/queries/facts.ts` | ✅ Ready |
| `getEpisodes(sessionId)` for trending | `server/memory/graphiti-client.ts` wired into context | ✅ Ready |
| Homeostasis state storage | `homeostasis_states` table (6 dimensions + assessmentMethod JSONB) | ✅ Ready |
| Activity level on messages | `messages.activityLevel` column exists | ✅ Ready (Phase 3 writes) |
| Context with 6 sections | CONSTRAINTS, PROCEDURES, KNOWLEDGE, RECENT ACTIVITY, SELF-AWARENESS, USER CONTEXT | ✅ Ready |
| Cognitive models in prompts | `getSelfModel` / `getUserModel` called in `assembleContext` | ✅ Ready |
| Fact supersession | `supersedeFact()` in facts queries | ✅ Ready |
| Gatekeeper decision audit | `gatekeeper_log` table + `logGatekeeperDecision()` | ✅ Ready |
| Raw data preservation | `rawUserMessage`, `rawAssistantMessage` on every fact | ✅ Ready |
| Fire-and-forget extraction | `processMemoryPipeline()` in chat.logic.ts | ✅ Ready |

### Phase 3 will need to add:

1. **Homeostasis guidance section** — New context section (priority 6) with `guidance.yaml` mapping dimension states to guidance text. This is a Phase 3 creation, not a Phase 2 gap.
2. **Extend SelfModel** — Add `available_models[]` and `current_state` for Activity Router model selection. Backwards-compatible extension.
3. **Homeostasis state queries** — `server/db/queries/homeostasis-states.ts` (CRUD for the existing table). Phase 3 builds this.

**Verdict: The memory layer is sufficient for Phase 3. No blocking gaps.**

### Potential forgotten items (checked):

- **Token budget for homeostasis section**: The `ContextBudget` type has `total`, `hardRules`, `procedures`, `facts`, `models`, `episodes`. Phase 3 may want to add `homeostasis` budget. Non-blocking — it can share the `models` budget or be extended.
- **Gatekeeper log cleanup**: No TTL or cleanup mechanism for `gatekeeper_log`. Will grow indefinitely. Low priority — add cleanup in Phase 6 alongside confidence decay.
- **Procedure learning from extraction**: Procedures are currently only created via seed data or manual insert. The extraction pipeline doesn't auto-create procedures from conversation. This is by design (deferred to promotion pipeline, Phase 6).

---

## 4. Manual Test Scenario

### Prerequisites

```bash
# Ensure Docker services are running
docker compose up -d postgres falkordb graphiti

# Ensure database is migrated and seeded
pnpm drizzle-kit migrate
pnpm tsx server/db/seed.ts
```

### Step 1: Verify Schema

```bash
docker exec -it galatea-postgres psql -U galatea -d galatea -c "\dt"
```

**Expected:** 8 tables listed: `sessions`, `messages`, `personas`, `preprompts`, `facts`, `procedures`, `gatekeeper_log`, `homeostasis_states`.

```bash
docker exec -it galatea-postgres psql -U galatea -d galatea -c "SELECT count(*) FROM procedures;"
```

**Expected:** `4` (the 4 seed procedures).

### Step 2: Verify Pattern Extraction (unit)

```bash
pnpm vitest run server/memory/__tests__/fact-extractor.test.ts
```

**Expected:** 24 tests pass. Output includes tests for preference, policy, technology, decision, temporal, relationship extraction, negation preservation, entity normalization, conditional handling, and negative cases (greetings return empty).

### Step 3: Verify Gatekeeper Integration (unit)

```bash
pnpm vitest run server/memory/__tests__/gatekeeper.unit.test.ts
```

**Expected:** 59+ tests pass. Includes both original `evaluateGatekeeper` tests and new `evaluateAndExtract` tests.

### Step 4: Verify Golden Dataset Quality

```bash
pnpm vitest run tests/memory/extraction-quality.test.ts
```

**Expected:** All tests pass. Console output shows:
- `Pattern recall: 27/32 = 84.4%` (or similar, >50% threshold)
- `Pattern precision: 16/19 = 84.2%` (or similar, >80% threshold)

### Step 5: Verify Context Assembly (unit)

```bash
pnpm vitest run server/memory/__tests__/context-assembler.unit.test.ts
```

**Expected:** 23 tests pass. Includes tests for all 6 context sections (CONSTRAINTS, PROCEDURES, KNOWLEDGE, RECENT ACTIVITY, SELF-AWARENESS, USER CONTEXT), token budget enforcement, and graceful degradation.

### Step 6: Verify End-to-End Pipeline (integration, requires PostgreSQL)

```bash
pnpm vitest run tests/memory/phase2-complete.test.ts
```

**Expected:** 4 tests pass:
1. **Full pipeline** — Stores "I prefer dark mode", verifies fact appears in PostgreSQL with category=preference, raw data preserved, gatekeeper_log entry created with decision=ingest_pattern.
2. **Greeting skip** — "Hello!" produces no facts, gatekeeper_log shows decision=skip.
3. **Policy extraction** — "We always use TypeScript" stores fact with category=policy, rawUserMessage preserved.
4. **Deduplication** — Storing same preference twice doesn't create duplicate facts.

### Step 7: Verify Chat Flow Integration (requires PostgreSQL)

```bash
pnpm vitest run server/functions/__tests__/chat.unit.test.ts
```

**Expected:** 3 tests pass:
1. `createSessionLogic` creates a session
2. `getSessionMessagesLogic` returns empty for new session
3. `sendMessageLogic` stores user message and mocked response with correct model/token fields

### Step 8: Verify Full Test Suite

```bash
pnpm vitest run
```

**Expected:** `22 passed` test files, `277 passed` tests, 0 failures.

### Step 9: Verify No Type Errors

```bash
pnpm exec tsc --noEmit
```

**Expected:** No errors (clean exit code 0).

### Step 10: Manual Chat Test (requires Ollama + running server)

If Ollama is running with a model and the dev server is up:

```bash
# Start the server
pnpm dev

# In another terminal, create a session
curl -X POST http://localhost:3000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Session"}'
# Expected: { "id": "<uuid>", "name": "Test Session", ... }

# Send a preference message
curl -X POST http://localhost:3000/api/chat/sessions/<session-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "I prefer using TypeScript for all new projects"}'
# Expected: AI response text

# Wait 2 seconds for fire-and-forget pipeline, then check facts
docker exec -it galatea-postgres psql -U galatea -d galatea \
  -c "SELECT id, content, category, confidence, entities, extraction_method FROM facts ORDER BY created_at DESC LIMIT 5;"
# Expected: A row with content containing "TypeScript", category="preference" or "policy",
#           confidence ≥ 0.85, entities containing "TypeScript"

# Check gatekeeper log
docker exec -it galatea-postgres psql -U galatea -d galatea \
  -c "SELECT decision, reason, facts_extracted FROM gatekeeper_log ORDER BY timestamp DESC LIMIT 5;"
# Expected: A row with decision="ingest_pattern", facts_extracted ≥ 1

# Send a greeting (should NOT create facts)
curl -X POST http://localhost:3000/api/chat/sessions/<session-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'

# Check gatekeeper log again
docker exec -it galatea-postgres psql -U galatea -d galatea \
  -c "SELECT decision, reason FROM gatekeeper_log ORDER BY timestamp DESC LIMIT 1;"
# Expected: decision="skip", reason contains "greeting" or "short"
```

### Step 11: Verify Procedure Trigger Matching

```bash
docker exec -it galatea-postgres psql -U galatea -d galatea \
  -c "SELECT name, trigger_pattern, success_rate FROM procedures;"
```

**Expected:** 4 procedures with success_rate = 1.0 (initial), trigger patterns like "Need to create new mobile app", "Need auth in mobile app", "Pressable animation flickering", "Feature complete, ready for review".

---

## Additional Tools & Features

### Memory Browser UI

**File:** `app/routes/memories/index.tsx`
**API Endpoint:** `server/routes/api/memories/local-facts.get.ts`

**Features:**
- **3-tab interface:**
  1. **Local Facts** (default) — PostgreSQL facts from pattern/LLM extraction
  2. **Graphiti Search** — Hybrid search of FalkorDB knowledge graph
  3. **Episodes** — Recent conversation episodes from Graphiti

**Local Facts Display:**
- Category badges with color coding (preference=blue, policy=purple, technology=green, decision=orange, temporal=pink, other=gray)
- Confidence percentage (e.g., "85% confidence")
- Entity tags (normalized: "PostgreSQL", "React", etc.)
- Extraction method (e.g., "pattern:preference_re", "ollama")
- Search functionality with ILIKE text matching
- Recent facts view (last 50 by default)

**Access:**
```bash
# Navigate to Memory Browser
http://localhost:5173/memories
```

**API:**
```bash
# Get local facts (all)
GET /api/memories/local-facts?limit=50

# Search local facts
GET /api/memories/local-facts?query=PostgreSQL&limit=50

# Graphiti search (hybrid)
GET /api/memories/search?query=PostgreSQL&max_facts=20

# Episodes for session
GET /api/memories/episodes?group_id={sessionId}&last_n=20
```

---

### Memory Clearing Utilities

**Scripts:**
- `scripts/clear-graphiti-memory.ts` — Clear FalkorDB graphs only
- `scripts/clear-all-memory.ts` — Clear FalkorDB + PostgreSQL

**NPM Commands:**
```bash
# Clear only Graphiti/FalkorDB (preserves PostgreSQL)
pnpm memory:clear-graphiti

# Clear everything (PostgreSQL + FalkorDB)
pnpm memory:clear-all
```

**What They Do:**

**`clear-graphiti-memory`:**
- Lists all graphs in FalkorDB via `redis-cli GRAPH.LIST`
- Deletes each graph via `redis-cli GRAPH.DELETE "{graph}"`
- Does NOT delete PostgreSQL data
- Idempotent — safe to run multiple times

**`clear-all-memory`:**
- Deletes all FalkorDB graphs (via redis-cli)
- Deletes PostgreSQL data in FK-safe order:
  1. `gatekeeper_log` (references sessions)
  2. `facts`
  3. `messages` (references sessions)
  4. `sessions`
- Preserves: personas, preprompts, procedures
- Graceful error handling — continues even if some operations fail

**Fixed Issues:**
- ✅ No longer requires sessions to exist in PostgreSQL
- ✅ Directly deletes FalkorDB graphs instead of relying on Graphiti API
- ✅ Works with `FALKORDB_DATABASE: "galatea_memory"` shared graph config

**Example Output:**
```bash
$ pnpm memory:clear-graphiti

Found 3 graph(s): galatea_memory, galatea_test, e49ee8d0-...
Deleting graph "galatea_memory"... ✓
Deleting graph "galatea_test"... ✓
Deleting graph "e49ee8d0-..."... ✓

✅ Done: 3 deleted, 0 failed
```

---

### Documentation

**Comprehensive docs created:**

1. **`docs/DATA_MODEL.md`** (697 lines)
   - Complete PostgreSQL schema (8 tables with columns, indexes, access patterns)
   - FalkorDB/Graphiti schema (node types, edge types, properties)
   - Data flow diagram (user message → storage → retrieval)
   - Access pattern summary (read-heavy, write-heavy)
   - Consistency model (ACID vs eventual)
   - Scaling considerations and maintenance tasks

2. **`docs/DEDUP_REDUNDANCY_ANALYSIS.md`**
   - Problem statement (redundant facts in conversation)
   - Full trace (gatekeeper → extraction → storage → retrieval)
   - Root causes (no semantic dedup, no clustering)
   - Impact assessment (token waste, prompt clutter)
   - What Phase 6 will fix (promotion pipeline)

3. **`docs/GRAPHITI_USAGE.md`**
   - Clarifies Graphiti is optional (graceful degradation)
   - 4 integration points documented
   - What breaks without Graphiti (RELEVANT KNOWLEDGE, RECENT ACTIVITY sections empty)
   - Division of labor (PostgreSQL vs Graphiti)
   - Current configuration (`FALKORDB_DATABASE: "galatea_memory"`)

4. **`docs/KNOWN_GAPS.md`** (from Phase 2a)
   - 12 deferred items with severity and reasoning
   - Phase 6 roadmap (promotion, decay, archival)

5. **`docs/PHASE2_STATUS.md`** (this file)
   - What is implemented (7 stages)
   - What is deferred (11 items)
   - Phase 3 readiness verification
   - Manual test scenario

---

## File Inventory (31 Phase 2 files)

### Core memory modules (8)
- `server/memory/types.ts`
- `server/memory/graphiti-client.ts`
- `server/memory/gatekeeper.ts`
- `server/memory/context-assembler.ts`
- `server/memory/cognitive-models.ts`
- `server/memory/fact-extractor.ts`
- `server/memory/patterns.ts`
- `server/memory/extraction-orchestrator.ts`

### Extractor implementations (2)
- `server/memory/extractors/interface.ts`
- `server/memory/extractors/ollama.ts`

### Database queries (3)
- `server/db/queries/facts.ts`
- `server/db/queries/procedures.ts`
- `server/db/queries/gatekeeper-log.ts`

### Test files (13)
- `server/memory/__tests__/gatekeeper.unit.test.ts`
- `server/memory/__tests__/context-assembler.unit.test.ts`
- `server/memory/__tests__/cognitive-models.unit.test.ts`
- `server/memory/__tests__/cognitive-integration.test.ts`
- `server/memory/__tests__/fact-extractor.test.ts`
- `server/memory/__tests__/patterns.test.ts`
- `server/memory/__tests__/extraction-orchestrator.test.ts`
- `server/memory/extractors/__tests__/ollama.test.ts`
- `server/db/queries/__tests__/facts.test.ts`
- `server/db/queries/__tests__/procedures.test.ts`
- `server/db/__tests__/new-tables.test.ts`
- `tests/memory/extraction-quality.test.ts`
- `tests/memory/phase2-complete.test.ts`

### API routes (4)
- `server/routes/api/memories/local-facts.get.ts` — PostgreSQL facts endpoint
- `server/routes/api/memories/search.get.ts` — Graphiti search endpoint
- `server/routes/api/memories/episodes.get.ts` — Episodes endpoint
- `server/routes/api/memories/sessions.get.ts` — Sessions list endpoint

### UI components (1)
- `app/routes/memories/index.tsx` — Memory Browser (3-tab interface)

### Utility scripts (2)
- `scripts/clear-graphiti-memory.ts` — Clear FalkorDB graphs
- `scripts/clear-all-memory.ts` — Clear FalkorDB + PostgreSQL

### Documentation (5)
- `docs/DATA_MODEL.md` — Complete data model (PostgreSQL + FalkorDB)
- `docs/DEDUP_REDUNDANCY_ANALYSIS.md` — Redundancy problem analysis
- `docs/GRAPHITI_USAGE.md` — Graphiti integration guide
- `docs/KNOWN_GAPS.md` — Deferred items (from Phase 2a)
- `docs/PHASE2_STATUS.md` — This file
