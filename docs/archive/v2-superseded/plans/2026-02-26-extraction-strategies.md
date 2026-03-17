# Extraction Strategies + Chain of Density Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor extraction pipeline into user-selectable strategies (heuristics-only / cloud-only / hybrid) with Chain of Density consolidation as a universal post-processing stage.

**Architecture:** Replace the current `hybrid_extraction.enabled` + `llm_fallback_enabled` booleans with a strategy enum. Add a consolidation stage that runs after any strategy, taking raw entries + existing knowledge store and producing only genuinely new, dense entries. The consolidation stage uses Chain of Density principles: the knowledge store IS the running summary, each extraction refines it.

**Tech Stack:** TypeScript, AI SDK v6 (`generateObject`), Zod schemas, YAML config, Vitest 4

---

## Background

Evaluation results (see `docs/research/2026-02-26-extraction-approach-evaluation.md`):
- Heuristics-only: 37.8% recall, instant, free, low noise
- Heuristics + Ollama: 85.7% recall, 10-80 min, free, 121:1 noise ratio
- Heuristics + Cloud: ~95-100% recall, 5-15 sec, ~$0.05/session, good precision
- **Chain of Density consolidation**: reduces noise from 121:1 to ~2:1 by filtering against existing knowledge

Key config file: `server/engine/config.yaml`
Key types: `server/engine/config.ts`
Pipeline: `server/memory/extraction-pipeline.ts`
LLM extractor: `server/memory/knowledge-extractor.ts`

---

### Task 1: Add ExtractionStrategy config type and YAML section

**Files:**
- Modify: `server/engine/config.ts`
- Modify: `server/engine/config.yaml`

**Step 1: Write the failing test**

Create `server/engine/__tests__/config-strategy.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getExtractionStrategyConfig, type ExtractionStrategyConfig } from "../config"

describe("getExtractionStrategyConfig", () => {
  it("returns a valid strategy config", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.strategy).toMatch(/^(heuristics-only|cloud|hybrid)$/)
  })

  it("has consolidation settings", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.consolidation).toBeDefined()
    expect(typeof cfg.consolidation.enabled).toBe("boolean")
    expect(typeof cfg.consolidation.max_new_entries).toBe("number")
  })

  it("has cloud settings when strategy uses cloud", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.cloud).toBeDefined()
    expect(typeof cfg.cloud.provider).toBe("string")
    expect(typeof cfg.cloud.model).toBe("string")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/engine/__tests__/config-strategy.test.ts`
Expected: FAIL — `getExtractionStrategyConfig` does not exist

**Step 3: Add the type and config section**

In `server/engine/config.ts`, add the interface after `HybridExtractionConfig`:

```typescript
export type ExtractionStrategy = "heuristics-only" | "cloud" | "hybrid"

export interface ConsolidationConfig {
  enabled: boolean
  max_new_entries: number
  provider: string | null
  model: string | null
}

export interface ExtractionStrategyConfig {
  strategy: ExtractionStrategy
  cloud: {
    provider: string
    model: string
  }
  consolidation: ConsolidationConfig
  optimized_prompt: boolean
}
```

Add to `PipelineConfig`:
```typescript
extraction_strategy: ExtractionStrategyConfig
```

Add getter:
```typescript
export function getExtractionStrategyConfig(): ExtractionStrategyConfig {
  const cfg = loadConfig()
  return cfg.extraction_strategy ?? {
    strategy: "hybrid",
    cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
    consolidation: { enabled: true, max_new_entries: 20, provider: null, model: null },
    optimized_prompt: true,
  }
}
```

In `server/engine/config.yaml`, add after `hybrid_extraction`:

```yaml
# -----------------------------------------------------------------------------
# EXTRACTION STRATEGY — server/memory/extraction-pipeline.ts
# User-selectable extraction approach. Replaces hybrid_extraction flags.
# See: docs/research/2026-02-26-extraction-approach-evaluation.md
# -----------------------------------------------------------------------------
extraction_strategy:
  # Which extraction approach to use:
  #   heuristics-only: Pattern-based, instant, free. ~38% recall.
  #   cloud: Heuristics + cloud LLM for factual turns. ~95% recall, ~$0.05/session.
  #   hybrid: Heuristics + user's configured LLM (Ollama or cloud).
  strategy: hybrid

  # Cloud LLM settings (used by 'cloud' and 'hybrid' strategies).
  # Provider/model from here override LLM_PROVIDER/LLM_MODEL env vars for extraction.
  cloud:
    provider: openrouter
    model: anthropic/claude-haiku-4.5

  # Chain of Density consolidation — runs AFTER any strategy.
  # Merges raw entries with existing knowledge store.
  # Outputs only genuinely new items. Dramatically reduces noise.
  consolidation:
    enabled: true
    # Maximum new entries per extraction run.
    # Higher: more items for audit. Lower: tighter filter.
    max_new_entries: 20
    # Provider/model for consolidation pass. null = use same as extraction.
    provider: null
    model: null

  # Use optimized extraction prompt (tuned from golden dataset).
  # When false, uses the default prompt from knowledge-extractor.ts.
  optimized_prompt: true
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/engine/__tests__/config-strategy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/engine/config.ts server/engine/config.yaml server/engine/__tests__/config-strategy.test.ts
git commit -m "feat: add extraction_strategy config with strategy enum and consolidation settings"
```

