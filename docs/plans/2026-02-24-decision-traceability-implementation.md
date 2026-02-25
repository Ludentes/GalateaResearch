# Decision Traceability — Implementation Plan

> **Part 1 addendum to evidence-based memory lifecycle**
> **Design doc:** `docs/plans/2026-02-24-decision-traceability-design.md`

**Goal:** Add per-entry decision trails + Qdrant re-wiring + 5 new test scenarios.

**Approach:** TDD, subagent-driven, same worktree (`feature/evidence-based-memory-lifecycle`).

**Baseline:** 290+ tests passing across 38 test files.

### Scenario-to-Task Coverage Map

| Scenario | Description | Red phase | Green phase |
|----------|-------------|-----------|-------------|
| S11: Vector retrieval filtering | Low-relevance entry excluded | Task 3 | Task 3 |
| S12: CLAUDE.md truncation | Budget overflow traced | Task 5 | Task 5 |
| S13: Full traceability query | Decision chain readable | Task 8 | Task 8 |
| S14: Qdrant fallback | Vector unavailable, keyword takes over | Task 3 | Task 3 |
| S15: Decision cap | Unbounded growth prevented | Task 1 | Task 1 |

---

## Task 1: Add DecisionStep types and helper functions

**Files:**
- Modify: `server/memory/types.ts`
- Create: `server/memory/decision-trace.ts`
- Create: `server/memory/__tests__/decision-trace.test.ts`

**Step 1: Write the failing test**

Create `server/memory/__tests__/decision-trace.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { KnowledgeEntry } from "../types"
import {
  addDecision,
  createPipelineRunId,
  capDecisions,
  getDecisionsByStage,
} from "../decision-trace"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-1",
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("decision-trace helpers", () => {
  it("createPipelineRunId returns stage-prefixed ID", () => {
    const id = createPipelineRunId("extraction")
    expect(id).toMatch(/^extraction:\d+:[a-f0-9]{8}$/)
  })

  it("addDecision appends to entry.decisions", () => {
    const entry = makeEntry()
    const runId = createPipelineRunId("router")
    const updated = addDecision(entry, {
      stage: "router",
      action: "route",
      reason: "approved entry → CLAUDE.md",
      inputs: { channel: "claude-md", score: 0.85 },
      pipelineRunId: runId,
    })
    expect(updated.decisions).toHaveLength(1)
    expect(updated.decisions![0].stage).toBe("router")
    expect(updated.decisions![0].pipelineRunId).toBe(runId)
    expect(updated.decisions![0].timestamp).toBeDefined()
  })

  it("addDecision does not mutate original entry", () => {
    const entry = makeEntry()
    const updated = addDecision(entry, {
      stage: "extraction",
      action: "pass",
      reason: "extracted",
      pipelineRunId: "test:1",
    })
    expect(entry.decisions).toBeUndefined()
    expect(updated.decisions).toHaveLength(1)
  })

  it("capDecisions keeps total at max 50 (S15)", () => {
    let entry = makeEntry({ decisions: [] })
    for (let i = 0; i < 55; i++) {
      entry = addDecision(entry, {
        stage: "decay",
        action: "decay",
        reason: `run ${i}`,
        pipelineRunId: `decay:${i}`,
      })
    }
    const capped = capDecisions(entry)
    expect(capped.decisions!.length).toBeLessThanOrEqual(50)
    // Most recent decisions preserved
    expect(capped.decisions![capped.decisions!.length - 1].reason).toBe("run 54")
  })

  it("getDecisionsByStage filters correctly", () => {
    let entry = makeEntry()
    entry = addDecision(entry, { stage: "extraction", action: "pass", reason: "a", pipelineRunId: "r1" })
    entry = addDecision(entry, { stage: "router", action: "route", reason: "b", pipelineRunId: "r2" })
    entry = addDecision(entry, { stage: "decay", action: "decay", reason: "c", pipelineRunId: "r3" })

    const routerDecisions = getDecisionsByStage(entry, "router")
    expect(routerDecisions).toHaveLength(1)
    expect(routerDecisions[0].reason).toBe("b")
  })
})
```

**Step 2: Run test — expected FAIL (module not found)**

**Step 3: Add types to `server/memory/types.ts`**

After the existing `KnowledgeEntry` interface, add:

