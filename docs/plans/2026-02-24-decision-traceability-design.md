# Decision Traceability for Evidence-Based Memory — Design

> **Part 1 of additional work for evidence-based memory lifecycle**

**Goal:** Make every pipeline decision traceable and debuggable. Answer questions like "Why isn't entry X in CLAUDE.md?" or "Why was this routed to skills?" with a concrete chain of decisions, each showing the exact values that fed the outcome.

**Architecture:** Per-entry decision log (Option A) + structured Langfuse spans (Option C) + a `pipelineRunId` trace key that correlates entries within a run and maps to Langfuse.

---

## Problem

The memory pipeline currently makes decisions silently. Entry X goes into the `skipped` bucket with reason `"below threshold, uncurated, or enforced by hook"` — but which threshold? What was the confidence? What was the config? The developer must read code and mentally replay the logic.

Worse, two consumption paths exist and neither is traced:

1. **Artifact generation path** — store → router → CLAUDE.md / skills / hooks
2. **Context assembly path** — store → retrieval → context assembler → system prompt

An entry can be "routed to CLAUDE.md" but never appear in the agent's prompt because it was truncated by the token budget. Or an entry can exist in the store but never reach routing because retrieval didn't surface it. These are invisible today.

---

## Prior Art in Codebase

**fact-retrieval.ts already has tracing.** The `PipelineTrace` / `TraceStep` / `TraceDetail` types provide per-entry decision logs for the keyword retrieval pipeline. This is good design — we should unify with it rather than introduce a parallel system.

Current `TraceDetail`:
```typescript
interface TraceDetail {
  id: string
  content: string       // first 80 chars
  action: "pass" | "filter"
  reason: string
  values?: Record<string, unknown>
}
```

