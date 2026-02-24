# Evidence-Based Memory Lifecycle Design

**Date:** 2026-02-24
**Status:** Design — pending implementation
**Motivation:** SkillsBench (arxiv 2602.12670) and AGENTS.md evaluation (arxiv 2602.11988) findings
**Research:** [docs/research/2026-02-24-skillsbench-agents-md-research.md](../research/2026-02-24-skillsbench-agents-md-research.md)
**Reference:** [docs/research/2026-02-24-what-goes-where-claude-md-skills-hooks.md](../research/2026-02-24-what-goes-where-claude-md-skills-hooks.md)

---

## Summary

Galatea's slow loop extracts knowledge from coding session transcripts and generates artifacts (CLAUDE.md, skill files, hooks) that improve future sessions. Research shows that **self-generated guidance is harmful (-1.3pp)** while **curated guidance helps significantly (+16.2pp)**. This design transforms the pipeline from "extract everything, dump to CLAUDE.md" into an evidence-based lifecycle where knowledge is filtered for novelty, routed to the right channel, validated through outcomes, and curated before it reaches artifacts.

### Key Principles (from research)

1. **Less is more.** 2-3 focused skills (+18.6pp) >> comprehensive docs (-2.9pp)
2. **Self-generated is harmful.** LLM-authored guidance: -1.3pp average
3. **Curated is valuable.** Human-curated guidance: +16.2pp average
4. **Deterministic beats probabilistic.** Hooks > CLAUDE.md for rule enforcement
5. **Non-obvious knowledge is the only valuable knowledge.** SWE domain: +4.5pp (models already know how to code)
6. **Compact beats verbose.** Detailed/compact: +18.8pp. Under 200 lines for CLAUDE.md

---

## Full Lifecycle Overview

```
                    ┌──────────────────────────┐
                    │   Coding Session          │
                    │   (Work Arc via Adapter)   │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 1: Transcript        │
                    │  Ingestion                  │
                    │  (existing, no changes)     │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 2: Signal            │
                    │  Classification             │
                    │  (existing, no changes)     │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 3: Knowledge         │
                    │  Extraction                 │
                    │  + NOVELTY FILTER (new)     │
                    │  + ORIGIN TRACKING (new)    │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 4: Deduplication     │
                    │  (existing, no changes)     │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 5: Knowledge Store   │
                    │  + OUTCOME TRACKING (new)   │
                    │  + CURATION STATE (new)     │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 6: Decay             │
                    │  + OUTCOME-WEIGHTED (new)   │
                    │  + ORIGIN-AWARE (new)       │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 7: Channel Router    │
                    │  (new — replaces            │
                    │   artifact-generator.ts)    │
                    │                             │
                    │  ┌─────────┬────────┐       │
                    │  ▼         ▼        ▼       │
                    │ CLAUDE.md Skills   Hooks    │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 8: Curation Queue    │
                    │  (new)                      │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │  Stage 9: Feedback Loop     │
                    │  (new — outcome tracking    │
                    │   from next work arc)       │
                    └────────────┬───────────────┘
                                 │
                                 └──────► back to Stage 5
```

---

## Stage 1: Transcript Ingestion (unchanged)

**File:** `server/memory/transcript-reader.ts`

No changes. The existing noise filter (meta messages, internal artifacts, streaming dedup) is adequate. The quality gate here is about format, not content — content quality is addressed downstream.

---

## Stage 2: Signal Classification (unchanged)

**File:** `server/memory/signal-classifier.ts`

No changes. Pattern-based classification (preference, correction, policy, decision, factual, noise) effectively reduces transcript volume by 50-80% before expensive LLM extraction. The signal/noise boundary is the right abstraction at this stage.

---

## Stage 3: Knowledge Extraction (modified)

**File:** `server/memory/knowledge-extractor.ts`

### Changes

**3a. New extraction schema fields:**