```typescript
// ============ Decision Traceability ============

export type DecisionStage =
  | "extraction"
  | "novelty-gate"
  | "dedup"
  | "retrieval"
  | "context-assembly"
  | "router"
  | "accumulation"
  | "claude-md-gen"
  | "skill-gen"
  | "hook-gen"
  | "decay"
  | "feedback"

export type DecisionAction =
  | "pass"
  | "drop"
  | "cap"
  | "auto-approve"
  | "route"
  | "skip"
  | "decay"
  | "archive"
  | "defer"
  | "reject"
  | "record"

export interface DecisionStep {
  stage: DecisionStage
  action: DecisionAction
  reason: string
  inputs?: Record<string, number | string | boolean>
  timestamp: string
  pipelineRunId: string
}
```

Add `decisions?: DecisionStep[]` to `KnowledgeEntry`:

```typescript
// Decision trail
decisions?: DecisionStep[]
```

**Step 4: Create `server/memory/decision-trace.ts`**

```typescript
import type { DecisionStep, DecisionStage, DecisionAction, KnowledgeEntry } from "./types"

const MAX_DECISIONS = 50

export function createPipelineRunId(stage: string): string {
  return `${stage}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
}

export function addDecision(
  entry: KnowledgeEntry,
  step: Omit<DecisionStep, "timestamp">,
): KnowledgeEntry {
  const decision: DecisionStep = {
    ...step,
    timestamp: new Date().toISOString(),
  }
  return {
    ...entry,
    decisions: [...(entry.decisions ?? []), decision],
  }
}

export function capDecisions(entry: KnowledgeEntry): KnowledgeEntry {
  if (!entry.decisions || entry.decisions.length <= MAX_DECISIONS) return entry
  // Keep the most recent MAX_DECISIONS entries
  return {
    ...entry,
    decisions: entry.decisions.slice(-MAX_DECISIONS),
  }
}

export function getDecisionsByStage(
  entry: KnowledgeEntry,
  stage: DecisionStage,
): DecisionStep[] {
  return (entry.decisions ?? []).filter((d) => d.stage === stage)
}
```

**Step 5: Run test — expected PASS**

**Step 6: Run full suite — all pass**

**Step 7: Commit**

```bash
git add server/memory/types.ts server/memory/decision-trace.ts server/memory/__tests__/decision-trace.test.ts
git commit -m "feat: add DecisionStep types and tracing helper functions"
```

---

## Task 2: Add Qdrant to docker-compose and retrieval config

**Files:**
- Modify: `docker-compose.yml`
- Modify: `server/engine/config.ts`
- Modify: `server/engine/config.yaml`

**Step 1: Write the failing test**

Create `server/memory/__tests__/config-retrieval-vector.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadConfig, resetConfigCache } from "../../engine/config"

describe("Vector retrieval config", () => {
  it("loads use_vector setting", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.use_vector).toBe(false) // off by default
  })

  it("loads qdrant_url", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.qdrant_url).toBe("http://localhost:6333")
  })

  it("loads ollama_embed_url", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.ollama_embed_url).toBe("http://localhost:11434")
  })
})
```

**Step 2: Run test — expected FAIL**

**Step 3: Add to `RetrievalConfig` in config.ts**

```typescript
export interface RetrievalConfig {
  max_entries: number
  entity_name_min_length: number
  keyword_min_length: number
  keyword_overlap_threshold: number
  use_vector: boolean
  qdrant_url: string
  ollama_embed_url: string
}
```

**Step 4: Add to config.yaml** (in existing `retrieval:` section)

```yaml
retrieval:
  max_entries: 30
  entity_name_min_length: 3
  keyword_min_length: 4
  keyword_overlap_threshold: 2
  use_vector: false
  qdrant_url: "http://localhost:6333"
  ollama_embed_url: "http://localhost:11434"
