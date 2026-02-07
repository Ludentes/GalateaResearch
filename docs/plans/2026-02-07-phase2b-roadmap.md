# Phase 2b: Memory Extraction Quality Overhaul — Roadmap

**Date:** 2026-02-07
**Status:** PLANNED
**Prerequisite:** Phase 2a COMPLETE (Graphiti infra, gatekeeper, context assembly, memory browser)
**Goal:** Fix extraction quality (18-21% → >60% recall) while preserving raw data for future improvement

---

## What We Keep From Phase 2a

These components are working and stay as-is:

| Component | File(s) | Status |
|-----------|---------|--------|
| Pattern-based gatekeeper | `server/memory/gatekeeper.ts` | Keep, extend |
| Context assembly pipeline | `server/memory/context-assembler.ts` | Keep, extend |
| Graphiti HTTP client | `server/memory/graphiti-client.ts` | Keep (graph storage) |
| Cognitive models infra | `server/memory/cognitive-models.ts` | Keep (Phase 3) |
| Memory types | `server/memory/types.ts` | Keep, extend |
| Memory Browser UI | `app/routes/memories/index.tsx` | Keep |
| DB schema (sessions, messages) | `server/db/schema.ts` | Keep, extend |
| Chat flow integration | `server/functions/chat.logic.ts` | Keep, modify |
| All 102 existing tests | `server/memory/__tests__/*` | Keep passing |

## What Changes

| Problem | Solution |
|---------|----------|
| Graphiti extracts only 18-21% of facts | Add our own extraction layer before Graphiti |
| No record of gatekeeper decisions | Add `gatekeeper_log` table |
| No extraction versioning | Add `extraction_version` + `source_id` to all memories |
| No temporal validity on facts | Add `valid_from`, `valid_until`, `superseded_by` |
| Can't supersede without deleting | Add non-lossy supersession |
| No way to reprocess old data | Raw data links on every memory |
| LLM fallback hardcoded to nothing | Pluggable `MemoryExtractor` interface |
| Can't measure extraction quality | Golden dataset validation + quality metrics |

---

## Stage 1: Database Foundation

### Task 1.1: Create `facts` table

New PostgreSQL table for extracted facts with full provenance.

**File:** `server/db/schema.ts` (extend)

```typescript
export const facts = pgTable("facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  category: text("category").notNull(),
  // 'preference' | 'policy' | 'technology' | 'decision' | 'temporal' | 'hard_rule' | 'other'
  subType: text("sub_type").notNull().default("fact"),
  // 'preference' | 'policy' | 'hard_rule' | 'fact'
  confidence: real("confidence").notNull(),
  entities: text("entities").array(),
  domain: text("domain"),

  // Temporal validity
  validFrom: timestamp("valid_from").defaultNow(),
  validUntil: timestamp("valid_until"),
  supersededBy: uuid("superseded_by"),

  // Source provenance (raw data preservation)
  sourceType: text("source_type").notNull(),
  // 'gatekeeper' | 'observation' | 'dialogue' | 'manual' | 'promotion'
  sourceId: text("source_id"),
  extractionMethod: text("extraction_method").notNull(),
  // 'pattern:preference_re' | 'pattern:policy_re' | 'ollama' | 'mem0' | 'graphiti' | 'claude'
  extractionVersion: text("extraction_version").notNull().default("v1"),
  rawUserMessage: text("raw_user_message"),
  rawAssistantMessage: text("raw_assistant_message"),

  // Multi-agent
  agentId: uuid("agent_id"),
  visibility: text("visibility").notNull().default("private"),
  // 'private' | 'team' | 'global'

  // Search
  embedding: vector("embedding", { dimensions: 768 }),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
```

### Task 1.2: Create `gatekeeper_log` table

Log every gatekeeper decision for quality measurement and reprocessing.

**File:** `server/db/schema.ts` (extend)

```typescript
export const gatekeeperLog = pgTable("gatekeeper_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp").defaultNow(),

  // Input
  userMessage: text("user_message").notNull(),
  assistantMessage: text("assistant_message").notNull(),
  sessionId: uuid("session_id").references(() => sessions.id),

  // Decision
  decision: text("decision").notNull(),
  // 'skip' | 'ingest_pattern' | 'ingest_llm' | 'ingest_failopen'
  reason: text("reason").notNull(),
  patternMatched: text("pattern_matched"),
  extractionMethod: text("extraction_method"),

  // Output
  factsExtracted: integer("facts_extracted").notNull().default(0),
  factIds: text("fact_ids").array(),

  // Versioning
  gatekeeperVersion: text("gatekeeper_version").notNull().default("v1"),
})
```