```typescript
// Added to ExtractionSchema items
{
  // existing
  type: KnowledgeType
  content: string
  confidence: number
  evidence: string
  entities: string[]
  about?: KnowledgeAbout

  // NEW
  novelty: "project-specific" | "domain-specific" | "general-knowledge"
  origin: "explicit-statement" | "observed-failure" | "observed-pattern" | "inferred"
}
```

**3b. Updated extraction prompt additions:**

Add to EXTRACTION_PROMPT:

```
NOVELTY ASSESSMENT — For each extracted item, classify its novelty:
- "project-specific": Knowledge that is specific to THIS project, codebase, or team.
  Examples: "this project uses h3 not express", "tests go in __tests__/ directories",
  "engine/types.ts must not be overwritten"
- "domain-specific": Knowledge specific to a technical domain that a general-purpose
  developer might not know. Examples: "FHIR resources require validation against profiles",
  "Drizzle ORM requires explicit transaction handling for batch operations"
- "general-knowledge": Knowledge that any competent software engineer would already know.
  Examples: "use version control", "write tests", "handle errors", "use meaningful
  variable names", "follow SOLID principles"

IMPORTANT: Do NOT extract general-knowledge items. If any competent developer would
know this without being told, skip it entirely.

ORIGIN TRACKING — For each extracted item, classify how it was discovered:
- "explicit-statement": The user directly stated this as a preference, rule, or decision.
  Look for: "I prefer...", "We always...", "Never do...", "Let's use..."
- "observed-failure": Something went wrong and this is the lesson learned.
  Look for: error corrections, "that didn't work because...", retry patterns,
  the user reverting or fixing the agent's mistake
- "observed-pattern": The user or agent repeatedly did something the same way
  across multiple turns, implying a convention. Must appear 2+ times.
- "inferred": You are inferring this from context but it was never explicitly stated
  or demonstrated. USE SPARINGLY — inferred knowledge is lowest reliability.
```

**3c. Post-extraction novelty gate:**

After confabulation guard, add:

```typescript
// Drop general-knowledge entries immediately
entries = entries.filter(e => e.novelty !== "general-knowledge")

// Cap inferred entries at confidence 0.70
entries = entries.map(e =>
  e.origin === "inferred"
    ? { ...e, confidence: Math.min(e.confidence, 0.70) }
    : e
)
```

### Rationale

The novelty filter addresses the core SkillsBench finding: self-generated skills are harmful because LLMs document obvious things. By instructing the extraction LLM to not extract general-knowledge and by hard-dropping any that slip through, we prevent the knowledge store from accumulating banalities.

The origin field enables downstream decisions: explicit statements can be auto-approved, observed failures get priority in CLAUDE.md, inferred knowledge is treated with skepticism.

---

## Stage 4: Deduplication (unchanged)

**File:** `server/memory/knowledge-store.ts`

No changes. Jaccard + cosine deduplication is adequate. The novelty filter in Stage 3 reduces the volume of candidates, making dedup faster.

---

## Stage 5: Knowledge Store (modified)

**File:** `server/memory/types.ts` + `server/memory/knowledge-store.ts`

### Changes to KnowledgeEntry type

```typescript
interface KnowledgeEntry {
  // existing fields (unchanged)
  id: string
  type: KnowledgeType
  content: string
  confidence: number
  entities: string[]
  evidence?: string
  source: string
  extractedAt: string
  supersededBy?: string
  about?: KnowledgeAbout
  lastRetrievedAt?: string
  archivedAt?: string

  // NEW: extraction metadata
  novelty: "project-specific" | "domain-specific" | "general-knowledge"
  origin: "explicit-statement" | "observed-failure" | "observed-pattern" | "inferred"

  // NEW: curation state
  curationStatus: "pending" | "approved" | "rejected"
  curatedAt?: string
  curatedBy?: string  // "human" | "auto-approved"

  // NEW: outcome tracking
  sessionsExposed: number     // default: 0
  sessionsHelpful: number     // default: 0
  sessionsHarmful: number     // default: 0
  impactScore?: number        // computed when sessionsExposed >= 3

  // NEW: channel routing
  enforcedBy?: "hook" | "ci" | "linter"
  targetChannel?: "claude-md" | "skill" | "hook" | "none"
}
```