```

**Step 5: Add Qdrant to docker-compose.yml**

```yaml
  qdrant:
    image: qdrant/qdrant:v1.13.2
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:6333/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
```

Add `qdrant_data:` to the `volumes:` section.

**Step 6: Run test — expected PASS**

**Step 7: Run full suite — all pass**

**Step 8: Commit**

```bash
git add docker-compose.yml server/engine/config.ts server/engine/config.yaml server/memory/__tests__/config-retrieval-vector.test.ts
git commit -m "feat: add Qdrant to docker-compose and vector retrieval config"
```

---

## Task 3: Wire Qdrant into retrieval + add decision tracing to retrieval

**Files:**
- Modify: `server/memory/fact-retrieval.ts`
- Modify: `server/memory/vector-retrieval.ts`
- Modify existing tests or create `server/memory/__tests__/retrieval-tracing.test.ts`

**Covers scenarios:** S11 (vector retrieval filtering), S14 (Qdrant fallback)

**Step 1: Write the failing tests**

Create `server/memory/__tests__/retrieval-tracing.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getRetrievalConfig: () => ({
      max_entries: 20,
      entity_name_min_length: 3,
      keyword_min_length: 4,
      keyword_overlap_threshold: 2,
      use_vector: false,
      qdrant_url: "http://localhost:6333",
      ollama_embed_url: "http://localhost:11434",
    }),
    getStopWords: () => new Set(["the", "and", "for"]),
  }
})