### Task 1.3: Migration

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Verification

- `\d facts` shows all columns and constraints
- `\d gatekeeper_log` shows all columns
- Existing tables (sessions, messages, personas, preprompts) unchanged
- All 102 existing tests still pass

---

## Stage 2: Pattern Library + Fact Extractor

### Task 2.1: Pattern library

Create the pattern definitions from the extraction design doc.

**File:** `server/memory/patterns.ts` (new)

5 pattern categories:
- `PREFERENCE_PATTERNS` — "I prefer X", "I like X", "I hate X"
- `POLICY_PATTERNS` — "We always X", "Our standard is X"
- `TECHNOLOGY_PATTERNS` — "Switched from X to Y", "Using X for Y"
- `DECISION_PATTERNS` — "We decided to X", "Found workaround for X"
- `TEMPORAL_PATTERNS` — "Started using X last month", "Been using X for Y"

Plus negative patterns (what NOT to extract):
- Greetings, confirmations, pure questions
- Assistant-only statements (avoid feedback loop)
- Hypotheticals/conditionals (low confidence flag)

### Task 2.2: Fact extractor (pattern-based)

**File:** `server/memory/fact-extractor.ts` (new)

```typescript
export function extractFactsWithPatterns(text: string): ExtractedFact[]
```

Pure function, no I/O. Returns array of extracted facts with category, confidence, entities, and the specific pattern that matched.

### Task 2.3: Tests for patterns + extractor

**File:** `server/memory/__tests__/patterns.test.ts` (new)
**File:** `server/memory/__tests__/fact-extractor.test.ts` (new)

Test cases derived from golden dataset (`tests/fixtures/graphiti-golden-dataset.json`):
- All 22 test cases from golden dataset
- Negation preservation ("I don't use Windows" ≠ "uses Windows")
- Entity deduplication ("Postgres" = "PostgreSQL")
- Multi-entity lists (3 separate facts)
- Conditional handling (low confidence)
- What NOT to extract (greetings, questions, assistant statements)

### Verification

- Pattern tests: all passing
- Extraction tests: all passing
- Golden dataset recall: measure and document (target: >50% for patterns alone)

---

## Stage 3: Pluggable Extraction Interface

### Task 3.1: Extractor interface

**File:** `server/memory/extractors/interface.ts` (new)

```typescript
export interface MemoryExtractor {
  name: string
  estimatedLatency: number
  cost: number
  extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]>
  isAvailable(): Promise<boolean>
}
```

### Task 3.2: Ollama extractor

**File:** `server/memory/extractors/ollama.ts` (new)

Uses AI SDK `generateText` with structured JSON prompt. Parses response into `ExtractedFact[]`. Falls back gracefully if Ollama unavailable.

### Task 3.3: Extraction orchestrator

**File:** `server/memory/extraction-orchestrator.ts` (new)

Implements `cheap-first` strategy (default): try extractors in order of cost, stop after first success.

### Task 3.4: Tests

**File:** `server/memory/extractors/__tests__/ollama.test.ts` (new)
**File:** `server/memory/__tests__/extraction-orchestrator.test.ts` (new)

### Verification

- Ollama extractor works with local model
- Orchestrator falls back correctly when extractor unavailable
- All existing tests still pass

---

## Stage 4: Unified Gatekeeper + Extraction

### Task 4.1: Extend gatekeeper with extraction

**File:** `server/memory/gatekeeper.ts` (modify)

Extend the existing gatekeeper to also perform extraction. Current flow:

```
message → pattern check → shouldIngest: boolean
```

New flow:

```
message → skip check (greetings, confirmations, questions)
        → pattern extraction (PREFERENCE_RE, POLICY_RE, etc.)
          → if match: return facts + shouldIngest=true
        → factual signal check (contains "use", "prefer", "decided", etc.)
          → if yes: mark for LLM extraction
        → default: shouldIngest=false
```

**Key change:** Gatekeeper now returns `ExtractedFact[]` in addition to the decision. This avoids duplicate work (gatekeeper checks patterns, then extraction checks patterns again).

### Task 4.2: Gatekeeper decision logging

Update the gatekeeper to log every decision to `gatekeeper_log` table.

**Fire-and-forget:** Logging must not add latency to chat flow. Use `Promise.catch(() => {})` pattern already established in Phase 2a.

### Task 4.3: Update chat flow integration

**File:** `server/functions/chat.logic.ts` (modify)

Current flow:
1. Assemble context (preprompts + Graphiti facts)
2. Generate LLM response
3. Gatekeeper evaluation
4. If shouldIngest → send to Graphiti