### Auto-approval rule

On entry creation:

```typescript
if (entry.origin === "explicit-statement" && entry.confidence >= 0.90) {
  entry.curationStatus = "approved"
  entry.curatedBy = "auto-approved"
  entry.curatedAt = new Date().toISOString()
}
// All others: curationStatus = "pending"
```

**Rationale:** When the user explicitly says "we use pnpm", that IS human curation — the user stated it directly. No need to ask again. The threshold (>= 0.90 confidence) ensures the extraction LLM was confident this was an explicit statement, not a misclassification.

### Backward compatibility

Existing entries without new fields get defaults on read:

```typescript
{
  novelty: "project-specific",    // assume existing entries are valuable
  origin: "inferred",             // conservative default
  curationStatus: "pending",      // not yet curated
  sessionsExposed: 0,
  sessionsHelpful: 0,
  sessionsHarmful: 0,
}
```

---

## Stage 6: Decay (modified)

**File:** `server/memory/decay.ts`

### Changes

**6a. Outcome-weighted decay factor:**

```typescript
function effectiveDecayFactor(entry: KnowledgeEntry, baseDecayFactor: number): number {
  if (entry.impactScore === undefined) return baseDecayFactor

  if (entry.impactScore < 0) {
    // Harmful entries decay faster: up to 2x speed
    const harmPenalty = Math.min(1.0, Math.abs(entry.impactScore)) * 0.5
    return baseDecayFactor * (1 - harmPenalty) // e.g., 0.95 * 0.5 = 0.475 per day
  }

  if (entry.impactScore > 0.5) {
    // Helpful entries decay slower: up to 50% slower
    const helpBonus = Math.min(0.5, entry.impactScore - 0.5)
    return baseDecayFactor + (1 - baseDecayFactor) * helpBonus // e.g., 0.95 + 0.05*0.5 = 0.975
  }

  return baseDecayFactor
}
```

**6b. Origin-aware grace period:**

```typescript
function graceperiodDays(entry: KnowledgeEntry, baseGraceDays: number): number {
  switch (entry.origin) {
    case "explicit-statement": return baseGraceDays * 2   // 60 days — user said it
    case "observed-failure": return baseGraceDays * 1.5   // 45 days — validated by experience
    case "observed-pattern": return baseGraceDays         // 30 days — standard
    case "inferred": return baseGraceDays * 0.5           // 15 days — prove yourself quickly
    default: return baseGraceDays
  }
}
```

**6c. Channel-specific archive thresholds:**

```yaml
# config.yaml additions
decay:
  # existing
  archive_threshold: 0.3
  # new: channel eligibility thresholds (not for archive, for generation)
  claude_md_threshold: 0.90
  skill_threshold: 0.85
  hook_entries_exempt: true  # entries with enforcedBy never decay
```

Entries with `enforcedBy: "hook"` are exempt from decay — they're enforced in code, not in the context window. Their confidence is irrelevant to runtime behavior.

### Rationale

The research shows that static knowledge files don't self-correct. Galatea's advantage is the feedback loop: knowledge that hurts gets penalized, knowledge that helps gets reinforced. The outcome-weighted decay is the mechanism that makes this work.

The origin-aware grace period reflects the trust hierarchy: things the user explicitly said deserve more runway than things the LLM inferred.

---

## Stage 7: Channel Router (new — replaces artifact-generator.ts)

**New file:** `server/memory/channel-router.ts`
**Replaces:** `server/memory/artifact-generator.ts`

### Router Logic