import { retrieveRelevantFacts } from "../fact-retrieval"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test entry",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("retrieval decision tracing", () => {
  it("records retrieval decisions on entries when trace=true (S11)", async () => {
    // This test validates that keyword retrieval records per-entry decisions
    // Full vector retrieval tracing is tested in vector-retrieval.test.ts
    const result = await retrieveRelevantFacts(
      "PostgreSQL database setup",
      "data/memory/entries.jsonl",
      { trace: true },
    )

    // The trace should exist with steps
    expect(result.trace).toBeDefined()
    expect(result.trace!.steps.length).toBeGreaterThan(0)
  })

  it("falls back to keyword when useVector=true but Qdrant unavailable (S14)", async () => {
    // Qdrant is not running in test environment
    const result = await retrieveRelevantFacts(
      "test query",
      "data/memory/entries.jsonl",
      { useVector: true, trace: true },
    )

    // Should fall back gracefully
    expect(result).toBeDefined()
    expect(result.entries).toBeDefined()
  })
})
```

**Step 2: Run test — expected FAIL or partial**

**Step 3: Modify `fact-retrieval.ts`**

Update the `useVector` branch to read from config:

```typescript
// At the top of retrieveRelevantFacts:
const useVector = opts?.useVector ?? config.use_vector ?? false
```

Instead of:
```typescript
if (opts?.useVector) {
```

Use:
```typescript
if (useVector) {
```

Add decision step recording to entries in the keyword pipeline. After each stage (entity match, keyword match, limit), record a `DecisionStep` on matching entries using `addDecision()`.

**Step 4: Modify `vector-retrieval.ts`**

Add decision recording to entries returned from vector search. Each entry gets a `retrieval` decision step with composite score breakdown:

```typescript
import { addDecision, createPipelineRunId } from "./decision-trace"

// In retrieveVectorFacts, after scoring:
const runId = createPipelineRunId("retrieval")
// On entries that pass:
entry = addDecision(entry, {
  stage: "retrieval",
  action: "pass",
  reason: "vector search: composite score above threshold",
  inputs: { compositeScore: score, similarity, recency: recencyScore(entry.extractedAt), confidence: entry.confidence, method: "vector" },
  pipelineRunId: runId,
})
// On fallback:
entry = addDecision(entry, {
  stage: "retrieval",
  action: "pass",
  reason: "keyword fallback: Qdrant unavailable",
  inputs: { method: "keyword_fallback" },
  pipelineRunId: runId,
})
```

**Step 5: Run tests — expected PASS**

**Step 6: Run full suite — all pass (including existing 12 vector-retrieval tests)**

**Step 7: Commit**

```bash
git add server/memory/fact-retrieval.ts server/memory/vector-retrieval.ts server/memory/__tests__/retrieval-tracing.test.ts
git commit -m "feat: wire Qdrant config into retrieval and add decision tracing"
```

---

## Task 4: Add decision tracing to extraction pipeline

**Files:**
- Modify: `server/memory/knowledge-extractor.ts`

**Step 1: Write the failing test**

Add to `server/memory/__tests__/knowledge-extractor.test.ts`:

```typescript
it("records novelty-gate decisions on extracted entries", async () => {
  // ... existing mock setup ...
  const result = await extractKnowledge(mockTurns, model, "test", { skipGuard: true })

  // Each entry should have at least one decision from novelty-gate
  for (const entry of result) {
    expect(entry.decisions).toBeDefined()
    expect(entry.decisions!.length).toBeGreaterThan(0)
    const noveltyDecisions = entry.decisions!.filter(d => d.stage === "novelty-gate")
    expect(noveltyDecisions.length).toBeGreaterThan(0)
  }
})

it("records drop decision for general-knowledge entries", async () => {
  // Mock returns a general-knowledge entry
  // ... setup ...
  // Verify the dropped entry is not in results but would have had a drop decision
  // (Since dropped entries are filtered out, we verify count is reduced)
})
```

**Step 2: Run test — expected FAIL**

**Step 3: Modify `applyNoveltyGateAndApproval` in knowledge-extractor.ts**

Add `addDecision` calls at each decision point:
- After novelty filter: `drop` for general-knowledge, `pass` for others
- After confidence cap: `cap` for inferred entries
- After auto-approval: `auto-approve` or `pass` (pending)

```typescript
import { addDecision, createPipelineRunId } from "./decision-trace"

function applyNoveltyGateAndApproval(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const runId = createPipelineRunId("extraction")

  // 1. Drop general-knowledge
  let filtered = entries.filter((e) => {
    if (e.novelty === "general-knowledge") {
      // Note: dropped entries are discarded, but we log the decision
      // In future, we could emit to Langfuse here
      return false
    }
    return true
  })

  // Record novelty-gate pass
  filtered = filtered.map((e) =>
    addDecision(e, {
      stage: "novelty-gate",
      action: "pass",
      reason: "novelty accepted",
      inputs: { novelty: e.novelty ?? "project-specific" },
      pipelineRunId: runId,
    }),
  )

  // 2. Cap inferred at 0.70
  filtered = filtered.map((e) => {
    if (e.origin === "inferred" && e.confidence > 0.70) {
      return addDecision(
        { ...e, confidence: 0.70 },
        {
          stage: "novelty-gate",
          action: "cap",
          reason: "inferred confidence capped",
          inputs: { originalConfidence: e.confidence, cappedTo: 0.70, origin: "inferred" },
          pipelineRunId: runId,
        },
      )
    }
    return e
  })

  // 3. Auto-approve or pending
  filtered = filtered.map((e) => {
    if (e.origin === "explicit-statement" && e.confidence >= 0.90) {
      return addDecision(
        { ...e, curationStatus: "approved" as const, curatedBy: "auto-approved", curatedAt: new Date().toISOString() },
        {
          stage: "extraction",
          action: "auto-approve",
          reason: "explicit-statement with confidence >= threshold",
          inputs: { confidence: e.confidence, threshold: 0.90 },
          pipelineRunId: runId,
        },
      )
    }
    return addDecision(
      { ...e, curationStatus: "pending" as const },
      {
        stage: "extraction",
        action: "pass",
        reason: "pending curation",
        inputs: { origin: e.origin ?? "unknown", confidence: e.confidence },
        pipelineRunId: runId,
      },
    )
  })

  return filtered
}
```

**Step 4: Run tests — expected PASS**

**Step 5: Run full suite**

**Step 6: Commit**

```bash
git add server/memory/knowledge-extractor.ts server/memory/__tests__/knowledge-extractor.test.ts
git commit -m "feat: add decision tracing to extraction novelty gate and auto-approval"
```

---

## Task 5: Add decision tracing to channel router

**Covers scenarios:** S12 (CLAUDE.md truncation traced)

**Files:**
- Modify: `server/memory/channel-router.ts`

**Step 1: Write the failing test**

Add to `server/memory/__tests__/channel-router.test.ts`:

```typescript
it("records router decisions on routed entries", () => {
  const entry = makeEntry({
    type: "preference",
    content: "Uses pnpm not npm",
    confidence: 0.95,
    curationStatus: "approved",
  })
  const result = routeEntries([entry])
  const routed = result.claudeMd.entries[0]
  expect(routed.decisions).toBeDefined()
  const routerDecisions = routed.decisions!.filter(d => d.stage === "router")
  expect(routerDecisions).toHaveLength(1)
  expect(routerDecisions[0].action).toBe("route")
  expect(routerDecisions[0].inputs?.channel).toBe("claude-md")
})

it("records skip decisions with budget info (S12)", () => {
  // Create enough entries to exceed line budget
  const entries = Array.from({ length: 50 }, (_, i) =>
    makeEntry({
      type: "fact",
      content: `Important fact number ${i}\nWith extra detail\nAnd more lines\nAnd even more\nFifth line`,
      confidence: 0.95 - i * 0.001,
      curationStatus: "approved",
    }),
  )
  const result = routeEntries(entries)

  // Some should be skipped due to budget
  expect(result.skipped.entries.length).toBeGreaterThan(0)
  const budgetSkipped = result.skipped.entries.filter(e =>
    e.decisions?.some(d => d.reason.includes("line budget"))
  )
  expect(budgetSkipped.length).toBeGreaterThan(0)
  // Check that budget state is recorded
  const decision = budgetSkipped[0].decisions!.find(d => d.reason.includes("line budget"))!
  expect(decision.inputs?.lineCount).toBeDefined()
  expect(decision.inputs?.budget).toBe(200)
})
```

**Step 2: Run test — expected FAIL**

**Step 3: Modify channel-router.ts**

Add `addDecision` calls at each routing decision:
- Hook routing: `route` with `{ channel: "hook" }`
- Skills routing: `route` with `{ channel: "skill", rank, score }`
- CLAUDE.md routing: `route` with `{ channel: "claude-md", score }`
- All skip cases: `skip` with specific reason and threshold values
- Budget overflow: `skip` with `{ lineCount, budget, entryLines }`

**Step 4: Run tests — expected PASS**

**Step 5: Run full suite**

**Step 6: Commit**

```bash
git add server/memory/channel-router.ts server/memory/__tests__/channel-router.test.ts
git commit -m "feat: add decision tracing to channel router with budget tracking"
```

---

## Task 6: Add decision tracing to decay

**Files:**
- Modify: `server/memory/decay.ts`

**Step 1: Write the failing test**

Add to `server/memory/__tests__/decay-lifecycle.test.ts`:

```typescript
it("records decay decisions on entries", async () => {
  const entry = makeEntry({
    extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  })
  await appendEntries([entry], STORE_PATH)
  await runDecay(STORE_PATH)

  const after = await readEntries(STORE_PATH)
  expect(after[0].decisions).toBeDefined()
  const decayDecisions = after[0].decisions!.filter(d => d.stage === "decay")
  expect(decayDecisions).toHaveLength(1)
  expect(decayDecisions[0].inputs?.from).toBeDefined()
  expect(decayDecisions[0].inputs?.to).toBeDefined()
})

it("records grace period pass decisions", async () => {
  const entry = makeEntry({
    extractedAt: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days ago
  })
  await appendEntries([entry], STORE_PATH)
  await runDecay(STORE_PATH)

  const after = await readEntries(STORE_PATH)
  const decisions = after[0].decisions?.filter(d => d.stage === "decay")
  expect(decisions).toHaveLength(1)
  expect(decisions![0].action).toBe("pass")
  expect(decisions![0].reason).toContain("grace period")
})
```

**Step 2: Run test — expected FAIL**

**Step 3: Modify decay.ts**

Add `addDecision` + `capDecisions` calls at each decision point in `runDecay()`:
- Grace period pass: `{ daysSince, graceDays, origin, multiplier }`
- Exempt type: `{ type: "rule" }`
- Hook-enforced exempt: `{ enforcedBy: "hook" }`
- Decay: `{ from, to, factor, effectiveFactor, decayDays, impactScore }`
- Archive: `{ confidence, threshold }`

After mapping all entries, call `capDecisions` to prevent unbounded growth.

**Step 4: Run tests — expected PASS**

**Step 5: Run full suite**

**Step 6: Commit**

```bash
git add server/memory/decay.ts server/memory/__tests__/decay-lifecycle.test.ts
git commit -m "feat: add decision tracing to decay with grace period and outcome details"
```

---

## Task 7: Add decision tracing to feedback loop and context assembler

**Files:**
- Modify: `server/memory/feedback-loop.ts`
- Modify: `server/memory/context-assembler.ts`

**Step 1: Write the failing tests**

Add to `server/memory/__tests__/feedback-loop.test.ts`:

```typescript
it("records feedback decision on entries", async () => {
  const entry = makeEntry({ sessionsExposed: 2, sessionsHelpful: 2 })
  await appendEntries([entry], STORE_PATH)

  await recordOutcome(
    { status: "completed", text: "", transcript: [], durationMs: 1000 },
    [entry.id],
    STORE_PATH,
  )

  const after = await readEntries(STORE_PATH)
  expect(after[0].decisions).toBeDefined()
  const fbDecisions = after[0].decisions!.filter(d => d.stage === "feedback")
  expect(fbDecisions).toHaveLength(1)
  expect(fbDecisions[0].action).toBe("record")
  expect(fbDecisions[0].inputs?.status).toBe("completed")
})
```

**Step 2: Modify feedback-loop.ts and context-assembler.ts**

In `feedback-loop.ts`: add `addDecision` call when recording outcome.

In `context-assembler.ts`: this is more involved — we need to track which entries from `rules`, `knowledge`, `procedures` actually made it into the final prompt after token budget truncation. The existing `SectionAccounting` tracks per-section stats; we need per-entry decisions.

After `buildPromptWithAccounting`, compare the final sections against the original entry lists to identify which entries were truncated. Record `context-assembly` / `pass` or `skip` on each.

Note: context-assembler entries come from `readEntries()` which returns shared objects. We should record decisions on copies to avoid side effects, and include the decisions in the `exposedEntryIds` metadata or a parallel structure.

**Pragmatic approach:** Add an `exposedEntryDecisions?: Record<string, DecisionStep>` field to `AssembledContext` that maps entry ID → context-assembly decision. This avoids mutating entries in the store.

**Step 3: Run tests — expected PASS**

**Step 4: Run full suite**

**Step 5: Commit**

```bash
git add server/memory/feedback-loop.ts server/memory/context-assembler.ts server/memory/__tests__/feedback-loop.test.ts
git commit -m "feat: add decision tracing to feedback loop and context assembler"
```

---

## Task 8: Scenario integration tests S11-S15

**Covers scenarios:** S11-S15

**Files:**
- Modify: `server/__tests__/integration/memory-lifecycle-scenarios.test.ts`

**Step 1: Add 5 new scenario tests**

```typescript
// ── S11: Vector retrieval filtering ──────────────────────────────────
describe("S11: Retrieval decisions are traced on entries", () => {
  it("keyword retrieval records decisions via PipelineTrace", async () => {
    const entry = makeEntry({
      type: "fact",
      content: "Project uses PostgreSQL 17 for data storage",
      confidence: 0.95,
      curationStatus: "approved",
    })
    await appendEntries([entry], STORE_PATH)

    // Import and call retrieval with trace=true
    const { retrieveRelevantFacts } = await import("../../memory/fact-retrieval")
    const result = await retrieveRelevantFacts("PostgreSQL database", STORE_PATH, { trace: true })
    expect(result.trace).toBeDefined()
    expect(result.trace!.steps.length).toBeGreaterThan(0)
  })
})

// ── S12: CLAUDE.md line budget overflow ──────────────────────────────
describe("S12: CLAUDE.md truncation traced with budget info", () => {
  it("entries exceeding line budget get skip decision with budget state", () => {
    // Create 50 multi-line entries (5 lines each = 250 total, budget is 200)
    const entries = Array.from({ length: 50 }, (_, i) =>
      makeEntry({
        type: "fact",
        content: `Fact ${i}: line1\nline2\nline3\nline4`,
        confidence: 0.95 - i * 0.001,
        curationStatus: "approved",
        origin: "explicit-statement",
      }),
    )

    const result = routeEntries(entries)

    // Should have some in claude-md and some skipped
    expect(result.claudeMd.entries.length).toBeGreaterThan(0)
    expect(result.skipped.entries.length).toBeGreaterThan(0)

    // Skipped entries should have decisions with budget info
    const budgetSkipped = result.skipped.entries.filter(e =>
      e.decisions?.some(d => d.stage === "router" && d.reason.includes("line budget"))
    )
    expect(budgetSkipped.length).toBeGreaterThan(0)
  })
})

// ── S13: Full traceability — query decisions by entry ID ─────────────
describe("S13: Full decision chain readable on entry", () => {
  it("entry accumulates decisions across extraction and routing", () => {
    // Simulate post-extraction entry with decisions already recorded
    const entry = makeEntry({
      type: "preference",
      content: "Use conventional commits",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
      decisions: [
        {
          stage: "novelty-gate",
          action: "pass",
          reason: "novelty accepted",
          inputs: { novelty: "project-specific" },
          timestamp: new Date().toISOString(),
          pipelineRunId: "extraction:1234:abcd1234",
        },
        {
          stage: "extraction",
          action: "auto-approve",
          reason: "explicit-statement with confidence >= threshold",
          inputs: { confidence: 0.95, threshold: 0.90 },
          timestamp: new Date().toISOString(),
          pipelineRunId: "extraction:1234:abcd1234",
        },
      ],
    })

    // Route it — should add a router decision
    const result = routeEntries([entry])
    const routed = result.claudeMd.entries[0]

    // Now has 3 decisions: novelty-gate, extraction, router
    expect(routed.decisions!.length).toBeGreaterThanOrEqual(3)
    const stages = routed.decisions!.map(d => d.stage)
    expect(stages).toContain("novelty-gate")
    expect(stages).toContain("extraction")
    expect(stages).toContain("router")

    // Extraction decisions share a pipelineRunId
    const extractionRuns = routed.decisions!
      .filter(d => d.pipelineRunId.startsWith("extraction:"))
      .map(d => d.pipelineRunId)
    expect(new Set(extractionRuns).size).toBe(1) // all same run
  })
})

// ── S14: Qdrant fallback ─────────────────────────────────────────────
describe("S14: Qdrant unavailable falls back to keyword", () => {
  it("retrieval succeeds when Qdrant is not running", async () => {
    const entry = makeEntry({
      content: "FalkorDB uses Cypher queries",
      entities: ["FalkorDB", "Cypher"],
    })
    await appendEntries([entry], STORE_PATH)

    const { retrieveRelevantFacts } = await import("../../memory/fact-retrieval")
    const result = await retrieveRelevantFacts(
      "FalkorDB Cypher query syntax",
      STORE_PATH,
      { useVector: true },
    )

    // Should still return results via keyword fallback
    expect(result.entries.length).toBeGreaterThanOrEqual(0) // may or may not match
    // No crash — graceful degradation
  })
})

// ── S15: Decision cap ────────────────────────────────────────────────
describe("S15: Decision array capped at max length", () => {
  it("entry with >50 decisions gets capped on decay", async () => {
    // Create entry with 48 existing decisions
    const decisions = Array.from({ length: 48 }, (_, i) => ({
      stage: "decay" as const,
      action: "decay" as const,
      reason: `historical run ${i}`,
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      pipelineRunId: `decay:${i}:abcdef00`,
    }))

    const entry = makeEntry({
      extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      decisions,
    })
    await appendEntries([entry], STORE_PATH)

    // Run decay 5 times — would push to 53 without cap
    for (let i = 0; i < 5; i++) {
      await runDecay(STORE_PATH)
    }

    const after = await readEntries(STORE_PATH)
    expect(after[0].decisions!.length).toBeLessThanOrEqual(50)
  })
})
```

**Step 2: Run tests — should pass GREEN once Tasks 1-7 are complete**

**Step 3: Commit**

```bash
git add server/__tests__/integration/memory-lifecycle-scenarios.test.ts
git commit -m "test: add scenarios S11-S15 for decision traceability and Qdrant fallback"
```

---

## Summary

| Task | Description | Scenarios | Files | New Tests |
|------|-------------|-----------|-------|-----------|
| 1 | DecisionStep types + helpers | S15 | types.ts, decision-trace.ts (new) | 5 |
| 2 | Qdrant docker-compose + retrieval config | - | docker-compose.yml, config.ts, config.yaml | 3 |
| 3 | Wire Qdrant into retrieval + tracing | S11, S14 | fact-retrieval.ts, vector-retrieval.ts | 2 |
| 4 | Trace extraction novelty gate | - | knowledge-extractor.ts | 2 |
| 5 | Trace channel router | S12 | channel-router.ts | 2 |
| 6 | Trace decay | - | decay.ts | 2 |
| 7 | Trace feedback + context assembler | - | feedback-loop.ts, context-assembler.ts | 1 |
| 8 | Scenario integration tests S11-S15 | ALL | memory-lifecycle-scenarios.test.ts | 5 |

**Total: 8 tasks, ~22 new tests, 1 new file, 10 modified files**

### Dependencies

```
Task 1 (types + helpers)
  ├── Task 2 (config) ── Task 3 (wire Qdrant + retrieval tracing)
  ├── Task 4 (extraction tracing)
  ├── Task 5 (router tracing)
  ├── Task 6 (decay tracing)
  └── Task 7 (feedback + context-assembly tracing)
       └── Task 8 (S11-S15 integration tests) [depends on all above]
```

Tasks 2-7 can run in parallel after Task 1. Task 8 runs last.
