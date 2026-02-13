# Phase D: Homeostasis Refinement + L2/L3 Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address known L0-L2 edge cases, implement L2 LLM semantic assessment for hard dimensions, explore L3 meta-assessment for conflicting signals, and establish memory lifecycle foundations.

**Context:** Phase C delivered L0-L2 multi-level thinking with 33% fewer test failures than baseline. Four known edge cases remain (documented in evaluation report), and two dimensions (`certainty_alignment`, `knowledge_application`) require L2 LLM semantic understanding.

**Key reference docs:**
- `docs/plans/2026-02-12-homeostasis-l0-l2-evaluation-report.md` — Phase C evaluation with L3/L4 design
- `docs/plans/2026-02-12-phase-c-manual-testing-guide.md` — L0-L2 architecture documentation
- `docs/plans/2026-02-11-learning-scenarios.md` — Target behaviors (especially L5, L6)
- `server/engine/homeostasis-engine.ts` — Current L0-L2 implementation

**What Phase D includes:**
- Fix 4 known L1 edge cases (stuck detection, keyword matching)
- Implement L2 LLM assessment for `certainty_alignment` and `knowledge_application`
- Prototype L3 meta-assessment (when L1 and L2 disagree)
- Add memory lifecycle: consolidation (CLAUDE.md extraction), decay (confidence reduction)
- Performance monitoring: L0 cache hit rate, L1/L2 latency tracking

**What Phase D does NOT include:**
- L4 strategic pattern analysis (requires cross-session data, deferred to Phase E)
- SKILL.md auto-generation (requires 3+ occurrences, deferred to Phase E)
- Memory tier 3 (RAG/Mem0 - only if CLAUDE.md proves insufficient)
- UI visualization of homeostasis state (deferred to Phase F)

---

## Dependency Graph

```
Task 1: Fix L1 Edge Cases (keyword + stuck detection)
    │
    ├─── Task 2: L2 LLM Assessment (certainty_alignment)
    │
    ├─── Task 3: L2 LLM Assessment (knowledge_application)
    │         │
    │         ▼
    │    Task 4: L3 Meta-Assessment Prototype
    │
    ├─── Task 5: Memory Consolidation (CLAUDE.md extraction)
    │
    ├─── Task 6: Memory Decay (confidence reduction over time)
    │
    └─── Task 7: Performance Monitoring + Metrics
```

Tasks 2 and 3 can run in parallel after Task 1.
Task 4 depends on 2+3. Tasks 5, 6, 7 can run in parallel with 2/3/4.

---

## Task 1: Fix L1 Edge Cases

**Goal:** Address the 4 known test failures from Phase C evaluation.

**Sub-tasks:**

### 1.1: Fix Keyword Matching Strictness

**Problem:** Requires >= 2 keyword overlap. "auth" vs "authentication" don't match.

**Options:**
1. Lower threshold from 2 to 1 keyword (quick fix, may cause false positives)
2. Add stemming (Porter stemmer: "authentication" → "auth")
3. Use fuzzy matching (Levenshtein distance)

**Recommendation:** Start with option 2 (stemming) - linguistically correct and performant.

**Implementation:**
- Install `natural` or similar NLP library
- Add `stemWord()` helper to homeostasis-engine.ts
- Apply stemming to both message and fact keywords before overlap check
- Update tests to verify: "auth" ↔ "authentication" now match

**Acceptance:**
- Test "detects HEALTHY when relevant auth facts available" passes
- No regression in other knowledge_sufficiency tests

---

### 1.2: Debug Stuck Detection (Jaccard Similarity)

**Problem:** Jaccard similarity calculation not detecting repetition.

**Investigation needed:**
```typescript
// Current code (simplified):
const similarity = jaccard(set1, set2)
if (similarity > 0.7) return "LOW" // stuck
```

**Debug steps:**
1. Add logging to stuck detection logic
2. Run failing test with console output
3. Verify Jaccard calculation: `intersection / union`
4. Check if empty sets or single-word messages cause issues

**Possible fixes:**
- Adjust threshold (0.7 → 0.5?)
- Add minimum message length requirement (>= 3 words)
- Use alternative similarity (cosine? edit distance?)

**Acceptance:**
- Both stuck detection tests pass
- No false positives on varied conversation test

---

## Task 2: L2 LLM Assessment — certainty_alignment

**Goal:** Implement LLM-based semantic assessment for `certainty_alignment` dimension.