This is close to what we need, but missing: stage name (it's on the parent `TraceStep`), timestamp, and the pipeline run correlation key.

**SectionAccounting** in context-assembler.ts tracks token budget usage per section, including `truncated` and `droppedEntries`. This partially answers "why was this entry not in the prompt?" but doesn't identify which specific entries were dropped.

---

## Design

### The DecisionStep Type

Each pipeline stage appends decisions to entries as they flow through:

```typescript
interface DecisionStep {
  stage: DecisionStage
  action: DecisionAction
  reason: string
  inputs?: Record<string, number | string | boolean>
  timestamp: string
  pipelineRunId: string
}

type DecisionStage =
  | "extraction"        // LLM extracted this entry
  | "novelty-gate"      // novelty classification + general-knowledge filter
  | "dedup"             // Jaccard / embedding similarity check
  | "retrieval"         // vector or keyword retrieval scored/filtered
  | "context-assembly"  // included in or truncated from system prompt
  | "router"            // channel routing decision
  | "accumulation"      // batching for artifact regeneration
  | "claude-md-gen"     // written to or cut from CLAUDE.md
  | "skill-gen"         // written to skill file
  | "hook-gen"          // converted to hook pattern
  | "decay"             // confidence reduced or archived
  | "feedback"          // outcome recorded

type DecisionAction =
  | "pass"          // entry continues to next stage
  | "drop"          // entry removed from pipeline
  | "cap"           // numeric value capped (e.g., inferred confidence)
  | "auto-approve"  // curation auto-approved
  | "route"         // routed to a specific channel
  | "skip"          // not selected (below threshold, budget exceeded, etc.)
  | "decay"         // confidence reduced
  | "archive"       // below threshold, marked archived
  | "defer"         // curation deferred
  | "reject"        // curation rejected
  | "record"        // feedback outcome recorded
```

The `inputs` field captures the numeric context — threshold values, scores, config settings — so you see _exactly_ which number didn't pass which threshold. For example: `{ confidence: 0.85, threshold: 0.90, curationStatus: "approved" }`.

### Pipeline Run ID

Generated once per pipeline invocation (extraction cycle, decay run, retrieval query, etc.) and threaded through all stages:

```typescript
function createPipelineRunId(stage: string): string {
  return `${stage}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
}
```

The same ID becomes the Langfuse span name, enabling jump between per-entry trace → Langfuse dashboard.

### Storing Decisions

Add `decisions?: DecisionStep[]` to `KnowledgeEntry`. Decisions accumulate over the entry's lifetime. To prevent unbounded growth:

- Keep only the **last N decisions per stage** (e.g., last 3 decay runs, not all 100)
- Cap total decisions at 50 per entry
- Older decisions are summarized: `{ stage: "decay", action: "decay", reason: "12 prior decay runs summarized", inputs: { firstRun: "...", lastRun: "...", totalDecayPercent: 45 } }`

### Unifying with fact-retrieval.ts TraceDetail

The existing `TraceDetail` maps cleanly to `DecisionStep`:

| TraceDetail field | DecisionStep field |
|---|---|
| `id` | (on the entry, not the step) |
| `content` | (on the entry, not the step) |
| `action: "pass" \| "filter"` | `action` (expanded set) |
| `reason` | `reason` |
| `values?` | `inputs?` |

The existing `PipelineTrace` / `TraceStep` structure stays as the **retrieval-level trace** (per-query). `DecisionStep` is the **entry-level trace** (per-entry across its lifecycle). They're complementary:

- `PipelineTrace` answers: "What happened during this retrieval query?"
- `DecisionStep[]` answers: "What has happened to this entry over its lifetime?"

The retrieval stage writes both: a `TraceStep` into the `PipelineTrace` AND a `DecisionStep` onto each entry.

### Langfuse Integration (Option C)

Each pipeline run creates a Langfuse span with:
- Span name: `memory-pipeline:{stage}` (e.g., `memory-pipeline:extraction`)
- Span ID: the `pipelineRunId`
- Metadata: entry count, config snapshot, stage-specific stats
- Events: one per decision (entry ID + action + reason)

This uses the existing `@langfuse/otel` + `@opentelemetry/sdk-node` setup (Nitro plugin at `server/plugins/langfuse.ts`). No new dependencies.

---

## What Each Stage Records

### Extraction (knowledge-extractor.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `pass` | "extracted from transcript" | `{ type, confidence, novelty, origin }` |

### Novelty Gate (knowledge-extractor.ts `applyNoveltyGateAndApproval`)

| Action | Reason | Inputs |
|--------|--------|--------|
| `drop` | "general-knowledge filtered" | `{ novelty: "general-knowledge" }` |
| `pass` | "novelty accepted" | `{ novelty }` |
| `cap` | "inferred confidence capped" | `{ originalConfidence, cappedTo: 0.70, origin: "inferred" }` |
| `auto-approve` | "explicit-statement >= threshold" | `{ confidence, threshold: 0.90 }` |
| `pass` | "pending curation" | `{ origin, confidence }` |

### Dedup (knowledge-store.ts dedup logic)

| Action | Reason | Inputs |
|--------|--------|--------|
| `drop` | "near-duplicate of entry {id}" | `{ similarity, threshold, matchedEntryId }` |
| `pass` | "no duplicates found" | `{ bestMatch, threshold }` |

### Retrieval (vector-retrieval.ts / fact-retrieval.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `pass` | "vector search: composite score above threshold" | `{ compositeScore, similarity, recency, confidence, threshold }` |
| `pass` | "entity match" | `{ entity, matchType: "about" \| "entities" \| "content" }` |
| `pass` | "keyword overlap above threshold" | `{ overlap, threshold }` |
| `skip` | "below score threshold" | `{ compositeScore, threshold }` |
| `skip` | "exceeded max_entries limit" | `{ rank, maxEntries }` |
| `pass` | "hard rule: always included" | `{ type: "rule", confidence: 1.0 }` |

### Context Assembly (context-assembler.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `pass` | "included in {section} section" | `{ section, tokensBefore, tokensAfter }` |
| `skip` | "truncated: token budget exhausted" | `{ section, budgetUsed, budgetTotal, entryTokens }` |
| `pass` | "hard rule: never truncated" | `{ section: "CONSTRAINTS" }` |

### Router (channel-router.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `route` | "tool-constraint pattern → hooks" | `{ channel: "hook", patternMatched: true }` |
| `route` | "approved procedure → skills" | `{ channel: "skill", rank, score, maxCount }` |
| `route` | "approved entry → CLAUDE.md" | `{ channel: "claude-md", score, rank }` |
| `skip` | "confidence below threshold" | `{ confidence, threshold, channel }` |
| `skip` | "not curated" | `{ curationStatus: "pending" }` |
| `skip` | "exceeded skill budget" | `{ rank, maxCount: 3 }` |
| `skip` | "exceeded CLAUDE.md line budget" | `{ lineCount, budget, entryLines }` |
| `skip` | "superseded or archived" | `{ supersededBy?, archivedAt? }` |

### Decay (decay.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `pass` | "within grace period" | `{ daysSince, graceDays, origin, multiplier }` |
| `pass` | "exempt type" | `{ type: "rule" }` |
| `pass` | "hook-enforced: exempt" | `{ enforcedBy: "hook" }` |
| `decay` | "confidence reduced" | `{ from, to, factor, effectiveFactor, decayDays, impactScore }` |
| `archive` | "below archive threshold" | `{ confidence, threshold }` |

### Feedback (feedback-loop.ts)

| Action | Reason | Inputs |
|--------|--------|--------|
| `record` | "outcome recorded" | `{ status, sessionsExposed, sessionsHelpful, sessionsHarmful, impactScore }` |

---

## Re-wiring Qdrant Vector Retrieval

Qdrant integration is fully implemented but dormant:

- `qdrant-client.ts` — thin REST client (188 lines)
- `vector-retrieval.ts` — vector search + composite re-ranking (189 lines)
- `fact-retrieval.ts` — dispatcher with `useVector` flag (361 lines)
- 12 unit tests passing

**What's needed to activate:**

1. **Add Qdrant service to docker-compose.yml** — Qdrant 1.13 (latest stable), port 6333, persistent volume
2. **Flip `useVector: true`** in call sites (tick.ts, chat.logic.ts, trace.post.ts) — behind config flag in config.yaml
3. **Add retrieval config** — `retrieval.use_vector: true`, `retrieval.qdrant_url: http://localhost:6333`, `retrieval.ollama_embed_url: http://localhost:11434`
4. **Run sync script** — `pnpm exec tsx scripts/sync-qdrant.ts` to populate collection from existing entries
5. **Add decision tracing** to vector-retrieval.ts — record `DecisionStep` on each entry with composite score breakdown

