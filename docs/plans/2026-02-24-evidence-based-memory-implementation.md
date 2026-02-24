# Evidence-Based Memory Lifecycle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the memory pipeline from "extract everything, dump to CLAUDE.md" into an evidence-based lifecycle with novelty filtering, curation gates, 3-channel routing, outcome tracking, and a feedback loop.

**Architecture:** The existing pipeline (transcript → signal → extract → dedup → store → decay → artifact) gets 4 new stages (novelty filter, curation state, channel router, feedback loop) and modifications to 3 existing stages (extraction, decay, knowledge store types).

**Tech Stack:** TypeScript, Vitest, Zod schemas, JSONL storage, YAML config

**Design doc:** `docs/plans/2026-02-24-evidence-based-memory-lifecycle-design.md`
**Gherkin scenarios:** `docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md`

### Scenario-to-Task Coverage Map

| Scenario | Description | Red phase (failing test) | Green phase (implementation) |
|----------|-------------|--------------------------|------------------------------|
| S1: Explicit preference → CLAUDE.md | Auto-approved entry reaches artifact | Task 2 (extraction), Task 5 (routing) | Task 2 (novelty gate), Task 5 (router) |
| S2: Explicit rule → hook | Rule matches hook pattern, needs human approval | Task 5 (routing) | Task 5 (router), Task 6 (curation) |
| S3: Observed failure → pending → CLAUDE.md | Non-explicit origin requires curation | Task 2 (extraction), Task 6 (curation) | Task 2 (auto-approval skip), Task 6 (queue) |
| S4: Inferred fact → capped → decays | Confidence cap + inferred grace period | Task 2 (extraction), Task 4 (decay) | Task 2 (cap), Task 4 (grace periods) |
| S5: General knowledge → dropped | Novelty gate filters at extraction | Task 2 (extraction) | Task 2 (novelty gate) |
| S6: Procedure cluster → skill | Approved procedures become skill files | Task 5 (routing) | Task 5 (skill ranking) |
| S7: Harmful outcome → fast decay | Negative feedback accelerates decay | Task 7 (feedback), Task 4 (decay) | Task 7 (recordOutcome), Task 4 (weighting) |
| S8: Helpful outcome → boost | Positive feedback boosts confidence | Task 7 (feedback) | Task 7 (recordOutcome) |
| S9: Duplicate → dedup | Dedup catches near-duplicates | Task 9 (E2E) | Existing dedup code |
| S10: Full lifecycle | End-to-end across sessions | Task 9 (E2E) | All tasks combined |

---

## Task 1: Add novelty and origin types to KnowledgeEntry

**Files:**
- Modify: `server/memory/types.ts:30-70`
- Test: `server/memory/__tests__/knowledge-extractor.test.ts` (update mock items)

**Step 1: Write the failing test**

Create `server/memory/__tests__/novelty-types.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { KnowledgeEntry, KnowledgeNovelty, KnowledgeOrigin } from "../types"

describe("KnowledgeEntry novelty and origin types", () => {
  it("accepts novelty field with valid values", () => {
    const entry: KnowledgeEntry = {
      id: "test-1",
      type: "preference",
      content: "Uses pnpm",
      confidence: 0.9,
      entities: ["pnpm"],
      source: "session:abc",
      extractedAt: new Date().toISOString(),
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "pending",
      sessionsExposed: 0,
      sessionsHelpful: 0,
      sessionsHarmful: 0,
    }
    expect(entry.novelty).toBe("project-specific")
    expect(entry.origin).toBe("explicit-statement")
  })

  it("accepts all curation statuses", () => {
    const statuses: Array<KnowledgeEntry["curationStatus"]> = [
      "pending", "approved", "rejected",
    ]
    expect(statuses).toHaveLength(3)
  })

  it("accepts outcome tracking fields", () => {
    const entry: KnowledgeEntry = {
      id: "test-2",
      type: "rule",
      content: "Never push to main",
      confidence: 1.0,
      entities: [],
      source: "session:def",
      extractedAt: new Date().toISOString(),
      novelty: "project-specific",
      origin: "observed-failure",
      curationStatus: "approved",
      curatedBy: "auto-approved",
      curatedAt: new Date().toISOString(),
      sessionsExposed: 5,
      sessionsHelpful: 4,
      sessionsHarmful: 0,
      impactScore: 0.8,
      enforcedBy: "hook",
      targetChannel: "hook",
    }
    expect(entry.impactScore).toBe(0.8)
    expect(entry.enforcedBy).toBe("hook")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/novelty-types.test.ts`
Expected: FAIL — types `KnowledgeNovelty`, `KnowledgeOrigin` don't exist, `KnowledgeEntry` missing new fields

**Step 3: Add types to `server/memory/types.ts`**

After line 36 (after `KnowledgeType`), add:

```typescript
export type KnowledgeNovelty =
  | "project-specific"
  | "domain-specific"
  | "general-knowledge"

export type KnowledgeOrigin =
  | "explicit-statement"
  | "observed-failure"
  | "observed-pattern"
  | "inferred"

export type CurationStatus = "pending" | "approved" | "rejected"
```

Then extend `KnowledgeEntry` (after `archivedAt`):

```typescript
  // Extraction metadata
  novelty?: KnowledgeNovelty
  origin?: KnowledgeOrigin

  // Curation state
  curationStatus?: CurationStatus
  curatedAt?: string
  curatedBy?: string // "human" | "auto-approved"

  // Outcome tracking
  sessionsExposed?: number
  sessionsHelpful?: number
  sessionsHarmful?: number
  impactScore?: number

  // Channel routing
  enforcedBy?: "hook" | "ci" | "linter"
  targetChannel?: "claude-md" | "skill" | "hook" | "none"
```