---

### Task 2: Create the optimized extraction prompt module

**Files:**
- Create: `server/memory/extraction-prompts.ts`
- Test: `server/memory/__tests__/extraction-prompts.test.ts`

**Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getExtractionPrompt } from "../extraction-prompts"

describe("getExtractionPrompt", () => {
  it("returns default prompt when optimized=false", () => {
    const prompt = getExtractionPrompt(false)
    expect(prompt).toContain("knowledge extraction system")
    expect(prompt).not.toContain("precise knowledge extraction")
  })

  it("returns optimized prompt when optimized=true", () => {
    const prompt = getExtractionPrompt(true)
    expect(prompt).toContain("precise knowledge extraction")
    expect(prompt).toContain("≤10 items per chunk")
  })

  it("returns consolidation prompt", () => {
    const prompt = getExtractionPrompt(true, "consolidation")
    expect(prompt).toContain("EXISTING KNOWLEDGE")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/extraction-prompts.test.ts`

**Step 3: Implement extraction-prompts.ts**

Extract the existing `EXTRACTION_PROMPT` from `knowledge-extractor.ts` as the default. Add the optimized prompt (from `compare-golden-cloud.ts` experiment — the one tuned from golden dataset analysis). Add a consolidation prompt for the CoD stage.

The consolidation prompt template:

```typescript
export function buildConsolidationPrompt(existingEntries: string[]): string {
  return `You are a knowledge consolidation system. You are given:
1. EXISTING KNOWLEDGE — entries already in the knowledge store
2. NEW CANDIDATES — raw entries from this extraction run

Your job: output ONLY entries that are GENUINELY NEW — not already captured in existing knowledge.

Rules:
- If a candidate is a rephrasing of an existing entry, DROP it.
- If a candidate adds meaningful detail to an existing entry, output it as a REFINEMENT with the existing entry's content referenced.
- If a candidate is truly new knowledge, KEEP it.
- Maximum output: ${max} entries. Prioritize facts, decisions, and lessons over preferences.
- Each entry must be standalone, complete, and actionable.

EXISTING KNOWLEDGE (${existingEntries.length} entries):
${existingEntries.map((e, i) => `${i + 1}. ${e}`).join("\n")}

---

NEW CANDIDATES:
`
}
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git add server/memory/extraction-prompts.ts server/memory/__tests__/extraction-prompts.test.ts
git commit -m "feat: add extraction prompt module with default, optimized, and consolidation prompts"
```

---

### Task 3: Create the consolidation stage (Chain of Density)

**Files:**
- Create: `server/memory/consolidation-stage.ts`
- Test: `server/memory/__tests__/consolidation-stage.test.ts`

**Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { KnowledgeEntry } from "../types"
import { consolidateEntries } from "../consolidation-stage"

const makeEntry = (content: string, type = "fact" as const): KnowledgeEntry => ({
  id: crypto.randomUUID(),
  type,
  content,
  confidence: 0.9,
  entities: [],
  source: "test",
  extractedAt: new Date().toISOString(),
})

describe("consolidateEntries", () => {
  it("returns empty when no new entries", async () => {
    const result = await consolidateEntries([], [], { enabled: false })
    expect(result).toEqual([])
  })

  it("passes through all entries when consolidation disabled", async () => {
    const entries = [makeEntry("Use PostgreSQL"), makeEntry("Use MQTT")]
    const result = await consolidateEntries(entries, [], { enabled: false })
    expect(result).toHaveLength(2)
  })

  it("filters entries already in existing knowledge (heuristic mode)", async () => {
    const existing = [makeEntry("Use PostgreSQL")]
    const candidates = [makeEntry("Use PostgreSQL for database"), makeEntry("Use MQTT")]
    const result = await consolidateEntries(candidates, existing, {
      enabled: true,
      max_new_entries: 20,
      provider: null,
      model: null,
    })
    // Heuristic consolidation: Jaccard overlap catches "Use PostgreSQL" dupe
    // "Use MQTT" is genuinely new
    expect(result.some(e => e.content.includes("MQTT"))).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

**Step 3: Implement consolidation-stage.ts**

Two modes:
1. **Heuristic consolidation** (no LLM configured): Jaccard similarity against existing entries, cap at `max_new_entries`
2. **LLM consolidation** (provider configured): Build consolidation prompt with existing entries, send candidates, get filtered results

```typescript
import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import { z } from "zod"
import type { ConsolidationConfig } from "../engine/config"
import { buildConsolidationPrompt } from "./extraction-prompts"
import type { KnowledgeEntry } from "./types"

// Heuristic: Jaccard similarity check
function isNearDuplicate(candidate: string, existing: string[]): boolean {
  const cTokens = new Set(candidate.toLowerCase().split(/\s+/).filter(w => w.length >= 3))
  for (const ex of existing) {
    const eTokens = new Set(ex.toLowerCase().split(/\s+/).filter(w => w.length >= 3))
    const intersection = [...cTokens].filter(t => eTokens.has(t)).length
    const union = new Set([...cTokens, ...eTokens]).size
    if (union > 0 && intersection / union > 0.5) return true
  }
  return false
}

export async function consolidateEntries(
  candidates: KnowledgeEntry[],
  existingEntries: KnowledgeEntry[],
  config: ConsolidationConfig,
  model?: LanguageModel,
): Promise<KnowledgeEntry[]> {
  if (candidates.length === 0) return []
  if (!config.enabled) return candidates

  const existingContent = existingEntries.map(e => e.content)

  // Heuristic pass: remove near-duplicates of existing knowledge
  const novel = candidates.filter(c => !isNearDuplicate(c.content, existingContent))

  if (!model || novel.length === 0) {
    return novel.slice(0, config.max_new_entries)
  }

  // LLM consolidation pass (Chain of Density)
  // ... generateObject with consolidation prompt
  // Returns filtered, merged, dense entries
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add server/memory/consolidation-stage.ts server/memory/__tests__/consolidation-stage.test.ts
git commit -m "feat: add consolidation stage with heuristic and LLM modes (Chain of Density)"
```

---

### Task 4: Refactor extraction-pipeline.ts to use strategy config

**Files:**
- Modify: `server/memory/extraction-pipeline.ts`
- Modify: `server/memory/extraction-pipeline.test.ts` (or create if missing)

**Step 1: Write the failing test**

Test that the pipeline respects the strategy setting:

```typescript
describe("extraction pipeline strategies", () => {
  it("heuristics-only: skips LLM entirely", async () => { /* mock config, verify no LLM calls */ })
  it("cloud: uses cloud provider for factual turns", async () => { /* mock config, verify cloud model used */ })
  it("hybrid: uses configured LLM provider", async () => { /* mock config, verify provider matches */ })
  it("consolidation runs after extraction", async () => { /* verify consolidateEntries called with existing store */ })
})
```

**Step 2: Run test to verify failure**

**Step 3: Refactor pipeline**

In `extraction-pipeline.ts`, replace the current `getHybridExtractionConfig()` logic with:

```typescript
import { getExtractionStrategyConfig } from "../engine/config"
import { consolidateEntries } from "./consolidation-stage"
import { getExtractionPrompt } from "./extraction-prompts"

// In runExtraction():
const strategyCfg = getExtractionStrategyConfig()

// Stage: Classification + Heuristic extraction (always runs)
for (const turn of turns) {
  const classification = classifyTurn(turn)
  if (classification.type === "noise") continue
  if (classification.type !== "factual") {
    heuristicEntries.push(...extractHeuristic(turn, classification, source, preceding))
  } else {
    factualTurns.push(turn)
  }
}

// Stage: LLM extraction on factual turns (strategy-dependent)
if (strategyCfg.strategy !== "heuristics-only" && factualTurns.length > 0) {
  const model = getStrategyModel(strategyCfg)
  const prompt = getExtractionPrompt(strategyCfg.optimized_prompt)
  // ... chunk and extract with model
}

// Stage: Consolidation (always runs if enabled)
const allRaw = [...heuristicEntries, ...llmEntries]
const existingEntries = await loadExistingEntries(storePath)
const consolidated = await consolidateEntries(
  allRaw, existingEntries, strategyCfg.consolidation, consolidationModel
)
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add server/memory/extraction-pipeline.ts server/memory/__tests__/extraction-pipeline-strategy.test.ts
git commit -m "feat: refactor extraction pipeline to use strategy config with consolidation stage"
```

---

### Task 5: Wire up getStrategyModel helper

**Files:**
- Create: `server/memory/strategy-model.ts`
- Test: `server/memory/__tests__/strategy-model.test.ts`

**Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getStrategyModel } from "../strategy-model"
import type { ExtractionStrategyConfig } from "../../engine/config"

describe("getStrategyModel", () => {
  it("returns null for heuristics-only", () => {
    const cfg = { strategy: "heuristics-only" } as ExtractionStrategyConfig
    expect(getStrategyModel(cfg)).toBeNull()
  })

  it("returns cloud model for cloud strategy", () => {
    const cfg = {
      strategy: "cloud",
      cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
    } as ExtractionStrategyConfig
    const result = getStrategyModel(cfg)
    expect(result).not.toBeNull()
  })

  it("returns default LLM for hybrid strategy", () => {
    const cfg = { strategy: "hybrid" } as ExtractionStrategyConfig
    const result = getStrategyModel(cfg)
    // Uses getModel() from providers/index.ts (Ollama by default)
    expect(result).not.toBeNull()
  })
})
```

**Step 2-5: Implement, test, commit**

The helper reads `strategy` and returns the appropriate `LanguageModel`:
- `heuristics-only` → `null`
- `cloud` → `createOpenRouterModel(cfg.cloud.model, apiKey)` (or direct Anthropic)
- `hybrid` → `getModel()` from `server/providers/index.ts` (uses `LLM_PROVIDER` env var)

```bash
git commit -m "feat: add getStrategyModel helper for strategy-based model selection"
```

---

### Task 6: Update knowledge-extractor.ts to accept prompt parameter

**Files:**
- Modify: `server/memory/knowledge-extractor.ts`

**Step 1: Write the failing test**

```typescript
it("uses custom prompt when provided", async () => {
  // Verify extractKnowledge accepts optional prompt parameter
  // and passes it to generateObject instead of hardcoded EXTRACTION_PROMPT
})
```

**Step 2-5: Add `prompt?: string` to `ExtractionOptions`, use it in `extractKnowledge()`**

The hardcoded `EXTRACTION_PROMPT` becomes the default. When `opts.prompt` is provided, it's used instead. This lets the pipeline pass the optimized prompt from `extraction-prompts.ts`.

Also: remove the `ollamaQueue.enqueue()` wrapper when the model is NOT Ollama (cloud models don't need queuing).

```bash
git commit -m "feat: make extraction prompt configurable via ExtractionOptions"
```

---

### Task 7: Integration test with golden dataset

**Files:**
- Create: `experiments/extraction/run-strategy-eval.ts`

A script that runs all 3 strategies on a given developer's sessions and compares results:

```bash
pnpm tsx experiments/extraction/run-strategy-eval.ts qp
```

Output:
```
Strategy: heuristics-only  | Recall: 9/18 (50.0%) | Entries: 19 | Time: 0.1s | Cost: $0
Strategy: cloud            | Recall: 17/18 (94.4%) | Entries: 28 | Time: 12s  | Cost: $0.08
Strategy: hybrid (ollama)  | Recall: 15/18 (83.3%) | Entries: 442 | Time: 777s | Cost: $0

With consolidation (cloud strategy):
  Before: 200 raw entries
  After: 12 new entries (existing store: 0)
  Recall: 17/18 (94.4%)
```

**Step 1-5: Implement, test with QP data, commit**

```bash
git commit -m "feat: add strategy evaluation script for golden dataset comparison"
```

---

### Task 8: Deprecate hybrid_extraction config section

**Files:**
- Modify: `server/engine/config.ts` — add deprecation warning in `getHybridExtractionConfig()`
- Modify: `server/memory/extraction-pipeline.ts` — use `getExtractionStrategyConfig()` with fallback

The old `hybrid_extraction.enabled` + `llm_fallback_enabled` flags are mapped to the new strategy:
- `enabled: false` → `strategy: "cloud"` (legacy: all turns to LLM)
- `enabled: true, llm_fallback_enabled: false` → `strategy: "heuristics-only"`
- `enabled: true, llm_fallback_enabled: true` → `strategy: "hybrid"`

```bash
git commit -m "feat: deprecate hybrid_extraction config in favor of extraction_strategy"
```

---

## Dependency Graph

```
Task 1 (config types) ──┬── Task 2 (prompts)
                         │
                         ├── Task 3 (consolidation) ── Task 4 (pipeline refactor)
                         │                                    │
                         └── Task 5 (model helper) ───────────┘
                                                              │
Task 6 (extractor prompt param) ──────────────────────────────┘
                                                              │
                                                    Task 7 (integration eval)
                                                              │
                                                    Task 8 (deprecation)
```

Tasks 1-3 can be parallelized (independent). Tasks 4-6 depend on 1-3. Tasks 7-8 are sequential at the end.
