> **NOTE**: These findings are from Phase 3 testing against the old infrastructure (Ollama + Graphiti + custom engines). The findings about Graphiti inflation, knowledge sufficiency, and prompt quality remain relevant for v2 design. See [v2 Architecture Redesign](plans/2026-02-11-galatea-v2-architecture-design.md).

# Stage G: Reference Scenario Testing — Findings

## Summary

5 reference scenarios tested (21 tests total, all passing). 3 integration tests with real Ollama LLM + Graphiti sidecar, 2 engine-level tests with crafted contexts.

| Scenario | Tests | Time | Layer |
|----------|-------|------|-------|
| Trace 2: Knowledge Gap | 3 | 179s | Integration (Ollama) |
| Trace 4: Execute Task | 4 | 172s | Integration (Ollama) |
| Trace 6: Unknown Situation | 3 | 194s | Integration (Ollama) |
| Trace 7: Idle Agent | 5 | 16ms | Engine-level |
| Trace 8: Over-Research | 6 | 17ms | Engine-level |

Existing test suite: 305 tests, 0 regressions.

---

## Finding 1: Knowledge Sufficiency Inflation (Critical)

**Problem:** Graphiti returns 20 tangential facts for ANY query, regardless of topic relevance. When asked about "JWT authentication in Expo", Graphiti returns NestJS architecture facts from prior sessions. The `knowledge_sufficiency` dimension treats these as relevant knowledge.

**Evidence:**
- Trace 2: Queried "JWT authentication in Expo React Native" → 20 facts returned (all about NestJS/architecture/monoliths)
- Trace 4: Queried "user profile screen expo NativeWind" → 20 facts returned (same NestJS facts)
- Trace 6: Queried "push notifications Expo" → 20 facts returned (same NestJS facts)

**Impact:** `knowledge_sufficiency` shows HEALTHY in the pipeline even when the agent has zero domain-specific knowledge. The dimension only works correctly in engine-level tests where we control the fact count.

**Root cause:** `searchFacts` uses Graphiti's vector similarity search without relevance threshold. Small datasets return everything as "similar enough". The `assembleContext` scorer also has no minimum relevance cutoff — all 20 facts get scored and 10+ pass into the agent context.

**Fix needed:** Either (a) add a relevance threshold to `searchFacts`/`assembleContext`, (b) use Graphiti's ranking score to filter low-confidence matches, or (c) add semantic relevance checking in the scoring formula.

---

## Finding 2: Activity Router Works Correctly

**What works:**
- "How do I" → `hasKnowledgeGap=true` → Level 3 (Reflexion)
- "Help me understand" → `hasKnowledgeGap=true` → Level 3
- "I've never done" → `hasKnowledgeGap=true` → Level 3
- "Implement X" (no gap markers) → Level 2 (Standard)
- "Add a loading spinner" (no gap markers) → Level 2
- "Refactor the user service" → Level 2

**Keyword detection:**
- `isHighStakes` correctly identifies "authentication", "production", "deploy"
- `isIrreversible` requires exact substring match ("deploy to production" must appear contiguously — "deploy the profile service to production" does NOT match because "the profile service" interrupts the substring)

**Gap found:** `isHighStakes=true` alone does not trigger Level 3. It requires EITHER `hasKnowledgeGap=true` or `isIrreversible=true` to escalate. A high-stakes but non-irreversible task stays at Level 2.

---

## Finding 3: Reflexion Loop Functions but Has JSON Parse Issue

**What works:** Level 3 classification triggers the Reflexion loop (Draft → Critique → Revise). The loop produces longer, more detailed responses.

**Issue:** The LLM wraps critique JSON in markdown code fences (`` ```json ... ``` ``). The parser expects raw JSON and throws `SyntaxError: Unexpected token`. It falls back to treating the critique as a pass.

**Impact:** Non-fatal — responses still generate. But the critique step is effectively bypassed, making Level 3 = "generate twice" rather than true Reflexion.

**Evidence:** Both Trace 2 and Trace 6 logged: `[ReflexionLoop] Failed to parse critique JSON: SyntaxError`

**Fix needed:** Strip markdown code fences from LLM output before JSON.parse in `reflexion-loop.ts`.

---

## Finding 4: Dimension Variation Works in Engine, Partially in Pipeline

### Dimensions that vary correctly in the pipeline:

| Dimension | Trigger | Evidence |
|-----------|---------|----------|
| `communication_health` | Time since last message | HEALTHY → HIGH on follow-up messages (< 2min) in Trace 4, Trace 6 |
| `productive_engagement` | `hasAssignedTask` | Always HEALTHY in pipeline (messages exist = task assigned) |
| `certainty_alignment` | Uncertainty + high-stakes keywords | HEALTHY for normal messages; would be LOW for "not sure about deleting production" |

### Dimensions that work in engine-level tests only:

| Dimension | Why it doesn't vary in pipeline | Evidence |
|-----------|-------------------------------|----------|
| `knowledge_sufficiency` | Graphiti inflation (Finding 1) | Always HEALTHY in pipeline; correctly LOW with 0 facts in engine tests |
| `productive_engagement: LOW` | `buildAgentContext` sets `hasAssignedTask=true` when messages exist | Only testable with crafted context (Trace 7) |
| `knowledge_application` | No `timeSpentResearching`/`timeSpentBuilding` data in pipeline | Always HEALTHY (default, confidence 0.4); works with crafted data (Trace 8) |
| `progress_momentum: LOW` | Requires >30min on task + <3 actions; tests run faster | Testable with crafted context (Trace 7) |

### Dimensions that never vary in current testing:

| Dimension | State | Why |
|-----------|-------|-----|
| `certainty_alignment` | Always HEALTHY | Test messages don't combine uncertainty markers + high-stakes keywords |

---

## Finding 5: Guidance System Priority Works

The guidance system correctly prioritizes imbalanced dimensions:

| Priority | Dimension | Example trigger |
|----------|-----------|----------------|
| 1 | `knowledge_sufficiency: LOW` | No relevant facts |
| 2 | `progress_momentum: LOW` | Stuck >30min |
| 2 | `productive_engagement: LOW` | No assigned task |
| 5 | `knowledge_application: LOW/HIGH` | Research imbalance |
| 6 | `communication_health: HIGH` | Over-communicating |

**Tension resolution:** When `knowledge_sufficiency: LOW` and `knowledge_application: HIGH` co-occur (over-researching but no useful knowledge), the guidance prioritizes "fill knowledge gaps" over "stop researching" — suggesting active experimentation rather than passive research.

**Idle agent tension:** When `productive_engagement: LOW` and `communication_health: HIGH` co-occur (needs work but just messaged), the guidance surfaces both but `knowledge_sufficiency: LOW` takes primary position.

---

## Finding 6: Pipeline Timing

| Activity | Time (Ollama glm-4.7-flash) |
|----------|-----|
| Level 2 (standard) | 15-65s |
| Level 3 (Reflexion) | 110-145s |
| Level 3 overhead vs Level 2 | ~3-4x |
| Homeostasis fire-and-forget | <500ms |
| Engine-level assessment | <1ms |

Level 3 consistently takes 3-4x longer than Level 2 due to multiple LLM calls in the Reflexion loop. Response length varies — Level 3 sometimes produces shorter responses than Level 2.

---

## Known Gaps (Phase 4+ Dependencies)

| Gap | Required By | Phase |
|-----|------------|-------|
| `timeSpentResearching`/`timeSpentBuilding` not tracked | `knowledge_application` dimension | Phase 4: Observation Pipeline |
| `hasAssignedTask` always true during conversations | `productive_engagement: LOW` detection | External task tracking system |
| No relevance threshold on Graphiti search | `knowledge_sufficiency` accuracy | Phase 2 refinement or Graphiti config |
| Reflexion loop critique JSON parsing | Level 3 quality | Bug fix in `reflexion-loop.ts` |
| `isIrreversible` requires exact substring match | High-stakes escalation | Improve keyword matching (word boundary or NLP) |
| No LLM-based assessments | `certainty_alignment` nuance | Future: hybrid assessment |
| All assessments are "computed" (heuristic) | Assessment quality | Future: LLM upgrade path |

---

## Recommendations

1. **Fix Graphiti relevance filtering** (highest impact) — Without this, `knowledge_sufficiency` is meaningless in the pipeline. Options: minimum similarity score threshold, or semantic relevance check in scoring formula.

2. **Fix Reflexion loop JSON parsing** — Strip markdown code fences before `JSON.parse`. Low effort, restores Level 3 critique quality.

3. **Improve `isIrreversible` matching** — Use word-boundary matching instead of exact substring. "Deploy X to production" should match even with intervening words.

4. **Wire `timeSpentResearching`/`timeSpentBuilding`** — Phase 4 observation pipeline. Without this, the over-research guardrail is dormant in production.

5. **Add out-of-band idle detection** — A polling mechanism to check `productive_engagement` when no conversation is active. Without this, the idle state is invisible to the pipeline.