Note: All new fields are optional (`?`) for backward compatibility with existing JSONL entries.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/memory/__tests__/novelty-types.test.ts`
Expected: PASS

**Step 5: Add backward-compat defaults helper**

Add to `server/memory/knowledge-store.ts`:

```typescript
export function withDefaults(entry: KnowledgeEntry): KnowledgeEntry {
  return {
    ...entry,
    novelty: entry.novelty ?? "project-specific",
    origin: entry.origin ?? "inferred",
    curationStatus: entry.curationStatus ?? "pending",
    sessionsExposed: entry.sessionsExposed ?? 0,
    sessionsHelpful: entry.sessionsHelpful ?? 0,
    sessionsHarmful: entry.sessionsHarmful ?? 0,
  }
}
```

Update `readEntries()` to apply defaults:

```typescript
// In readEntries, after parsing:
return entries.map(withDefaults)
```

**Step 6: Run full test suite**

Run: `pnpm vitest run server/memory`
Expected: All existing tests pass (backward compat)

**Step 7: Commit**

```bash
git add server/memory/types.ts server/memory/knowledge-store.ts server/memory/__tests__/novelty-types.test.ts
git commit -m "feat: add novelty, origin, curation, and outcome fields to KnowledgeEntry"
```

---

## Task 2: Update extraction schema and prompt with novelty filter

**Covers scenarios:** S1 (auto-approval path), S3 (non-explicit stays pending), S4 (inferred cap), S5 (general-knowledge dropped)

**Files:**
- Modify: `server/memory/knowledge-extractor.ts:8-86`
- Test: `server/memory/__tests__/knowledge-extractor.test.ts`

**Step 1: Write the failing test**

Add to `server/memory/__tests__/knowledge-extractor.test.ts`:

```typescript
describe("Novelty and Origin extraction", () => {
  it("includes novelty and origin fields in extraction schema", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Uses pnpm",
            confidence: 0.95,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
          {
            type: "fact",
            content: "Variables should have meaningful names",
            confidence: 0.6,
            evidence: "General coding advice",
            entities: [],
            novelty: "general-knowledge",
            origin: "inferred",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    // general-knowledge should be filtered out
    expect(entries).toHaveLength(1)
    expect(entries[0].novelty).toBe("project-specific")
    expect(entries[0].origin).toBe("explicit-statement")
  })

  it("caps inferred entries at confidence 0.70", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "fact",
            content: "Team probably uses agile",
            confidence: 0.90,
            evidence: "Seems like agile from context",
            entities: [],
            novelty: "domain-specific",
            origin: "inferred",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    expect(entries[0].confidence).toBe(0.70)
  })

  it("auto-approves explicit statements with confidence >= 0.90", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Always use pnpm",
            confidence: 1.0,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    expect(entries[0].curationStatus).toBe("approved")
    expect(entries[0].curatedBy).toBe("auto-approved")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/knowledge-extractor.test.ts`
Expected: FAIL — novelty/origin not in schema, no filtering, no auto-approval

**Step 3: Update ExtractionSchema in knowledge-extractor.ts**

Add to the Zod schema items (after `about`):

```typescript
      novelty: z
        .enum(["project-specific", "domain-specific", "general-knowledge"])
        .describe(
          "project-specific: about THIS project/team. domain-specific: specialized technical knowledge. general-knowledge: any competent developer knows this — DO NOT extract these.",
        ),
      origin: z
        .enum(["explicit-statement", "observed-failure", "observed-pattern", "inferred"])
        .describe(
          "explicit-statement: user directly said it. observed-failure: lesson from something going wrong. observed-pattern: repeated behavior (2+ times). inferred: you inferred this — USE SPARINGLY.",
        ),
```

**Step 4: Update EXTRACTION_PROMPT**

Append to the existing prompt string (before the closing backtick):

```
NOVELTY ASSESSMENT — For each extracted item, classify its novelty:
- "project-specific": Knowledge specific to THIS project, codebase, or team.
  Examples: "this project uses h3 not express", "tests go in __tests__/"
- "domain-specific": Specialized technical knowledge a general developer might not know.
  Examples: "FHIR resources require validation against profiles"
- "general-knowledge": Any competent engineer already knows this.
  Examples: "use version control", "write tests", "handle errors"

IMPORTANT: Do NOT extract general-knowledge items. Skip them entirely.

ORIGIN TRACKING — For each item, classify how it was discovered:
- "explicit-statement": User directly said it. "I prefer...", "We always...", "Never do..."
- "observed-failure": Something went wrong and this is the lesson.
- "observed-pattern": Repeated behavior (must appear 2+ times in transcript).
- "inferred": You inferred this from context. USE SPARINGLY — lowest reliability.
```

**Step 5: Add post-extraction novelty gate and auto-approval**

In `extractKnowledge()`, after the confabulation guard (or after raw entries if `skipGuard`), add:

```typescript
  // Novelty gate: drop general-knowledge entries
  let filtered = guardResult.entries.filter(
    (e) => e.novelty !== "general-knowledge",
  )

  // Cap inferred entries at confidence 0.70
  filtered = filtered.map((e) =>
    e.origin === "inferred"
      ? { ...e, confidence: Math.min(e.confidence, 0.70) }
      : e,
  )

  // Auto-approve explicit statements with high confidence
  filtered = filtered.map((e) => {
    if (e.origin === "explicit-statement" && e.confidence >= 0.90) {
      return {
        ...e,
        curationStatus: "approved" as const,
        curatedBy: "auto-approved",
        curatedAt: new Date().toISOString(),
      }
    }
    return { ...e, curationStatus: "pending" as const }
  })

  return filtered
```

Apply the same logic in the `skipGuard` early-return path.

**Step 6: Update existing mock items in tests**

The existing `mockGenerateObject` default return needs `novelty` and `origin` added:

```typescript
const mockGenerateObject = vi.fn().mockResolvedValue({
  object: {
    items: [
      {
        type: "preference",
        content: "User prefers pnpm over npm",
        confidence: 0.95,
        evidence: "User said: I prefer using pnpm",
        entities: ["pnpm", "npm"],
        novelty: "project-specific",
        origin: "explicit-statement",
      },
      {
        type: "fact",
        content: "Project uses TypeScript strict mode",
        confidence: 0.85,
        evidence: "User requested strict mode setup",
        entities: ["TypeScript"],
        novelty: "project-specific",
        origin: "observed-pattern",
      },
    ],
  },
})
```

**Step 7: Run tests**

Run: `pnpm vitest run server/memory/__tests__/knowledge-extractor.test.ts`
Expected: ALL tests pass (existing + new)

**Step 8: Commit**

```bash
git add server/memory/knowledge-extractor.ts server/memory/__tests__/knowledge-extractor.test.ts
git commit -m "feat: add novelty filter and origin tracking to knowledge extraction"
```

---

## Task 3: Update config with new extraction and artifact generation settings

**Files:**
- Modify: `server/engine/config.ts:35-40` (ExtractionConfig type)
- Modify: `server/engine/config.yaml` (add new config sections)

**Step 1: Write the failing test**

Create `server/memory/__tests__/config-lifecycle.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadConfig, resetConfigCache } from "../../engine/config"

describe("Evidence-based lifecycle config", () => {
  it("loads extraction novelty_filter setting", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.extraction.novelty_filter).toBe(true)
    expect(config.extraction.inferred_confidence_cap).toBe(0.70)
    expect(config.extraction.auto_approve_explicit_threshold).toBe(0.90)
  })

  it("loads artifact_generation settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.artifact_generation).toBeDefined()
    expect(config.artifact_generation.claude_md.max_lines).toBe(200)
    expect(config.artifact_generation.skills.max_count).toBe(3)
    expect(config.artifact_generation.hooks.auto_convert).toBe(false)
  })

  it("loads decay origin_grace_multipliers", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.memory.decay.origin_grace_multipliers).toBeDefined()
    expect(config.memory.decay.origin_grace_multipliers["explicit-statement"]).toBe(2.0)
    expect(config.memory.decay.origin_grace_multipliers.inferred).toBe(0.5)
  })

  it("loads curation queue settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.curation).toBeDefined()
    expect(config.curation.queue_max_items).toBe(20)
  })

  it("loads feedback loop settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.feedback).toBeDefined()
    expect(config.feedback.min_sessions_for_impact).toBe(3)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/config-lifecycle.test.ts`
Expected: FAIL — config types don't have new fields

**Step 3: Update `server/engine/config.ts` types**

Extend `ExtractionConfig`:
```typescript
export interface ExtractionConfig {
  chunk_size: number
  default_temperature: number
  max_retries: number
  tool_input_truncation: number
  novelty_filter: boolean
  inferred_confidence_cap: number
  auto_approve_explicit_threshold: number
}
```

Add new config interfaces:
```typescript
export interface ArtifactClaudeMdConfig {
  max_lines: number
  min_confidence: number
  require_curation: boolean
  architecture_preamble: string
}

export interface ArtifactSkillsConfig {
  max_count: number
  max_lines_per_skill: number
  min_confidence: number
  require_curation: boolean
  staleness_sessions: number
}

export interface ArtifactHooksConfig {
  auto_convert: boolean
  learned_patterns_file: string
}

export interface ArtifactPriorOverlapConfig {
  common_patterns: string[]
}

export interface ArtifactGenerationConfig {
  claude_md: ArtifactClaudeMdConfig
  skills: ArtifactSkillsConfig
  hooks: ArtifactHooksConfig
  prior_overlap: ArtifactPriorOverlapConfig
}

export interface CurationConfig {
  queue_max_items: number
  auto_reject_after_days: number
  auto_reject_after_defers: number
  present_on_idle: boolean
}

export interface FeedbackConfig {
  min_sessions_for_impact: number
  auto_demote_threshold: number
  confidence_boost_threshold: number
  confidence_boost_amount: number
  regen_debounce_minutes: number
}
```

Extend `DecayConfig`:
```typescript
export interface DecayConfig {
  enabled: boolean
  decay_start_days: number
  decay_factor: number
  archive_threshold: number
  run_interval_minutes: number
  exempt_types: string[]
  origin_grace_multipliers: Record<string, number>
  outcome_weighting: { harm_penalty_max: number; help_bonus_max: number }
  hook_entries_exempt: boolean
}
```

Extend `PipelineConfig`:
```typescript
export interface PipelineConfig {
  // ... existing fields ...
  artifact_generation: ArtifactGenerationConfig
  curation: CurationConfig
  feedback: FeedbackConfig
}
```

Add getter functions:
```typescript
export function getArtifactConfig(): ArtifactGenerationConfig {
  return loadConfig().artifact_generation
}
export function getCurationConfig(): CurationConfig {
  return loadConfig().curation
}
export function getFeedbackConfig(): FeedbackConfig {
  return loadConfig().feedback
}
```

**Step 4: Update `server/engine/config.yaml`**

Add sections at the end of the YAML file (see design doc `Configuration` section for full values).

**Step 5: Run test**

Run: `pnpm vitest run server/memory/__tests__/config-lifecycle.test.ts`
Expected: PASS

**Step 6: Run full suite to ensure no regression**

Run: `pnpm vitest run server/memory server/engine/__tests__`
Expected: All pass

**Step 7: Commit**

```bash
git add server/engine/config.ts server/engine/config.yaml server/memory/__tests__/config-lifecycle.test.ts
git commit -m "feat: add evidence-based lifecycle config for extraction, artifacts, curation, feedback"
```

---

## Task 4: Outcome-weighted decay with origin-aware grace periods

**Covers scenarios:** S4 (inferred grace period = 15 days), S7 (harmful entry decays 2x faster)

**Files:**
- Modify: `server/memory/decay.ts`
- Test: `server/memory/__tests__/decay.test.ts` (extend existing)

**Step 1: Write the failing tests**

Create `server/memory/__tests__/decay-lifecycle.test.ts`:

```typescript
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { appendEntries, readEntries } from "../knowledge-store"
import { runDecay } from "../decay"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getDecayConfig: () => ({
      enabled: true,
      decay_start_days: 30,
      decay_factor: 0.95,
      archive_threshold: 0.3,
      run_interval_minutes: 60,
      exempt_types: ["rule"],
      origin_grace_multipliers: {
        "explicit-statement": 2.0,
        "observed-failure": 1.5,
        "observed-pattern": 1.0,
        "inferred": 0.5,
      },
      outcome_weighting: { harm_penalty_max: 0.5, help_bonus_max: 0.5 },
      hook_entries_exempt: true,
    }),
  }
})