New flow:
1. Assemble context (preprompts + PostgreSQL facts + Graphiti graph)
2. Generate LLM response
3. Gatekeeper evaluation with extraction
4. If pattern extracted → store in `facts` table + log decision
5. If needs LLM → extract via orchestrator → store in `facts` table + log decision
6. If skip → log decision only
7. Optionally still send to Graphiti for graph relationships

### Task 4.4: Tests

Update existing gatekeeper tests to verify new extraction output.
Add tests for decision logging.

### Verification

- All 59 existing gatekeeper tests still pass (backward compatible)
- New extraction output verified for preference, policy, technology patterns
- Decision logging verified in `gatekeeper_log` table
- Chat flow works end-to-end with new extraction
- No latency regression (fire-and-forget pattern maintained)

---

## Stage 5: Fact Storage + Supersession

### Task 5.1: Fact CRUD operations

**File:** `server/db/queries/facts.ts` (new)

```typescript
export async function storeFact(fact: ExtractedFact, context: StoreContext): Promise<StoredFact>
export async function searchFacts(query: string, options: SearchOptions): Promise<StoredFact[]>
export async function supersedeFact(oldId: string, newFact: ExtractedFact, reason: string): Promise<void>
export async function getHardRules(domain?: string): Promise<StoredFact[]>
export async function getFactsByExtractionVersion(version: string): Promise<StoredFact[]>
```

`searchFacts` uses hybrid search: BM25 (text match) + vector similarity (embedding).

`getHardRules` returns all active hard rules without similarity threshold (guaranteed injection).

### Task 5.2: Deduplication

Before storing a new fact, check for semantic duplicates:
- Exact text match → skip
- High embedding similarity (>0.95) + same entities → merge (update confidence)
- Same entities + contradicting content → flag for supersession

### Task 5.3: Update context assembly

**File:** `server/memory/context-assembler.ts` (modify)

Add PostgreSQL facts as a retrieval source alongside Graphiti:

```
Current:  preprompts → Graphiti search → assemble
New:      preprompts → PostgreSQL facts → Graphiti graph → assemble
```

Priority budget allocation (8000 tokens total):
- Hard rules: 500 tokens (RESERVED, guaranteed)
- Procedures: 1500 tokens
- Facts (PostgreSQL): 4000 tokens
- Cognitive models: 1000 tokens (Phase 3)
- Episodes (Graphiti): 1000 tokens

### Task 5.4: Tests

**File:** `server/db/queries/__tests__/facts.test.ts` (new)

Test storage, search, supersession, dedup, hard rule retrieval.

### Verification

- Facts stored correctly with all provenance fields
- Search returns relevant facts ranked by score
- Supersession preserves old fact, creates new one, links them
- Dedup prevents exact duplicates
- Context assembly includes PostgreSQL facts
- Hard rules always present in context
- All existing tests still pass

---

## Stage 6: Golden Dataset Validation

### Task 6.1: Validation test suite

**File:** `tests/memory/extraction-quality.test.ts` (new)

Run the full extraction pipeline against `tests/fixtures/graphiti-golden-dataset.json`:
- For each test case: run gatekeeper + extraction
- Measure: precision (extracted facts are correct), recall (expected facts are found)
- Track: which patterns matched, which needed LLM, which missed

### Task 6.2: Edge case validation

From REFERENCE_SCENARIOS.md Scenarios 14-15:
- Greetings → no extraction
- Pure questions → no facts
- Conditionals → low confidence
- Assistant statements → no extraction
- Negation preserved correctly
- Entity deduplication working
- Multi-entity lists → separate facts
- Pronoun resolution (multi-turn context)

### Task 6.3: Quality metrics baseline

Run the validation suite and document baseline metrics:
- Pattern extraction recall (target: >50%)
- Pattern + LLM recall (target: >60%)
- Precision (target: >85%)
- False negative rate on skips (target: <5%)

### Verification

- Validation test suite runs and produces metrics
- Metrics documented in progress report
- Golden dataset recall >60% (patterns + LLM combined)
- No regressions from Phase 2a (102 existing tests pass)

---

## Stage 7: Cleanup + Documentation

### Task 7.1: Fix the 2 stale graphiti-client tests

The `maxFacts * 2` assertion issue from Phase 2a.

### Task 7.2: Update FINAL_MINIMAL_ARCHITECTURE.md

Phase 2b marked as complete with metrics.

### Task 7.3: Update Phase 2 progress document

New section documenting Phase 2b completion, extraction metrics, architectural changes.

### Task 7.4: TypeScript + lint clean

```bash
pnpm exec tsc --noEmit  # 0 errors
pnpm biome check .       # 0 warnings
```

### Verification

- 0 TypeScript errors
- 0 lint warnings
- All tests pass
- Documentation up to date