```typescript
interface RouterResult {
  claudeMd: { entries: KnowledgeEntry[], lines: number }
  skills: { entries: KnowledgeEntry[], count: number }
  hooks: { entries: KnowledgeEntry[], count: number }
  skipped: { entries: KnowledgeEntry[], reasons: string[] }
}

function routeEntries(allEntries: KnowledgeEntry[]): RouterResult
```

**Routing rules (applied in order):**

```
1. Filter: active entries only (no supersededBy, no archivedAt)

2. Route to HOOKS:
   - type === "rule" OR type === "correction"
   - AND content matches tool-constraint pattern:
     /\b(never|don't|do not|always|must not)\b.*\b(push|delete|rm|drop|overwrite|modify|force|reset)\b/i
   - Set targetChannel = "hook"
   - These go to curation queue for hook conversion approval

3. Route to SKILLS:
   - type === "procedure"
   - AND curationStatus === "approved"
   - AND confidence >= 0.85
   - AND novelty !== "general-knowledge"
   - Rank by: confidence × (1 - priorOverlap) × failureWeight × max(0.1, impactScore ?? 0.5)
   - Take top 3 maximum
   - Set targetChannel = "skill"

4. Route to CLAUDE.md:
   - curationStatus === "approved"
   - AND confidence >= 0.90
   - AND novelty !== "general-knowledge"
   - AND enforcedBy is NOT set
   - AND type !== "procedure" (those went to skills)
   - Rank by: impactScore × confidence × (origin === "observed-failure" ? 2 : 1)
   - Budget: 200 lines maximum
   - Set targetChannel = "claude-md"

5. Everything else:
   - Set targetChannel = "none"
   - Stays in knowledge store for retrieval but not in artifacts
```

### CLAUDE.md Generation

**Structure:**

```markdown
# Project: {name}

## Architecture
{static preamble loaded from data/memory/architecture-preamble.md}
{human-authored, 3-5 sentences, not auto-generated}

## Conventions
{entries with type "preference" or "fact" about project tooling/structure}
- Package manager: pnpm
- Test framework: Vitest, files in __tests__/
- API: h3/Nitro
- Database: PostgreSQL via Drizzle ORM

## Guardrails
{entries with type "rule" or "correction", prioritizing origin: "observed-failure"}
- engine/types.ts contains shared safety types. Extend, never overwrite.
- Subagents may commit without creating new files. Always verify file existence.
- The extraction pipeline expects TranscriptTurn[], not CodingTranscriptEntry[].
```

**No sections for:** Facts (noise), Procedures (go to skills), Preferences that aren't conventions (noise).

**Architecture preamble:** A static file (`data/memory/architecture-preamble.md`) that the user writes once. The router injects it verbatim. This is the GBintz "architectural vision" pattern — human-authored, not LLM-generated.

### Skill File Generation

**Max 3 files.** Each file:

```markdown
# {Procedure Title}

> Confidence: {score} | Impact: {impactScore} | Origin: {origin}

{procedure content}
```

**Under 100 lines each.** If a procedure is longer, truncate to the most critical steps.

**Staleness eviction:** When re-generating skills, if a skill's source entry has `sessionsExposed >= 3` AND `impactScore < 0`, evict it. The slot opens for the next-ranked procedure.

### Hook Conversion Proposals

For entries routed to hooks, generate a proposal:

```typescript
interface HookProposal {
  entryId: string
  entryContent: string
  proposedPattern: RegExp
  proposedDecision: SafetyDecision
  proposedReason: string
}
```

Example:
```
Entry: "Never overwrite engine/types.ts"
Proposed: {
  pattern: /engine\/types\.ts/,
  check: "if Write/Edit tool targets this path, deny",
  decision: "deny",
  reason: "Learned rule: engine/types.ts is shared and must not be overwritten"
}
```