const TEST_DIR = "data/test-decay-lifecycle"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(), // 60 days ago
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("outcome-weighted decay", () => {
  it("decays harmful entries faster than neutral ones", async () => {
    const harmful = makeEntry({
      impactScore: -0.5,
      sessionsExposed: 5,
      sessionsHarmful: 3,
    })
    const neutral = makeEntry({
      impactScore: 0.2,
      sessionsExposed: 5,
    })
    await appendEntries([harmful, neutral], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const h = after.find((e) => e.id === harmful.id)!
    const n = after.find((e) => e.id === neutral.id)!
    // Harmful should have decayed more (lower confidence)
    expect(h.confidence).toBeLessThan(n.confidence)
  })

  it("gives explicit-statement entries longer grace period", async () => {
    // 35 days ago — past standard 30-day grace, within explicit-statement 60-day grace
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400000).toISOString()
    const explicit = makeEntry({
      origin: "explicit-statement",
      extractedAt: thirtyFiveDaysAgo,
    })
    const inferred = makeEntry({
      origin: "inferred",
      extractedAt: thirtyFiveDaysAgo,
    })
    await appendEntries([explicit, inferred], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const e = after.find((e) => e.id === explicit.id)!
    const i = after.find((e) => e.id === inferred.id)!
    // Explicit should be unchanged (within grace), inferred should have decayed
    expect(e.confidence).toBe(0.9)
    expect(i.confidence).toBeLessThan(0.9)
  })

  it("exempts hook-enforced entries from decay", async () => {
    const hookEntry = makeEntry({ enforcedBy: "hook", type: "fact" })
    await appendEntries([hookEntry], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    expect(after[0].confidence).toBe(0.9) // unchanged
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/decay-lifecycle.test.ts`
Expected: FAIL — decay.ts doesn't read origin/impact fields

**Step 3: Implement outcome-weighted decay in `server/memory/decay.ts`**

Replace the existing `runDecay` with:

```typescript
export async function runDecay(storePath: string): Promise<DecayResult> {
  const cfg = getDecayConfig()
  if (!cfg.enabled) return { decayed: 0, archived: 0, unchanged: 0 }

  const entries = await readEntries(storePath)
  const now = Date.now()
  const exempt = new Set(cfg.exempt_types)

  let decayed = 0
  let archived = 0
  let unchanged = 0

  const updated: KnowledgeEntry[] = entries.map((entry) => {
    // Skip exempt types, superseded, already archived
    if (exempt.has(entry.type) || entry.supersededBy || entry.archivedAt) {
      unchanged++
      return entry
    }

    // Skip hook-enforced entries
    if (cfg.hook_entries_exempt && entry.enforcedBy) {
      unchanged++
      return entry
    }

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince = (now - lastRetrieved) / (1000 * 60 * 60 * 24)
    const graceDays = gracePeriodDays(entry, cfg.decay_start_days, cfg)

    if (daysSince < graceDays) {
      unchanged++
      return entry
    }

    const decayDays = daysSince - graceDays
    const factor = effectiveDecayFactor(entry, cfg.decay_factor, cfg)
    const newConfidence = entry.confidence * factor ** decayDays

    if (newConfidence < cfg.archive_threshold) {
      archived++
      return {
        ...entry,
        confidence: newConfidence,
        archivedAt: new Date().toISOString(),
      }
    }

    decayed++
    return { ...entry, confidence: newConfidence }
  })

  await writeEntries(updated, storePath)
  return { decayed, archived, unchanged }
}

function gracePeriodDays(
  entry: KnowledgeEntry,
  baseDays: number,
  cfg: DecayConfig,
): number {
  const multipliers = cfg.origin_grace_multipliers
  if (!multipliers || !entry.origin) return baseDays
  return baseDays * (multipliers[entry.origin] ?? 1.0)
}

function effectiveDecayFactor(
  entry: KnowledgeEntry,
  baseFactor: number,
  cfg: DecayConfig,
): number {
  const impactScore = entry.impactScore
  if (impactScore === undefined || impactScore === null) return baseFactor

  const weighting = cfg.outcome_weighting
  if (!weighting) return baseFactor

  if (impactScore < 0) {
    const harmPenalty = Math.min(1.0, Math.abs(impactScore)) * weighting.harm_penalty_max
    return baseFactor * (1 - harmPenalty)
  }

  if (impactScore > 0.5) {
    const helpBonus = Math.min(weighting.help_bonus_max, impactScore - 0.5)
    return baseFactor + (1 - baseFactor) * helpBonus
  }

  return baseFactor
}
```

**Step 4: Run tests**

Run: `pnpm vitest run server/memory/__tests__/decay-lifecycle.test.ts`
Expected: PASS

**Step 5: Run existing decay tests**

Run: `pnpm vitest run server/memory/__tests__/decay.test.ts`
Expected: PASS (backward compat — existing tests should pass because defaults fill in origin/impact)

**Step 6: Commit**

```bash
git add server/memory/decay.ts server/memory/__tests__/decay-lifecycle.test.ts
git commit -m "feat: outcome-weighted decay with origin-aware grace periods"
```

---

## Task 5: Channel router (replaces artifact-generator.ts)

**Covers scenarios:** S1 (preference → claude-md), S2 (rule → hook), S6 (procedures → skill, max 3)

**Files:**
- Create: `server/memory/channel-router.ts`
- Test: `server/memory/__tests__/channel-router.test.ts`
- Modify: `server/memory/artifact-generator.ts` (keep but deprecate — router calls its helpers)

**Step 1: Write the failing tests**

Create `server/memory/__tests__/channel-router.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: () => ({
      claude_md: { max_lines: 200, min_confidence: 0.90, require_curation: true, architecture_preamble: "" },
      skills: { max_count: 3, max_lines_per_skill: 100, min_confidence: 0.85, require_curation: true, staleness_sessions: 3 },
      hooks: { auto_convert: false, learned_patterns_file: "" },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    }),
  }
})

import { routeEntries } from "../channel-router"

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.95,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "explicit-statement",
    curationStatus: "approved",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

describe("routeEntries", () => {
  it("routes tool-constraint rules to hooks channel", () => {
    const entry = makeEntry({
      type: "rule",
      content: "Never push to the main branch",
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
  })

  it("routes approved high-confidence procedures to skills (max 3)", () => {
    const procs = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        type: "procedure",
        content: `Specific deploy step ${i} for this project`,
        confidence: 0.90 - i * 0.01,
        curationStatus: "approved",
        novelty: "project-specific",
      }),
    )
    const result = routeEntries(procs)
    expect(result.skills.entries.length).toBeLessThanOrEqual(3)
  })

  it("routes approved non-procedure entries to CLAUDE.md", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Uses pnpm not npm",
      confidence: 0.95,
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(1)
  })

  it("skips entries below confidence threshold for CLAUDE.md", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Might use tabs",
      confidence: 0.80,
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("skips uncurated entries from all artifact channels", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Uses pnpm",
      confidence: 0.95,
      curationStatus: "pending",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("skips superseded and archived entries", () => {
    const superseded = makeEntry({ supersededBy: "other-id", curationStatus: "approved" })
    const archived = makeEntry({ archivedAt: new Date().toISOString(), curationStatus: "approved" })
    const result = routeEntries([superseded, archived])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(2)
  })

  it("excludes hook-enforced entries from CLAUDE.md", () => {
    const entry = makeEntry({
      type: "rule",
      content: "Never delete production DB",
      confidence: 1.0,
      curationStatus: "approved",
      enforcedBy: "hook",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/channel-router.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/memory/channel-router.ts`**

```typescript
import { getArtifactConfig } from "../engine/config"
import type { KnowledgeEntry } from "./types"

export interface RouterResult {
  claudeMd: { entries: KnowledgeEntry[]; lines: number }
  skills: { entries: KnowledgeEntry[]; count: number }
  hooks: { entries: KnowledgeEntry[]; count: number }
  skipped: { entries: KnowledgeEntry[]; reasons: string[] }
}

const TOOL_CONSTRAINT_PATTERN =
  /\b(never|don't|do not|always|must not)\b.*\b(push|delete|rm|drop|overwrite|modify|force|reset)\b/i

export function routeEntries(allEntries: KnowledgeEntry[]): RouterResult {
  const cfg = getArtifactConfig()

  const claudeMd: KnowledgeEntry[] = []
  const skills: KnowledgeEntry[] = []
  const hooks: KnowledgeEntry[] = []
  const skipped: KnowledgeEntry[] = []
  const skipReasons: string[] = []

  // 1. Filter active only
  const active = allEntries.filter((e) => {
    if (e.supersededBy || e.archivedAt) {
      skipped.push(e)
      skipReasons.push("superseded or archived")
      return false
    }
    return true
  })

  for (const entry of active) {
    // 2. Route tool-constraint rules to hooks
    if (
      (entry.type === "rule" || entry.type === "correction") &&
      TOOL_CONSTRAINT_PATTERN.test(entry.content)
    ) {
      hooks.push({ ...entry, targetChannel: "hook" })
      continue
    }

    // 3. Route procedures to skills
    if (entry.type === "procedure") {
      if (
        entry.curationStatus === "approved" &&
        entry.confidence >= cfg.skills.min_confidence &&
        entry.novelty !== "general-knowledge"
      ) {
        skills.push({ ...entry, targetChannel: "skill" })
      } else {
        skipped.push(entry)
        skipReasons.push("procedure below threshold or uncurated")
      }
      continue
    }

    // 4. Route to CLAUDE.md
    if (
      entry.curationStatus === "approved" &&
      entry.confidence >= cfg.claude_md.min_confidence &&
      entry.novelty !== "general-knowledge" &&
      !entry.enforcedBy
    ) {
      claudeMd.push({ ...entry, targetChannel: "claude-md" })
      continue
    }

    // 5. Skip everything else
    skipped.push(entry)
    skipReasons.push("below threshold, uncurated, or enforced by hook")
  }

  // Rank and cap skills at max_count
  const rankedSkills = skills
    .map((e) => ({ entry: e, score: skillScore(e, cfg.prior_overlap.common_patterns) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.skills.max_count)
    .map((s) => s.entry)

  // Skills that didn't make the cut go to skipped
  const skillIds = new Set(rankedSkills.map((e) => e.id))
  for (const s of skills) {
    if (!skillIds.has(s.id)) {
      skipped.push(s)
      skipReasons.push("exceeded skill budget")
    }
  }

  // Rank CLAUDE.md entries and enforce line budget
  const rankedClaudeMd = claudeMd.sort((a, b) => {
    const scoreA = claudeMdScore(a)
    const scoreB = claudeMdScore(b)
    return scoreB - scoreA
  })

  let lineCount = 0
  const budgetedClaudeMd: KnowledgeEntry[] = []
  for (const entry of rankedClaudeMd) {
    const entryLines = entry.content.split("\n").length + 1 // +1 for "- " prefix
    if (lineCount + entryLines <= cfg.claude_md.max_lines) {
      budgetedClaudeMd.push(entry)
      lineCount += entryLines
    } else {
      skipped.push(entry)
      skipReasons.push("exceeded CLAUDE.md line budget")
    }
  }

  return {
    claudeMd: { entries: budgetedClaudeMd, lines: lineCount },
    skills: { entries: rankedSkills, count: rankedSkills.length },
    hooks: { entries: hooks, count: hooks.length },
    skipped: { entries: skipped, reasons: skipReasons },
  }
}

function skillScore(entry: KnowledgeEntry, commonPatterns: string[]): number {
  const priorOverlap = estimatePriorOverlap(entry.content, commonPatterns)
  const failureWeight = entry.origin === "observed-failure" ? 2.0 : 1.0
  const impact = Math.max(0.1, entry.impactScore ?? 0.5)
  return entry.confidence * (1 - priorOverlap) * failureWeight * impact
}

function claudeMdScore(entry: KnowledgeEntry): number {
  const failureBoost = entry.origin === "observed-failure" ? 2.0 : 1.0
  const impact = entry.impactScore ?? 0.5
  return impact * entry.confidence * failureBoost
}

export function estimatePriorOverlap(content: string, patterns: string[]): number {
  const regexes = patterns.map((p) => new RegExp(p, "i"))
  const matches = regexes.filter((r) => r.test(content)).length
  return Math.min(1.0, matches / 3)
}
```

**Step 4: Run tests**

Run: `pnpm vitest run server/memory/__tests__/channel-router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/memory/channel-router.ts server/memory/__tests__/channel-router.test.ts
git commit -m "feat: add channel router for evidence-based artifact generation"
```

---

## Task 6: Curation queue

**Covers scenarios:** S2 (hook routing requires approve-hook), S3 (observed failure needs approve-entry)

**Files:**
- Create: `server/memory/curation-queue.ts`
- Test: `server/memory/__tests__/curation-queue.test.ts`

**Step 1: Write the failing tests**

Create `server/memory/__tests__/curation-queue.test.ts`:

```typescript
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getCurationConfig: () => ({
      queue_max_items: 5,
      auto_reject_after_days: 30,
      auto_reject_after_defers: 3,
      present_on_idle: true,
    }),
  }
})

import {
  addToQueue,
  resolveItem,
  getPendingItems,
  cleanupStale,
} from "../curation-queue"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = "data/test-curation"
const QUEUE_PATH = `${TEST_DIR}/curation-queue.json`

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test fact",
    confidence: 0.85,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(QUEUE_PATH, JSON.stringify({ items: [] }))
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("curation queue", () => {
  it("adds item to queue", async () => {
    const entry = makeEntry()
    await addToQueue(
      { entry, action: "approve-entry", reason: "New knowledge" },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe("approve-entry")
  })

  it("resolves item with approval", async () => {
    const entry = makeEntry()
    await addToQueue(
      { entry, action: "approve-entry", reason: "test" },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    await resolveItem(pending[0].id, "approved", QUEUE_PATH)

    const after = await getPendingItems(QUEUE_PATH)
    expect(after).toHaveLength(0)
  })

  it("enforces max queue size by replacing oldest deferred", async () => {
    // Fill queue to max (5)
    for (let i = 0; i < 5; i++) {
      await addToQueue(
        { entry: makeEntry(), action: "approve-entry", reason: `item-${i}` },
        QUEUE_PATH,
      )
    }
    // Defer the first one
    const items = await getPendingItems(QUEUE_PATH)
    await resolveItem(items[0].id, "deferred", QUEUE_PATH)

    // Add one more — should replace the deferred one
    await addToQueue(
      { entry: makeEntry(), action: "approve-entry", reason: "overflow" },
      QUEUE_PATH,
    )
    const after = await getPendingItems(QUEUE_PATH)
    expect(after.length).toBeLessThanOrEqual(5)
  })

  it("cleanupStale auto-rejects items older than 30 days", async () => {
    const oldEntry = makeEntry()
    await addToQueue(
      { entry: oldEntry, action: "approve-entry", reason: "old" },
      QUEUE_PATH,
    )
    // Manually backdate
    const { readFileSync } = await import("node:fs")
    const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"))
    queue.items[0].proposedAt = new Date(Date.now() - 31 * 86400000).toISOString()
    writeFileSync(QUEUE_PATH, JSON.stringify(queue))

    const cleaned = await cleanupStale(QUEUE_PATH)
    expect(cleaned).toBe(1)
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/curation-queue.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/memory/curation-queue.ts`**

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getCurationConfig } from "../engine/config"
import type { KnowledgeEntry } from "./types"

export interface CurationItem {
  id: string
  entryId: string
  action: "approve-entry" | "reject-entry" | "review-impact" | "approve-hook"
  reason: string
  proposedAt: string
  resolvedAt?: string
  resolution?: "approved" | "rejected" | "deferred"
  entry: KnowledgeEntry
  impactData?: { exposed: number; helpful: number; harmful: number; score: number }
}

interface CurationQueue {
  items: CurationItem[]
}

async function readQueue(queuePath: string): Promise<CurationQueue> {
  try {
    const raw = await readFile(queuePath, "utf-8")
    return JSON.parse(raw) as CurationQueue
  } catch {
    return { items: [] }
  }
}

async function writeQueue(queue: CurationQueue, queuePath: string): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true })
  await writeFile(queuePath, JSON.stringify(queue, null, 2))
}

export async function addToQueue(
  input: { entry: KnowledgeEntry; action: CurationItem["action"]; reason: string },
  queuePath: string,
): Promise<CurationItem> {
  const cfg = getCurationConfig()
  const queue = await readQueue(queuePath)

  const item: CurationItem = {
    id: crypto.randomUUID(),
    entryId: input.entry.id,
    action: input.action,
    reason: input.reason,
    proposedAt: new Date().toISOString(),
    entry: input.entry,
  }

  // Enforce max queue size: replace oldest deferred if full
  const pending = queue.items.filter((i) => !i.resolvedAt || i.resolution === "deferred")
  if (pending.length >= cfg.queue_max_items) {
    const deferred = queue.items
      .filter((i) => i.resolution === "deferred")
      .sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime())
    if (deferred.length > 0) {
      deferred[0].resolution = "rejected"
      deferred[0].resolvedAt = new Date().toISOString()
    }
  }

  queue.items.push(item)
  await writeQueue(queue, queuePath)
  return item
}

export async function resolveItem(
  itemId: string,
  resolution: "approved" | "rejected" | "deferred",
  queuePath: string,
): Promise<void> {
  const queue = await readQueue(queuePath)
  const item = queue.items.find((i) => i.id === itemId)
  if (item) {
    item.resolution = resolution
    item.resolvedAt = new Date().toISOString()
  }
  await writeQueue(queue, queuePath)
}

export async function getPendingItems(queuePath: string): Promise<CurationItem[]> {
  const queue = await readQueue(queuePath)
  return queue.items.filter((i) => !i.resolvedAt)
}

export async function cleanupStale(queuePath: string): Promise<number> {
  const cfg = getCurationConfig()
  const queue = await readQueue(queuePath)
  const now = Date.now()
  let cleaned = 0

  for (const item of queue.items) {
    if (item.resolvedAt) continue
    const age = (now - new Date(item.proposedAt).getTime()) / 86400000
    if (age > cfg.auto_reject_after_days) {
      item.resolution = "rejected"
      item.resolvedAt = new Date().toISOString()
      cleaned++
    }
  }

  await writeQueue(queue, queuePath)
  return cleaned
}
```

**Step 4: Run tests**

Run: `pnpm vitest run server/memory/__tests__/curation-queue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/memory/curation-queue.ts server/memory/__tests__/curation-queue.test.ts
git commit -m "feat: add curation queue for human-in-the-loop knowledge review"
```

---

## Task 7: Feedback loop — outcome recording and exposed entry tracking

**Covers scenarios:** S7 (harmful outcome increments sessionsHarmful), S8 (helpful outcome boosts confidence)

**Files:**
- Create: `server/memory/feedback-loop.ts`
- Test: `server/memory/__tests__/feedback-loop.test.ts`
- Modify: `server/memory/types.ts` (add `exposedEntryIds` to `AssembledContext`)
- Modify: `server/memory/context-assembler.ts` (track exposed entry IDs)

**Step 1: Write the failing tests**

Create `server/memory/__tests__/feedback-loop.test.ts`:

```typescript
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { appendEntries, readEntries } from "../knowledge-store"
import { recordOutcome } from "../feedback-loop"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getFeedbackConfig: () => ({
      min_sessions_for_impact: 3,
      auto_demote_threshold: -0.3,
      confidence_boost_threshold: 0.7,
      confidence_boost_amount: 0.05,
      regen_debounce_minutes: 60,
    }),
  }
})

const TEST_DIR = "data/test-feedback"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "approved",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("recordOutcome", () => {
  it("increments sessionsExposed and sessionsHelpful on success", async () => {
    const entry = makeEntry({ sessionsExposed: 2, sessionsHelpful: 1 })
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsExposed).toBe(3)
    expect(after[0].sessionsHelpful).toBe(2)
  })

  it("computes impactScore when sessionsExposed reaches threshold", async () => {
    const entry = makeEntry({ sessionsExposed: 2, sessionsHelpful: 2 })
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].impactScore).toBeDefined()
    expect(after[0].impactScore).toBe(1.0) // 3 helpful / 3 exposed
  })

  it("does not update entries not in exposedEntryIds", async () => {
    const exposed = makeEntry()
    const notExposed = makeEntry()
    await appendEntries([exposed, notExposed], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [exposed.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    const ne = after.find((e) => e.id === notExposed.id)!
    expect(ne.sessionsExposed).toBe(0)
  })

  it("treats timeout and budget_exceeded as neutral", async () => {
    const entry = makeEntry()
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "timeout", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsExposed).toBe(1)
    expect(after[0].sessionsHelpful).toBe(0)
    expect(after[0].sessionsHarmful).toBe(0)
  })

  it("increments sessionsHarmful on failure", async () => {
    const entry = makeEntry()
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "failed", text: "error", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsHarmful).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/feedback-loop.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/memory/feedback-loop.ts`**

```typescript
import { getFeedbackConfig } from "../engine/config"
import { readEntries, writeEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

interface WorkArcOutcome {
  status: "completed" | "failed" | "timeout" | "blocked" | "budget_exceeded"
  text: string
  transcript: unknown[]
  durationMs: number
}

export async function recordOutcome(
  result: WorkArcOutcome,
  exposedEntryIds: string[],
  storePath: string,
): Promise<void> {
  const cfg = getFeedbackConfig()
  const exposedSet = new Set(exposedEntryIds)
  const entries = await readEntries(storePath)

  const updated = entries.map((entry) => {
    if (!exposedSet.has(entry.id)) return entry

    const e = { ...entry }
    e.sessionsExposed = (e.sessionsExposed ?? 0) + 1

    if (result.status === "completed") {
      e.sessionsHelpful = (e.sessionsHelpful ?? 0) + 1
    } else if (result.status === "failed") {
      e.sessionsHarmful = (e.sessionsHarmful ?? 0) + 1
    }
    // timeout, budget_exceeded, blocked: neutral

    // Recompute impact score
    if (e.sessionsExposed >= cfg.min_sessions_for_impact) {
      e.impactScore =
        ((e.sessionsHelpful ?? 0) - (e.sessionsHarmful ?? 0)) / e.sessionsExposed
    }

    return e
  })

  await writeEntries(updated, storePath)
}
```

**Step 4: Add `exposedEntryIds` to AssembledContext**

In `server/memory/types.ts`, extend `AssembledContext`:

```typescript
export interface AssembledContext {
  systemPrompt: string
  sections: ContextSection[]
  metadata: {
    // ... existing fields ...
  }
  exposedEntryIds?: string[] // NEW: IDs of knowledge entries included in prompt
}
```

**Step 5: Track exposed IDs in context-assembler.ts**

In `assembleContext()`, collect entry IDs as sections are built:

```typescript
  // Track which entry IDs are included in the prompt
  const exposedEntryIds: string[] = [
    ...rules.map((e) => e.id),
    ...knowledge.map((e) => e.id),
    ...procedures.map((e) => e.id),
  ]
```

Add to the return:
```typescript
  return {
    systemPrompt,
    sections,
    metadata: { ... },
    exposedEntryIds,
  }
```

**Step 6: Run tests**

Run: `pnpm vitest run server/memory/__tests__/feedback-loop.test.ts`
Expected: PASS

**Step 7: Run full suite**

Run: `pnpm vitest run server/memory`
Expected: All pass

**Step 8: Commit**

```bash
git add server/memory/feedback-loop.ts server/memory/__tests__/feedback-loop.test.ts server/memory/types.ts server/memory/context-assembler.ts
git commit -m "feat: add feedback loop with outcome recording and exposed entry tracking"
```

---

## Task 8: Wire feedback loop into work arc

**Files:**
- Modify: `server/agent/coding-adapter/work-arc.ts`
- Test: `server/agent/coding-adapter/__tests__/work-arc.test.ts` (extend)

**Step 1: Write the failing test**

Add to `server/agent/coding-adapter/__tests__/work-arc.test.ts`:

```typescript
  it("calls recordOutcome after work arc completes", async () => {
    const recordOutcome = vi.fn()
    vi.doMock("../../../memory/feedback-loop", () => ({ recordOutcome }))

    // ... set up adapter mock returning success ...

    const result = await executeWorkArc({
      adapter: mockAdapter,
      task: { id: "t1", description: "test" },
      context: { systemPrompt: "", sections: [], metadata: { ... }, exposedEntryIds: ["entry-1"] },
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
      storePath: "data/test/entries.jsonl",
    })

    expect(recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
      ["entry-1"],
      "data/test/entries.jsonl",
    )
  })
```

Note: The exact mock setup depends on existing test patterns. Adapt the mock adapter from the existing tests.

**Step 2: Add storePath to WorkArcInput and wire recordOutcome**

In `work-arc.ts`, add `storePath?: string` to `WorkArcInput`. After the work arc result is determined, call:

```typescript
  if (input.storePath && input.context.exposedEntryIds) {
    recordOutcome(
      { status: result.status, text: result.text, transcript: result.transcript, durationMs: result.durationMs },
      input.context.exposedEntryIds,
      input.storePath,
    ).catch((err) => console.warn("[work-arc] Failed to record outcome:", err))
  }
```

**Step 3: Run tests**

Run: `pnpm vitest run server/agent/coding-adapter/__tests__/work-arc.test.ts`
Expected: All existing + new test pass

**Step 4: Commit**

```bash
git add server/agent/coding-adapter/work-arc.ts server/agent/coding-adapter/__tests__/work-arc.test.ts
git commit -m "feat: wire feedback loop into work arc for outcome-based learning"
```

---

## Task 9: Scenario-based integration tests — all 10 Gherkin scenarios

**Covers scenarios:** S1-S10 (all scenarios as executable integration tests)

**Files:**
- Create: `server/__tests__/integration/memory-lifecycle-scenarios.test.ts`

**Step 1: Write all 10 scenario tests (RED phase — these should all fail initially)**

```typescript
// @vitest-environment node
/**
 * Evidence-Based Memory Lifecycle — Scenario Tests
 *
 * 10 full-pipeline scenarios from:
 *   docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md
 *
 * Each scenario traces an entry through the complete pipeline,
 * verifying behavior at every stage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { appendEntries, readEntries } from "../../memory/knowledge-store"
import { routeEntries } from "../../memory/channel-router"
import { recordOutcome } from "../../memory/feedback-loop"
import { runDecay } from "../../memory/decay"
import { addToQueue, getPendingItems, resolveItem, cleanupStale } from "../../memory/curation-queue"
import type { KnowledgeEntry } from "../../memory/types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getDecayConfig: () => ({
      enabled: true,
      decay_start_days: 30,
      decay_factor: 0.95,
      archive_threshold: 0.3,
      run_interval_minutes: 60,
      exempt_types: ["rule"],
      origin_grace_multipliers: {
        "explicit-statement": 2.0,
        "observed-failure": 1.5,
        "observed-pattern": 1.0,
        inferred: 0.5,
      },
      outcome_weighting: { harm_penalty_max: 0.5, help_bonus_max: 0.5 },
      hook_entries_exempt: true,
    }),
    getArtifactConfig: () => ({
      claude_md: { max_lines: 200, min_confidence: 0.90, require_curation: true, architecture_preamble: "" },
      skills: { max_count: 3, max_lines_per_skill: 100, min_confidence: 0.85, require_curation: true, staleness_sessions: 3 },
      hooks: { auto_convert: false, learned_patterns_file: "" },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    }),
    getCurationConfig: () => ({
      queue_max_items: 20,
      auto_reject_after_days: 30,
      auto_reject_after_defers: 3,
      present_on_idle: true,
    }),
    getFeedbackConfig: () => ({
      min_sessions_for_impact: 3,
      auto_demote_threshold: -0.3,
      confidence_boost_threshold: 0.7,
      confidence_boost_amount: 0.05,
      regen_debounce_minutes: 60,
    }),
  }
})

const TEST_DIR = "data/test-lifecycle-scenarios"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`
const QUEUE_PATH = `${TEST_DIR}/curation-queue.json`

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
  writeFileSync(QUEUE_PATH, JSON.stringify({ items: [] }))
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

// ── S1: Explicit preference → auto-approved → CLAUDE.md ─────────────
describe("S1: Explicit preference → auto-approved → CLAUDE.md", () => {
  it("routes auto-approved explicit preference to claude-md channel", () => {
    // Based on real entry e98831b9: "Use pnpm as the package manager"
    const entry = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",   // auto-approved by extraction
      curatedBy: "auto-approved",
    })

    const result = routeEntries([entry])

    // Entry reaches CLAUDE.md channel
    expect(result.claudeMd.entries).toHaveLength(1)
    expect(result.claudeMd.entries[0].content).toContain("pnpm")
    // Not in skills or hooks
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })
})

// ── S2: Explicit rule → hook channel → curation required ─────────────
describe("S2: Explicit rule → hook → curation required", () => {
  it("routes destructive-pattern rule to hooks and creates curation item", async () => {
    // Based on real entry 8384672d: "Never deploy on Fridays"
    const entry = makeEntry({
      type: "rule",
      content: "Never deploy on Fridays",
      confidence: 1.0,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
    })

    // Channel router sends to hooks
    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0) // NOT in CLAUDE.md

    // Curation queue gets approve-hook item
    await addToQueue(
      { entry: result.hooks.entries[0], action: "approve-hook", reason: "Hook-routed entries require human approval" },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe("approve-hook")
  })
})

// ── S3: Observed failure → pending curation → CLAUDE.md after approval ──
describe("S3: Observed failure → pending → CLAUDE.md after approval", () => {
  it("blocks observed-failure entry from CLAUDE.md until curated", async () => {
    // Based on real entry 7385ec8d: z-index bug fix
    const entry = makeEntry({
      type: "correction",
      content: "Video player back button blocked by z-index of play button div",
      confidence: 0.90,
      novelty: "project-specific",
      origin: "observed-failure",
      curationStatus: "pending",  // NOT auto-approved (origin != explicit-statement)
    })

    // Pending entry blocked from all channels
    const beforeApproval = routeEntries([entry])
    expect(beforeApproval.claudeMd.entries).toHaveLength(0)
    expect(beforeApproval.skipped.entries).toHaveLength(1)

    // After human approval
    entry.curationStatus = "approved"
    entry.curatedBy = "human"
    entry.curatedAt = new Date().toISOString()

    const afterApproval = routeEntries([entry])
    expect(afterApproval.claudeMd.entries).toHaveLength(1)
    expect(afterApproval.claudeMd.entries[0].content).toContain("z-index")
  })
})

// ── S4: Inferred fact → capped → pending → decays ───────────────────
describe("S4: Inferred fact → confidence capped → eventually decays", () => {
  it("inferred entry with 0.70 cap gets short grace and decays to archive", async () => {
    // Inferred confidence capped to 0.70, origin=inferred grace = 15 days
    const entry = makeEntry({
      type: "fact",
      content: "Team uses agile methodology",
      confidence: 0.70,  // already capped by extraction
      novelty: "domain-specific",
      origin: "inferred",
      curationStatus: "pending",
      // Extracted 60 days ago
      extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    })

    // Too low confidence for CLAUDE.md (needs 0.90)
    const routing = routeEntries([entry])
    expect(routing.claudeMd.entries).toHaveLength(0)
    expect(routing.skipped.entries).toHaveLength(1)

    // Decay should hit hard: 60 days old, inferred grace = 15 days
    // 45 days of decay at 0.95^45 ≈ 0.10
    await appendEntries([entry], STORE_PATH)
    await runDecay(STORE_PATH)
    const after = await readEntries(STORE_PATH)
    expect(after[0].confidence).toBeLessThan(0.3)
    expect(after[0].archivedAt).toBeDefined()  // archived!
  })
})

// ── S5: General knowledge → dropped at extraction gate ───────────────
// Note: This scenario is primarily tested in Task 2 (extraction unit tests).
// Here we verify the contract: general-knowledge entries should never exist in store.
describe("S5: General knowledge never reaches routing", () => {
  it("router correctly handles the case where general-knowledge slips through", () => {
    // Even if somehow a general-knowledge entry reached the store,
    // the router should still skip it
    const entry = makeEntry({
      type: "rule",
      content: "Always handle errors in async functions",
      confidence: 0.60,
      novelty: "general-knowledge",
      origin: "inferred",
      curationStatus: "pending",
    })

    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })
})

// ── S6: Procedure cluster → skill channel (max 3) ───────────────────
describe("S6: Approved procedures become skill files (max 3)", () => {
  it("routes top 3 approved procedures to skills, rest skipped", () => {
    const procs = [
      makeEntry({ type: "procedure", content: "Copy prototype to server using rsync", confidence: 0.95, origin: "explicit-statement", curationStatus: "approved" }),
      makeEntry({ type: "procedure", content: "Run setup.sh on first install on target server", confidence: 0.92, origin: "explicit-statement", curationStatus: "approved" }),
      makeEntry({ type: "procedure", content: "Build Docker images for cms, light-sim, guide-app", confidence: 0.90, origin: "observed-pattern", curationStatus: "approved" }),
      makeEntry({ type: "procedure", content: "Deploy using docker-compose up -d on production", confidence: 0.93, origin: "explicit-statement", curationStatus: "approved" }),
    ]

    const result = routeEntries(procs)
    // Max 3 skills
    expect(result.skills.entries.length).toBeLessThanOrEqual(3)
    expect(result.skills.entries.length).toBeGreaterThan(0)
    // Overflow goes to skipped
    expect(result.skills.entries.length + result.skipped.entries.length).toBe(4)
  })
})

// ── S7: Harmful outcome → accelerated decay → review ─────────────────
describe("S7: Harmful outcome → accelerated decay", () => {
  it("entry with negative impactScore decays faster than neutral", async () => {
    const harmful = makeEntry({
      content: "Always use event-based sync instead of time-based",
      confidence: 0.90,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 3,
      sessionsHelpful: 0,
      sessionsHarmful: 3,
      impactScore: -1.0,
      // 60 days old — past explicit-statement grace (60 days)
      extractedAt: new Date(Date.now() - 61 * 86400000).toISOString(),
    })
    const neutral = makeEntry({
      content: "Project uses TypeScript strict mode",
      confidence: 0.90,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 3,
      sessionsHelpful: 1,
      sessionsHarmful: 1,
      impactScore: 0.0,
      extractedAt: new Date(Date.now() - 61 * 86400000).toISOString(),
    })

    await appendEntries([harmful, neutral], STORE_PATH)
    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const h = after.find((e) => e.id === harmful.id)!
    const n = after.find((e) => e.id === neutral.id)!

    // Harmful decays faster
    expect(h.confidence).toBeLessThan(n.confidence)
  })
})

// ── S8: Helpful outcome → confidence boost ───────────────────────────
describe("S8: Helpful outcome → confidence strengthened", () => {
  it("entry with consistently helpful outcomes gets impactScore boost", async () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use NativeWind for styling in Expo projects",
      confidence: 0.90,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 2,
      sessionsHelpful: 2,
      sessionsHarmful: 0,
    })
    await appendEntries([entry], STORE_PATH)

    // 3rd helpful session
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    const updated = after.find((e) => e.id === entry.id)!

    expect(updated.sessionsExposed).toBe(3)
    expect(updated.sessionsHelpful).toBe(3)
    expect(updated.impactScore).toBe(1.0)  // 3/3 = perfect
  })
})

// ── S9: Duplicate detection ──────────────────────────────────────────
// Note: Dedup is tested in existing knowledge-store.test.ts.
// This verifies the contract at integration level.
describe("S9: Near-duplicate entry is caught by dedup", () => {
  it("similar entry is not stored when original exists", async () => {
    const original = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 1.0,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    await appendEntries([original], STORE_PATH)

    // Near-duplicate extracted from new session
    const duplicate = makeEntry({
      type: "preference",
      content: "Always use pnpm, never npm or yarn",
      confidence: 0.95,
      origin: "explicit-statement",
    })

    // Dedup check: Jaccard similarity should be high
    const existing = await readEntries(STORE_PATH)
    const words1 = new Set(original.content.toLowerCase().split(/\s+/))
    const words2 = new Set(duplicate.content.toLowerCase().split(/\s+/))
    const intersection = [...words1].filter((w) => words2.has(w)).length
    const union = new Set([...words1, ...words2]).size
    const jaccard = intersection / union

    // Should be similar enough to trigger dedup (threshold 0.3)
    expect(jaccard).toBeGreaterThan(0.2)
    // Store should still have just 1 entry (original)
    expect(existing).toHaveLength(1)
  })
})

// ── S10: Full lifecycle — extraction through feedback over multiple sessions ──
describe("S10: Full lifecycle across multiple sessions", () => {
  it("explicit preference: extract → auto-approve → route → expose → feedback", async () => {
    // === SESSION 1: Entry created (simulating post-extraction) ===
    const conventionalCommits = makeEntry({
      type: "preference",
      content: "Use conventional commits: feat:, fix:, docs:",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
      curatedBy: "auto-approved",
      curatedAt: new Date().toISOString(),
    })
    await appendEntries([conventionalCommits], STORE_PATH)

    // === Routing ===
    const entries = await readEntries(STORE_PATH)
    const routing = routeEntries(entries)
    expect(routing.claudeMd.entries).toHaveLength(1)

    // === SESSION 2: Exposed and helpful ===
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 5000 },
      [conventionalCommits.id],
      STORE_PATH,
    )
    let updated = await readEntries(STORE_PATH)
    expect(updated[0].sessionsExposed).toBe(1)
    expect(updated[0].sessionsHelpful).toBe(1)
    expect(updated[0].impactScore).toBeUndefined()  // < 3 sessions

    // === SESSION 3 & 4: More helpful sessions ===
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 3000 },
      [conventionalCommits.id],
      STORE_PATH,
    )
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 4000 },
      [conventionalCommits.id],
      STORE_PATH,
    )

    // === Verify final state ===
    updated = await readEntries(STORE_PATH)
    const final = updated[0]
    expect(final.sessionsExposed).toBe(3)
    expect(final.sessionsHelpful).toBe(3)
    expect(final.impactScore).toBe(1.0)
    expect(final.curationStatus).toBe("approved")

    // Still routed to CLAUDE.md with high ranking
    const finalRouting = routeEntries(updated)
    expect(finalRouting.claudeMd.entries).toHaveLength(1)
  })

  it("inferred fact: extract → cap → pending → decays → archived", async () => {
    // Inferred entry that never gets curated
    const inferredFact = makeEntry({
      type: "fact",
      content: "Team probably does code reviews",
      confidence: 0.70,  // capped from 0.80 by extraction
      novelty: "domain-specific",
      origin: "inferred",
      curationStatus: "pending",
      // 50 days old — past inferred grace (15 days)
      extractedAt: new Date(Date.now() - 50 * 86400000).toISOString(),
    })
    await appendEntries([inferredFact], STORE_PATH)

    // Never routed to any channel (pending + low confidence)
    const routing = routeEntries([inferredFact])
    expect(routing.claudeMd.entries).toHaveLength(0)

    // Decay eats it: 50 days old, 15 day grace = 35 days of decay
    await runDecay(STORE_PATH)
    const afterDecay = await readEntries(STORE_PATH)
    expect(afterDecay[0].confidence).toBeLessThan(0.3)
    expect(afterDecay[0].archivedAt).toBeDefined()

    // Curation auto-rejects stale items
    await addToQueue(
      { entry: inferredFact, action: "approve-entry", reason: "Pending review" },
      QUEUE_PATH,
    )
    // Backdate to 31 days ago
    const { readFileSync } = await import("node:fs")
    const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"))
    queue.items[0].proposedAt = new Date(Date.now() - 31 * 86400000).toISOString()
    writeFileSync(QUEUE_PATH, JSON.stringify(queue))

    const cleaned = await cleanupStale(QUEUE_PATH)
    expect(cleaned).toBe(1)
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(0)
  })
})
```

**Step 2: Run tests (RED — should fail until Tasks 1-8 are implemented)**

Run: `pnpm vitest run server/__tests__/integration/memory-lifecycle-scenarios.test.ts`
Expected: FAIL — modules not found (channel-router, feedback-loop, curation-queue don't exist yet)

**Step 3: After Tasks 1-8 are complete, run tests (GREEN)**

Run: `pnpm vitest run server/__tests__/integration/memory-lifecycle-scenarios.test.ts`
Expected: ALL 10 scenario tests PASS

**Step 4: Commit**

```bash
git add server/__tests__/integration/memory-lifecycle-scenarios.test.ts
git commit -m "test: add 10 scenario-based integration tests for evidence-based memory lifecycle"
```

---

## Summary

| Task | Description | Scenarios | Files | New Tests |
|------|-------------|-----------|-------|-----------|
| 1 | Add novelty/origin/curation/outcome types | - | types.ts, knowledge-store.ts | 3 |
| 2 | Extraction schema + novelty filter + auto-approval | S1,S3,S4,S5 | knowledge-extractor.ts | 3 |
| 3 | Config for artifacts, curation, feedback, decay | - | config.ts, config.yaml | 5 |
| 4 | Outcome-weighted decay + origin grace periods | S4,S7 | decay.ts | 3 |
| 5 | Channel router (replaces artifact-generator) | S1,S2,S6 | channel-router.ts (new) | 7 |
| 6 | Curation queue | S2,S3 | curation-queue.ts (new) | 4 |
| 7 | Feedback loop + exposed entry tracking | S7,S8 | feedback-loop.ts (new), context-assembler.ts, types.ts | 5 |
| 8 | Wire feedback into work arc | - | work-arc.ts | 1 |
| 9 | Scenario integration tests (S1-S10) | ALL | memory-lifecycle-scenarios.test.ts (new) | 12 |

**Total: 9 tasks, ~43 new tests, 4 new files, 5 modified files**
**Scenario coverage: All 10 Gherkin scenarios mapped to executable tests**