---

## Dependencies Between Stages

```
Stage 1: Database Foundation
    │
    ├──→ Stage 2: Pattern Library + Fact Extractor
    │        │
    │        ├──→ Stage 3: Pluggable Extraction Interface
    │        │        │
    │        │        └──→ Stage 4: Unified Gatekeeper + Extraction
    │        │                 │
    │        │                 └──→ Stage 5: Fact Storage + Supersession
    │        │                          │
    │        │                          └──→ Stage 6: Golden Dataset Validation
    │        │                                   │
    │        │                                   └──→ Stage 7: Cleanup
    │        │
    │        └──→ Stage 6 (patterns-only validation can start early)
    │
    └──→ Stage 4 (gatekeeper logging uses gatekeeper_log table)
```

Stages 2 and 3 can be worked in parallel (no dependencies between them).

---

## What This Does NOT Include (Deferred)

These are important but belong in later phases:

| Feature | Why Deferred | When |
|---------|-------------|------|
| Episodic memory (EpisodeRecord) | Needs observation pipeline (Phase 4) | Phase 4-6 |
| Procedural memory (Procedure) | Needs trigger matching + success tracking | Phase 6 |
| Memory promotion pipeline | Needs all memory types first | Phase 6 |
| Cognitive model integration | Needs homeostasis engine | Phase 3 |
| Confidence decay / archival | Needs data accumulation first | Phase 6 |
| Cross-agent pattern detection | Needs multi-agent setup | Phase 6+ |
| Reprocessing pipeline | Build when extraction improves | Phase 6+ |
| Embedding generation (Voyage AI) | Can use Ollama embeddings for now | Phase 3+ |

Phase 2b focuses on **semantic facts** — the most common and most testable memory type. Other memory types build on this foundation.

---

## Files Created / Modified Summary

### New Files

| File | Purpose |
|------|---------|
| `server/memory/patterns.ts` | Pattern definitions (5 categories) |
| `server/memory/fact-extractor.ts` | Pattern-based fact extraction |
| `server/memory/extractors/interface.ts` | MemoryExtractor interface |
| `server/memory/extractors/ollama.ts` | Ollama LLM extractor |
| `server/memory/extraction-orchestrator.ts` | Extraction strategy orchestrator |
| `server/db/queries/facts.ts` | Fact CRUD operations |
| `server/memory/__tests__/patterns.test.ts` | Pattern tests |
| `server/memory/__tests__/fact-extractor.test.ts` | Extraction tests |
| `server/memory/extractors/__tests__/ollama.test.ts` | Ollama extractor tests |
| `server/memory/__tests__/extraction-orchestrator.test.ts` | Orchestrator tests |
| `server/db/queries/__tests__/facts.test.ts` | Fact storage tests |
| `tests/memory/extraction-quality.test.ts` | Golden dataset validation |

### Modified Files

| File | Changes |
|------|---------|
| `server/db/schema.ts` | Add `facts` + `gatekeeper_log` tables |
| `server/memory/gatekeeper.ts` | Add extraction output + decision logging |
| `server/memory/context-assembler.ts` | Add PostgreSQL facts retrieval |
| `server/functions/chat.logic.ts` | New extraction flow |
| `server/memory/types.ts` | Add new interfaces (ExtractedFact, etc.) |

### Unchanged Files

All existing files in `server/memory/__tests__/`, `app/`, `server/routes/`, `server/providers/`, `server/integrations/`, `server/db/index.ts`, `server/db/seed.ts`.

---

## Success Criteria

| Criteria | Target |
|----------|--------|
| Golden dataset recall (patterns + LLM) | >60% |
| Extraction precision | >85% |
| False negative rate (gatekeeper skips) | <5% |
| All existing tests passing | 102/102 (fix 2 stale ones) |
| New test count | >50 new tests |
| TypeScript errors | 0 |
| Lint warnings | 0 |
| Context assembly latency | <150ms (was 50-100ms, allow +50ms for PostgreSQL) |
| Gatekeeper decisions logged | 100% |
| Every fact has source provenance | 100% |
| Every fact has extraction_version | 100% |

---

*Roadmap created: 2026-02-07*
*Related documents:*
- *[memory-lifecycle.md](./2026-02-07-memory-lifecycle.md) — Complete lifecycle design*
- *[unified-memory-extraction-design.md](./2026-02-06-unified-memory-extraction-design.md) — Extraction approach*
- *[pluggable-extraction-interface.md](./2026-02-06-pluggable-extraction-interface.md) — Extractor interface*
- *[phase2-progress.md](./2026-02-06-phase2-progress.md) — Phase 2a completion report*