The graceful degradation already works: when Qdrant is unavailable, falls back to keyword retrieval. No breaking change.

---

## Additional Gherkin Scenarios (Test Data)

These "test data" scenarios validate pipeline paths NOT covered by the original 10 scenarios. They test the traceability system itself and edge cases in the wiring:

### S11: Retrieval filtering — vector search excludes low-relevance entry

```gherkin
Given an entry "Project uses PostgreSQL 17" with confidence 0.95
  And the agent receives a message about "React Native styling"
When vector retrieval runs
Then the entry's decisions include retrieval/skip with composite score below threshold
  And the Langfuse span shows the retrieval run with entry count
```

### S12: Context assembly truncation — entry routed to CLAUDE.md but truncated

```gherkin
Given 50 approved entries each 5 lines long (250 total lines)
  And CLAUDE.md max_lines is 200
When the router runs
Then 40 entries route to claude-md (200 lines)
  And 10 entries have router/skip with reason "exceeded CLAUDE.md line budget"
  And each skipped entry's decisions show its rank and the budget state
```

### S13: Full traceability — query entry decisions by ID

```gherkin
Given an entry that was extracted, deduplicated, retrieved, assembled, and routed
When we read the entry's decisions array
Then it contains steps for: extraction, novelty-gate, retrieval, context-assembly, router
  And each step has a pipelineRunId
  And all steps from the same pipeline run share the same pipelineRunId
```

### S14: Qdrant fallback — vector unavailable, keyword takes over

```gherkin
Given Qdrant is not running
  And 10 entries exist in the store
When retrieval runs with useVector: true
Then it falls back to keyword retrieval
  And entries get retrieval/pass with inputs showing method: "keyword_fallback"
```

### S15: Decision cap — old entry doesn't accumulate unbounded decisions

```gherkin
Given an entry with 50 existing decisions
When a new decay run adds another decision
Then the total decisions count stays at 50
  And the oldest decisions are summarized
```

---

## Non-Goals

- **Cognitive model tracing** — cognitive models are filtered views (`entriesByEntity`), not decision points. If we add model-specific logic later, trace it then.
- **Work-to-Knowledge tracing** — uses the same `KnowledgeEntry` pipeline. The `source` field already distinguishes `session:xxx` vs `task:xxx`.
- **Real-time dashboard** — Langfuse provides the dashboard. We just emit the right spans.
- **Artifact generation implementation** — the router buckets entries but nothing writes CLAUDE.md/skills/hooks yet. The `claude-md-gen` / `skill-gen` / `hook-gen` stages are defined but implemented when artifact generation is built.

---

## Files Affected

| File | Change |
|------|--------|
| `server/memory/types.ts` | Add `DecisionStep`, `DecisionStage`, `DecisionAction` types; add `decisions?: DecisionStep[]` to `KnowledgeEntry` |
| `server/memory/knowledge-extractor.ts` | Record novelty-gate + extraction decisions on entries |
| `server/memory/channel-router.ts` | Record router decisions on entries |
| `server/memory/decay.ts` | Record decay decisions on entries |
| `server/memory/feedback-loop.ts` | Record feedback decisions on entries |
| `server/memory/fact-retrieval.ts` | Record retrieval decisions on entries (keyword path) |
| `server/memory/vector-retrieval.ts` | Record retrieval decisions on entries (vector path) |
| `server/memory/context-assembler.ts` | Record context-assembly decisions on entries |
| `server/memory/decision-trace.ts` | **New**: helper functions (`addDecision`, `createPipelineRunId`, `capDecisions`) |
| `server/engine/config.ts` | Add `use_vector`, `qdrant_url`, `ollama_embed_url` to `RetrievalConfig` |
| `server/engine/config.yaml` | Add retrieval vector config + Qdrant URL defaults |
| `docker-compose.yml` | Add Qdrant service |
| `server/memory/__tests__/decision-trace.test.ts` | **New**: tests for tracing helpers |
| `server/__tests__/integration/memory-lifecycle-scenarios.test.ts` | Add S11-S15 scenario tests |