Hook proposals go to the curation queue. Once approved, they're added to `checkToolCallSafety()` as learned patterns (separate from the hardcoded `TOOL_DESTRUCTIVE_PATTERNS`).

### Prior Overlap Estimation

For skill ranking, `priorOverlap` estimates whether the model already knows a procedure:

```typescript
const COMMON_SWE_PATTERNS = [
  /\b(write|create|add)\s+(unit\s+)?tests?\b/i,
  /\b(git|commit|push|pull|merge|branch)\b/i,
  /\b(install|npm|yarn|pip)\s+(dependencies|packages)\b/i,
  /\b(refactor|clean\s*up|optimize)\b/i,
  /\b(REST|API|endpoint|route)\b/i,
  /\b(database|query|migration|schema)\b/i,
  /\b(deploy|build|compile)\b/i,
  /\b(error\s+handling|try\s*catch|validation)\b/i,
]

function estimatePriorOverlap(content: string): number {
  const matches = COMMON_SWE_PATTERNS.filter(p => p.test(content)).length
  return Math.min(1.0, matches / 3) // 3+ common patterns = high overlap
}
```

This is a simple heuristic. It could be replaced with embedding-based similarity to a "generic SWE knowledge" corpus later, but the regex approach is good enough to start and adds zero latency.

---

## Stage 8: Curation Queue (new)

**New file:** `server/memory/curation-queue.ts`
**Storage:** `data/memory/curation-queue.json`

### Queue Structure

```typescript
interface CurationItem {
  id: string
  entryId: string
  action: "approve-entry" | "reject-entry" | "review-impact" | "approve-hook"
  reason: string
  proposedAt: string
  resolvedAt?: string
  resolution?: "approved" | "rejected" | "deferred"

  // Context for the reviewer
  entry: KnowledgeEntry           // snapshot at proposal time
  impactData?: {
    exposed: number
    helpful: number
    harmful: number
    score: number
  }
  hookProposal?: HookProposal    // for approve-hook items
}

interface CurationQueue {
  items: CurationItem[]
}
```

### Queue Population

Items are added to the queue when:

| Trigger | Action | Reason |
|---------|--------|--------|
| New entry passes extraction + novelty filter, but `origin !== "explicit-statement"` or `confidence < 0.90` | `approve-entry` | "New knowledge extracted, needs human review" |
| Entry reaches `sessionsExposed >= 3` | `review-impact` | "Entry has been tested in 3+ sessions, impact data available" |
| Entry routed to hooks channel | `approve-hook` | "Rule can be enforced deterministically, approve hook conversion?" |
| Approved entry's `impactScore` drops below 0 | `review-impact` | "This entry may be hurting performance" |

### Queue Presentation

When Galatea detects idle state (homeostasis `productive_engagement: LOW`), it can present pending curation items:

```
I have 3 knowledge entries that could improve future sessions.
Would you like to review them?

1. [APPROVE?] "This project uses h3 not express"
   (extracted from session abc, confidence 0.88)

2. [IMPACT REVIEW] "Always run pnpm tsc --noEmit before committing"
   (exposed in 5 sessions, helped in 4, hurt in 0, impact: +0.80)

3. [HOOK PROPOSAL] "Never overwrite engine/types.ts"
   → Propose: block Write/Edit to engine/types.ts via PreToolUse hook
```

The user can approve, reject, or defer each item.

### Graceful Degradation

**If the user never curates:** Only auto-approved entries (explicit statements with high confidence) reach artifacts. Everything else stays pending forever. The system generates minimal artifacts — only things the user explicitly said.

**This is the safe default.** The research shows that uncurated self-generated guidance hurts performance. Doing nothing is better than generating bad artifacts.

### Queue Limits