**Dimension definition:** Agent's confidence level matches situation needs.

**Scenarios:**
- **LOW:** Agent is uncertain but user needs confident answer (urgent production bug)
- **LOW:** Agent is overconfident but should be cautious (unknown domain)
- **HEALTHY:** Agent confidence matches context

**Implementation:**

### 2.1: Define Assessment Prompt

```typescript
const CERTAINTY_ALIGNMENT_PROMPT = `
Analyze the agent's confidence level relative to the situation's needs.

## Context
User message: {currentMessage}
Agent's recent responses: {lastNResponses}
Available knowledge: {factsSummary}

## Assessment Criteria
- Is agent expressing appropriate uncertainty for an unknown domain?
- Is agent confident when user needs decisive guidance?
- Does confidence match the available knowledge quality?

## Output
Return one of: LOW, HEALTHY, HIGH

LOW: Confidence mismatch (too confident or too cautious)
HEALTHY: Confidence appropriate for context
HIGH: (reserved for future use)
`
```

### 2.2: Implement L2 Assessment Function

```typescript
async function assessCertaintyAlignmentL2(
  ctx: AgentContext
): Promise<DimensionState> {
  const { currentMessage, messageHistory, retrievedFacts } = ctx

  // Extract last 3 agent responses for confidence analysis
  const lastNResponses = messageHistory
    .filter(m => m.role === "assistant")
    .slice(-3)
    .map(m => m.content)

  // Summarize facts
  const factsSummary = retrievedFacts
    .slice(0, 5)
    .map(f => `${f.content} (${f.confidence})`)
    .join("\n")

  // Call LLM (use Ollama glm-4.7-flash for speed)
  const result = await generateObject({
    model: createOllamaModel("glm-4.7-flash:latest"),
    schema: z.object({
      state: z.enum(["LOW", "HEALTHY", "HIGH"]),
      reasoning: z.string()
    }),
    prompt: CERTAINTY_ALIGNMENT_PROMPT
      .replace("{currentMessage}", currentMessage)
      .replace("{lastNResponses}", lastNResponses.join("\n\n"))
      .replace("{factsSummary}", factsSummary)
  })

  return result.object.state
}
```

### 2.3: Wire L2 into Assessment Logic

Update `assessDimensions()`:
```typescript
// Check config for thinking level
if (DIMENSION_CONFIGS.certainty_alignment.thinkingLevel === 2) {
  // L0: Check cache
  if (isCached("certainty_alignment")) {
    dimensions.certainty_alignment = getFromCache("certainty_alignment")
  } else {
    // L2: Call LLM
    dimensions.certainty_alignment = await assessCertaintyAlignmentL2(ctx)
    setCache("certainty_alignment", dimensions.certainty_alignment, TTL)
  }
}
```

### 2.4: Add Tests

```typescript
describe("L2: certainty_alignment", () => {
  it("detects LOW when agent uncertain but user needs confidence", async () => {
    const ctx = {
      currentMessage: "Production is down! What's causing the timeout?",
      messageHistory: [
        { role: "assistant", content: "I'm not sure... maybe check the logs?" }
      ],
      retrievedFacts: []
    }

    const state = await assessCertaintyAlignmentL2(ctx)
    expect(state).toBe("LOW")
  })

  it("detects HEALTHY when confidence matches situation", async () => {
    const ctx = {
      currentMessage: "How should I structure this new feature?",
      messageHistory: [
        { role: "assistant", content: "Based on the patterns I've seen, I recommend..." }
      ],
      retrievedFacts: [
        { content: "Use feature flags for gradual rollouts", confidence: 0.9 }
      ]
    }

    const state = await assessCertaintyAlignmentL2(ctx)
    expect(state).toBe("HEALTHY")
  })
})
```

**Acceptance:**
- L2 tests pass for certainty_alignment
- Scenario L5 from learning-scenarios.md works correctly
- Cache TTL of 60s reduces repeated LLM calls

---

## Task 3: L2 LLM Assessment — knowledge_application

**Goal:** Implement LLM-based semantic assessment for `knowledge_application` dimension.

**Dimension definition:** Agent uses available knowledge effectively in responses.

**Scenarios:**
- **LOW:** Agent has relevant facts but doesn't mention them in response
- **LOW:** Agent reinvents solutions when knowledge exists
- **HEALTHY:** Agent references and applies available knowledge

**Implementation:** Similar to Task 2, but with different prompt:

```typescript
const KNOWLEDGE_APPLICATION_PROMPT = `
Assess whether the agent is effectively using available knowledge.

## Context
User message: {currentMessage}
Agent's last response: {lastResponse}
Available facts: {factsList}

## Assessment Criteria
- Did agent reference relevant facts when responding?
- Is agent reinventing solutions that exist in knowledge?
- Is agent ignoring obvious connections?

## Output
Return one of: LOW, HEALTHY, HIGH

LOW: Agent ignoring available knowledge
HEALTHY: Agent using knowledge appropriately
HIGH: (reserved for future use)
`
```

**Acceptance:**
- L2 tests pass for knowledge_application
- Scenario L6 from learning-scenarios.md works correctly

---

## Task 4: L3 Meta-Assessment Prototype

**Goal:** Implement meta-assessment that triggers when L1 and L2 disagree.

**Trigger conditions:**
- `certainty_alignment`: L1 says HEALTHY, L2 says LOW (or vice versa)
- `knowledge_application`: L1 says HEALTHY, L2 says LOW (or vice versa)

**L3 Logic:**
```typescript
async function assessWithMetaLayer(
  dimension: "certainty_alignment" | "knowledge_application",
  ctx: AgentContext
): Promise<DimensionState> {
  // L0: Check cache
  const cached = getFromCache(dimension)
  if (cached) return cached

  // L1: Compute heuristic
  const l1Result = assessDimensionL1(dimension, ctx)

  // L2: LLM semantic (async)
  const l2Result = await assessDimensionL2(dimension, ctx)

  // L3: Meta-assessment if disagreement
  if (l1Result !== l2Result) {
    console.warn(`[L3] Disagreement on ${dimension}: L1=${l1Result}, L2=${l2Result}`)

    // Simple strategy: trust L2 (LLM semantic understanding)
    // Future: could call another LLM to arbitrate
    return l2Result
  }

  // Agreement: cache and return
  setCache(dimension, l1Result, TTL)
  return l1Result
}
```

**Metrics to track:**
- Disagreement frequency per dimension
- L3 arbitration outcomes (which level "wins")

**Acceptance:**
- L3 triggers when L1/L2 disagree
- Metrics logged to console or OTEL
- No performance regression (L3 only on disagreement)

---

## Task 5: Memory Consolidation (CLAUDE.md Extraction)

**Goal:** Extract high-confidence patterns from knowledge store and write to `CLAUDE.md`.

**Trigger:** When knowledge entries reach consolidation threshold.

**Consolidation criteria:**
- **Frequency:** Fact observed 3+ times across sessions
- **Confidence:** Average confidence >= 0.85
- **Recency:** At least 1 occurrence in last 7 days

**Implementation:**

### 5.1: Add Consolidation Logic

```typescript
// server/memory/consolidation.ts

interface ConsolidationCandidate {
  content: string
  occurrences: number
  avgConfidence: number
  lastSeen: Date
  sources: string[] // session IDs
}

export async function identifyCandidates(
  storePath = "data/memory/knowledge.jsonl"
): Promise<ConsolidationCandidate[]> {
  const entries = await readKnowledgeStore(storePath)

  // Group by content similarity (exact match for MVP)
  const grouped = new Map<string, KnowledgeEntry[]>()
  for (const entry of entries) {
    const key = entry.content.toLowerCase().trim()
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(entry)
  }

  // Filter by consolidation criteria
  const candidates: ConsolidationCandidate[] = []
  for (const [content, entries] of grouped) {
    if (entries.length < 3) continue // need 3+ occurrences

    const avgConfidence = entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
    if (avgConfidence < 0.85) continue

    const lastSeen = new Date(Math.max(...entries.map(e => new Date(e.timestamp).getTime())))
    const daysSince = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince > 7) continue // must be recent

    candidates.push({
      content,
      occurrences: entries.length,
      avgConfidence,
      lastSeen,
      sources: entries.map(e => e.sessionId)
    })
  }

  return candidates
}

export async function consolidateToCLAUDEmd(
  candidates: ConsolidationCandidate[],
  claudeMdPath = "CLAUDE.md"
): Promise<void> {
  // Read existing CLAUDE.md
  let existing = ""
  try {
    existing = await fs.readFile(claudeMdPath, "utf-8")
  } catch {
    // File doesn't exist, start fresh
  }

  // Append new consolidated facts
  const newSection = `
## Consolidated Knowledge (auto-extracted)

Last updated: ${new Date().toISOString()}

${candidates.map(c => `- ${c.content} (confidence: ${c.avgConfidence.toFixed(2)}, seen ${c.occurrences}× across ${c.sources.length} sessions)`).join("\n")}
`

  // Write back
  await fs.writeFile(
    claudeMdPath,
    existing + "\n" + newSection,
    "utf-8"
  )
}
```

### 5.2: Add Consolidation API Endpoint

```typescript
// server/routes/api/memory/consolidate.post.ts

export async function POST() {
  const candidates = await identifyCandidates()

  if (candidates.length === 0) {
    return json({ message: "No candidates ready for consolidation", count: 0 })
  }

  await consolidateToCLAUDEmd(candidates)

  return json({
    message: `Consolidated ${candidates.length} knowledge entries to CLAUDE.md`,
    count: candidates.length,
    candidates
  })
}
```

### 5.3: Add Tests

```typescript
describe("Memory Consolidation", () => {
  it("identifies candidates with 3+ occurrences", async () => {
    // Seed knowledge store with duplicate entries
    const candidates = await identifyCandidates()
    expect(candidates.length).toBeGreaterThan(0)
  })

  it("writes to CLAUDE.md", async () => {
    const candidates = [{ content: "Use pnpm", occurrences: 3, avgConfidence: 0.9, ... }]
    await consolidateToCLAUDEmd(candidates)

    const claudeMd = await fs.readFile("CLAUDE.md", "utf-8")
    expect(claudeMd).toContain("Use pnpm")
  })
})
```

**Acceptance:**
- Consolidation identifies high-frequency patterns
- CLAUDE.md updated with consolidated knowledge
- Manual test: Check that consolidated facts appear in agent context

---

## Task 6: Memory Decay (Confidence Reduction)

**Goal:** Reduce confidence of stale knowledge entries over time.

**Decay formula:**
```
confidence_new = confidence_old × (0.95 ^ days_since_last_seen)
```

After 30 days: 0.9 → 0.19 (significant decay)
After 60 days: 0.9 → 0.04 (nearly forgotten)

**Implementation:**

```typescript
// server/memory/decay.ts

export async function applyDecay(
  storePath = "data/memory/knowledge.jsonl"
): Promise<{ updated: number, removed: number }> {
  const entries = await readKnowledgeStore(storePath)
  const now = Date.now()

  let updated = 0
  let removed = 0

  const decayed = entries.map(entry => {
    const ageMs = now - new Date(entry.timestamp).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    const newConfidence = entry.confidence * Math.pow(0.95, ageDays)

    // Remove if confidence drops below 0.1
    if (newConfidence < 0.1) {
      removed++
      return null
    }

    updated++
    return { ...entry, confidence: newConfidence }
  }).filter(Boolean) as KnowledgeEntry[]

  // Write back
  await writeKnowledgeStore(storePath, decayed)

  return { updated, removed }
}
```

**Cron job:**
```bash
# Add to crontab or Docker healthcheck
0 2 * * * pnpm tsx server/memory/decay.ts
```

**Acceptance:**
- Old entries have reduced confidence
- Entries below 0.1 confidence removed
- Manual test: Check knowledge store after 30 days

---

## Task 7: Performance Monitoring + Metrics

**Goal:** Track L0/L1/L2 performance to validate caching and identify bottlenecks.

**Metrics to track:**

| Metric | Description | Target |
|--------|-------------|--------|
| `l0_cache_hit_rate` | % of assessments served from cache | > 50% |
| `l1_latency_p50` | 50th percentile L1 compute time | < 5ms |
| `l2_latency_p50` | 50th percentile L2 LLM time | < 3s |
| `l3_disagreement_rate` | % of times L1 and L2 disagree | < 10% |
| `dimension_transitions` | How often dimensions change state | N/A (baseline) |

**Implementation:**

### 7.1: Add Metrics to Homeostasis Engine