- Max 20 pending items. If queue is full, new items replace the oldest deferred items.
- Items deferred 3 times are auto-rejected (the user doesn't care about this knowledge).
- Items in queue > 30 days without resolution are auto-rejected.

---

## Stage 9: Feedback Loop (new)

**Integration point:** `server/agent/coding-adapter/work-arc.ts` (post-execution)

### After Each Work Arc

```typescript
async function recordOutcome(
  workArcResult: WorkArcResult,
  exposedEntryIds: string[],
  storePath: string,
): Promise<void> {
  const entries = await readEntries(storePath)

  for (const entry of entries) {
    if (!exposedEntryIds.includes(entry.id)) continue

    entry.sessionsExposed++

    if (workArcResult.status === "completed") {
      entry.sessionsHelpful++
    } else if (workArcResult.status === "failed") {
      // Only mark as harmful if the entry was in guardrails/constraints section
      // AND the failure is plausibly related to the entry's domain
      if (isPlausiblyRelated(entry, workArcResult)) {
        entry.sessionsHarmful++
      }
    }
    // timeout, budget_exceeded, blocked: neutral — don't update

    // Recompute impact score
    if (entry.sessionsExposed >= 3) {
      entry.impactScore = (entry.sessionsHelpful - entry.sessionsHarmful) / entry.sessionsExposed
    }
  }

  await writeEntries(entries, storePath)
}
```

### Exposed Entry Tracking

When `assembleContext()` builds the system prompt, it records which entry IDs were included:

```typescript
interface AssembledContext {
  // existing
  systemPrompt: string
  sections: ContextSection[]
  metadata: { ... }

  // NEW
  exposedEntryIds: string[]  // IDs of KnowledgeEntry objects in the prompt
}
```

The work arc passes `assembledContext.exposedEntryIds` to `recordOutcome()` after completion.

### Impact-Triggered Actions

When `impactScore` is recomputed:

| Condition | Action |
|-----------|--------|
| `impactScore < 0` for first time | Add to curation queue as `review-impact` |
| `impactScore < -0.3` | Auto-demote: set `curationStatus = "pending"`, remove from artifacts |
| `impactScore > 0.5` AND `curationStatus === "pending"` | Add to curation queue as `approve-entry` with positive impact evidence |
| `impactScore > 0.7` for 5+ sessions | Candidate for `confidence` boost (min of 1.0, current + 0.05) |

### Artifact Re-generation Trigger

When any entry's `targetChannel` changes (due to curation, impact, or decay), the affected channel is re-generated. This is debounced to avoid churning on every work arc:

- Maximum 1 re-generation per channel per hour
- Re-generation only if at least 1 entry changed its routing

---

## Configuration

### New config.yaml additions

```yaml
extraction:
  # existing
  chunk_size: 20
  default_temperature: 0

  # NEW
  novelty_filter: true                    # drop general-knowledge entries
  inferred_confidence_cap: 0.70           # max confidence for inferred entries
  auto_approve_explicit_threshold: 0.90   # auto-approve explicit statements above this

artifact_generation:
  claude_md:
    max_lines: 200
    min_confidence: 0.90
    require_curation: true                # only curated entries
    architecture_preamble: "data/memory/architecture-preamble.md"

  skills:
    max_count: 3
    max_lines_per_skill: 100
    min_confidence: 0.85
    require_curation: true
    staleness_sessions: 3                 # evict after 3 sessions with negative impact

  hooks:
    auto_convert: false                   # always require human approval
    learned_patterns_file: "data/memory/learned-hook-patterns.json"

  prior_overlap:
    # patterns that indicate general SWE knowledge (high overlap with model priors)
    common_patterns:
      - "write.*tests?"
      - "git|commit|push|pull"
      - "install.*dependencies"
      - "refactor|clean.*up"
      - "REST|API|endpoint"
      - "database|query|migration"
      - "deploy|build|compile"
      - "error.*handling|try.*catch"

decay:
  # existing
  enabled: true
  decay_start_days: 30
  decay_factor: 0.95
  archive_threshold: 0.3
  exempt_types: [rule]

  # NEW
  origin_grace_multipliers:
    explicit-statement: 2.0     # 60 days
    observed-failure: 1.5       # 45 days
    observed-pattern: 1.0       # 30 days (standard)
    inferred: 0.5               # 15 days

  outcome_weighting:
    harm_penalty_max: 0.5       # max additional decay for harmful entries
    help_bonus_max: 0.5         # max decay reduction for helpful entries

  hook_entries_exempt: true     # enforcedBy entries never decay

curation:
  queue_max_items: 20
  auto_reject_after_days: 30
  auto_reject_after_defers: 3
  present_on_idle: true

feedback:
  min_sessions_for_impact: 3
  auto_demote_threshold: -0.3
  confidence_boost_threshold: 0.7
  confidence_boost_amount: 0.05
  regen_debounce_minutes: 60
```

---

## Migration Path

### Phase 1: Extraction tightening (low risk, high value)
- Add `novelty` and `origin` fields to extraction schema
- Update extraction prompt with novelty filter instructions
- Add post-extraction novelty gate (drop general-knowledge)
- Add inferred confidence cap
- Backward-compatible: existing entries get defaults on read

### Phase 2: Curation state + auto-approval
- Add `curationStatus`, `curatedAt`, `curatedBy` to KnowledgeEntry
- Implement auto-approval for explicit statements
- Gate artifact generation on `curationStatus === "approved"`
- Existing entries default to `pending` (artifacts stop generating until curated or auto-approved)

### Phase 3: Channel router
- Replace `artifact-generator.ts` with `channel-router.ts`
- Implement tiered CLAUDE.md structure
- Implement 2-3 skill budget with ranking
- Implement hook conversion proposals

### Phase 4: Outcome tracking + feedback loop
- Add `sessionsExposed`, `sessionsHelpful`, `sessionsHarmful`, `impactScore`
- Wire `recordOutcome()` into work arc completion
- Add `exposedEntryIds` to `AssembledContext`
- Implement impact-triggered actions

### Phase 5: Outcome-weighted decay
- Implement `effectiveDecayFactor()` with harm penalty / help bonus
- Implement origin-aware grace periods
- Exempt hook-enforced entries from decay

### Phase 6: Curation queue
- Implement `curation-queue.ts`
- Wire queue population triggers
- Implement idle-state presentation via homeostasis

---

## What This Design Does NOT Do

1. **Does not guarantee curated artifacts.** If the user never curates, the system generates minimal artifacts from auto-approved entries only. This is by design — uncurated generation is worse than no generation.

2. **Does not replace human judgment.** The curation queue proposes, the human disposes. Impact scores inform but don't determine — a negative-impact entry might still be important for safety reasons.

3. **Does not solve the SWE ceiling.** Research shows +4.5pp max for SWE skills. This design optimizes within that ceiling. The real wins come from non-SWE domain knowledge if Galatea expands beyond coding.

4. **Does not validate in real sessions yet.** Like Phase G's adapter, this design is tested against its own contracts. The true validation happens when the feedback loop runs through actual work arcs.

5. **Does not auto-generate hooks.** Hook conversion proposals always require human approval. Autonomous addition of runtime enforcement rules is too risky.

---

## Success Criteria

1. **CLAUDE.md is under 200 lines** and contains only curated, non-obvious knowledge
2. **At most 3 skill files** exist at any time, each under 100 lines
3. **No general-knowledge entries** in the knowledge store after extraction
4. **Impact scores** are computed for entries exposed in 3+ sessions
5. **Negative-impact entries** are auto-demoted and removed from artifacts
6. **Explicit user statements** are auto-approved and appear in artifacts immediately
7. **Inferred knowledge** requires human curation or positive impact evidence before reaching artifacts
8. **Enforceable rules** are proposed for hook conversion rather than CLAUDE.md inclusion
9. **The system generates nothing** rather than generating harmful artifacts when curation is absent