```typescript
import { metrics } from "./metrics" // simple in-memory counter

function assessDimensions(ctx: AgentContext): DimensionStates {
  const start = Date.now()

  // ... assessment logic ...

  // Track cache hits
  if (usedCache) {
    metrics.increment("homeostasis.l0_cache_hit")
  }

  // Track L1 latency
  if (usedL1) {
    metrics.histogram("homeostasis.l1_latency_ms", Date.now() - start)
  }

  // Track L2 latency
  if (usedL2) {
    metrics.histogram("homeostasis.l2_latency_ms", Date.now() - l2Start)
  }

  // Track state transitions
  const prev = getPreviousState(ctx.sessionId)
  if (prev && prev !== dimensions) {
    for (const [dim, state] of Object.entries(dimensions)) {
      if (prev[dim] !== state) {
        metrics.increment("homeostasis.transition", { dimension: dim, from: prev[dim], to: state })
      }
    }
  }

  return dimensions
}
```

### 7.2: Add Metrics API Endpoint

```typescript
// server/routes/api/metrics.get.ts

export async function GET() {
  const stats = {
    l0_cache_hit_rate: metrics.rate("homeostasis.l0_cache_hit"),
    l1_latency_p50: metrics.percentile("homeostasis.l1_latency_ms", 50),
    l2_latency_p50: metrics.percentile("homeostasis.l2_latency_ms", 50),
    l3_disagreement_rate: metrics.rate("homeostasis.l3_disagreement"),
    dimension_transitions: metrics.countByDimension("homeostasis.transition")
  }

  return json(stats)
}
```

**Acceptance:**
- Metrics endpoint returns valid data
- L0 cache hit rate > 50%
- L1 latency < 5ms, L2 latency < 3s

---

## Success Criteria

**Phase D is complete when:**

1. ✅ All 17 evaluation tests pass (4 todo tests fixed)
2. ✅ L2 LLM assessment works for `certainty_alignment` and `knowledge_application`
3. ✅ L3 meta-assessment triggers on disagreement and logs metrics
4. ✅ Memory consolidation extracts to CLAUDE.md (manual verification)
5. ✅ Memory decay reduces confidence over time (manual verification)
6. ✅ Performance metrics show:
   - L0 cache hit rate > 50%
   - L1 latency < 5ms
   - L2 latency < 3s
   - L3 disagreement < 10%
7. ✅ Updated manual testing guide documents L2/L3 architecture
8. ✅ All Phase D code committed and merged to main

---

## Out of Scope (Phase E)

- L4 strategic pattern analysis (requires cross-session data warehouse)
- SKILL.md auto-generation (requires 3+ pattern occurrences)
- Memory tier 3 (RAG/Mem0) - only if CLAUDE.md proves insufficient
- Proactive homeostasis (heartbeat) - needs long-running process
- Cross-agent memory sharing (needs agent registry)

---

## Estimated Timeline

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Task 1: Fix L1 edge cases | 4 hours | None |
| Task 2: L2 certainty_alignment | 6 hours | Task 1 |
| Task 3: L2 knowledge_application | 6 hours | Task 1 |
| Task 4: L3 meta-assessment | 4 hours | Tasks 2+3 |
| Task 5: Memory consolidation | 6 hours | None |
| Task 6: Memory decay | 4 hours | None |
| Task 7: Performance monitoring | 4 hours | None |
| **Total** | **34 hours** | ~1 week |

**Note:** These are estimates. Actual time may vary based on debugging needs and test iterations.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| L2 LLM calls too slow (> 5s) | Medium | High | Use fast local model (glm-4.7-flash), implement 60s cache TTL |
| L3 disagreement > 10% (too noisy) | Low | Medium | Tune L1 thresholds before implementing L3 |
| Memory consolidation false positives | Medium | Low | Start with strict criteria (3+ occurrences, 0.85 confidence), monitor manually |
| Stemming library adds latency | Low | Low | Benchmark `natural` vs alternatives, cache stems |

---

## Testing Strategy

**Unit tests:**
- L1 edge case fixes (keyword + stuck detection)
- L2 LLM assessment (mock LLM responses)
- L3 meta-assessment (controlled disagreement scenarios)
- Memory consolidation (candidate identification)
- Memory decay (confidence reduction formula)

**Integration tests:**
- End-to-end homeostasis assessment with L0→L1→L2→L3 flow
- Knowledge store → CLAUDE.md consolidation
- Metrics collection and API endpoint

**Manual testing:**
- Run learning scenarios L5 and L6 with L2 enabled
- Verify CLAUDE.md contains consolidated knowledge after 3+ occurrences
- Check metrics dashboard shows expected performance

---

*Plan Created: 2026-02-12*
*Phase C Evaluation Report: docs/plans/2026-02-12-homeostasis-l0-l2-evaluation-report.md*
