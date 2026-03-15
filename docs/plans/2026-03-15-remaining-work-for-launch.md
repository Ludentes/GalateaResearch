# Remaining Work for Launch

**Date:** 2026-03-15
**Goal:** Stable beta where Beki and Besa autonomously handle dev and PM work with lifecycle discipline.

---

## What "Launch" Means

Agents can:
1. Receive tasks via Discord, do work using superpowers skills, verify, commit, report back
2. Answer questions about their own state (homeostasis introspection)
3. Communicate with each other via Discord when they need information
4. Handle long-running tasks without HTTP timeouts
5. Be monitored via Fleet dashboard with homeostasis visibility

---

## Completed Today (2026-03-15)

All validated with passing scenarios:

| Item | Scenarios | Status |
|------|-----------|--------|
| Workflow instructions in agent specs | L94, L95, L98-L100 | DONE |
| Context assembler: WORKFLOW + SELF-AWARENESS sections | L96 | DONE |
| Priority queue (`pickNextMessage`) | L97 | DONE |
| `formatHomeostasisState()` | L96 | DONE |
| VERIFY stage (pipeline-enforced) | L95 | DONE |
| FINISH stage (commit guarantee) | L95 | DONE |
| Cross-agent communication via Discord | L94 | DONE |
| `dimension_explanations` in config.yaml | L98 (Besa dogfood) | DONE |
| `getDiffStat()` helper extraction | L99 (Beki dogfood) | DONE |
| Edge case tests for priority queue + format | L100 (Beki dogfood) | DONE |
| Homeostasis reference skill | Manual | DONE |

---

## Remaining Work

### P0 — Blocks Launch

#### 1. Async Job Model

**Problem:** POST `/api/agent/inject` blocks for 30-300s, causing HTTP timeouts. Discord bots can't respond. External integrations fail.

**Design:** Complete spec at `docs/plans/2026-03-15-async-job-model-spec.md` (written by Besa in L93).

**Scope:**
- Job store (in-memory with 24h TTL) — `server/agent/job-store.ts`
- POST `/api/agent/inject` returns `{ jobId }` immediately, runs tick in background
- GET `/api/agent/jobs/:jobId` for polling status
- Optional SSE streaming endpoint
- Backward-compatible: existing callers get same response shape

**Effort:** 2-3 days
**Decision needed:** In-memory only for MVP, or Redis/DB persistence?

#### 2. Update ARCHITECTURE.md

**Problem:** Implementation Status table is dated 2026-03-12. Doesn't reflect lifecycle pipeline, priority queue, VERIFY/FINISH stages, SELF-AWARENESS, or workflow instructions. Gap #12 ("Work is not modeled") is still marked Critical/Open but is now largely resolved.

**Effort:** 30 minutes

#### 3. Scenario Runner Stability

**Problem:** Long-running scenarios (3-5 min) intermittently return 500. Retry workaround deployed (commit 403a9f1) but root cause unknown. Likely related to Nitro middleware timeout or Ollama backpressure.

**Impact:** Makes CI-style scenario validation unreliable.

**Investigation needed:**
- Is it Nitro's default request timeout?
- Is it Ollama queue saturation?
- Would async job model fix this entirely?

**Effort:** 1 day investigation, fix depends on root cause. May be resolved by async job model (P0.1).

---

### P1 — Important for Usable Beta

#### ~~4. Settings Screen Backend~~ — DONE

Already implemented on main:
- `server/routes/api/agent/config-update.ts` — POST endpoint with validation
- `server/routes/api/agent/config-validation.ts` — validates allowed keys, ranges, strategies
- `app/routes/agent/settings.tsx` — full settings UI with form state management
- `app/components/SettingInput.tsx`, `SettingSelect.tsx`, `SettingsGroup.tsx` — reusable form components

#### ~~5. Fleet Dashboard Enhancements~~ — DONE

Already implemented on main:
- `app/components/agent/HomeostasisSparkline.tsx` — 7-bar sparkline per agent card
- `app/components/agent/DimensionHeatmap.tsx` — dimension history heatmap

#### 6. Confabulation Guard

**Problem:** Stub only (1 function in `server/memory/confabulation-guard.ts`). Validates extracted facts against actual transcript content to prevent hallucinated knowledge.

**Impact:** Without this, agents may learn incorrect facts from extraction hallucinations. Risk increases with cloud LLM extraction (currently using heuristics-only which doesn't hallucinate).

**Effort:** 1-2 days

---

### P2 — Nice to Have for Launch

#### 7. Context Assembler Audit Trail

**Problem:** TODO at `server/memory/context-assembler.ts:204` — `exposedEntryDecisions` map not implemented. Tracks why specific facts were included/excluded from context.

**Impact:** Observability only. Helps debug "why didn't the agent know X?" questions.

**Effort:** 2-3 hours

#### 8. Enable Vector Retrieval (Qdrant)

**Problem:** Implemented but disabled (`use_vector: false`). Currently using entity + keyword retrieval only. Vector search would improve recall when keyword matching fails.

**Prerequisite:** Performance testing with 500+ facts to validate latency is acceptable.

**Effort:** 1 day (testing + tuning, code already exists)

#### 9. Enable Batch Dedup

**Problem:** Implemented but disabled (`enabled: false`). LLM-based deduplication of extracted facts reduces noise but adds cost.

**Decision:** Enable once extraction volume justifies the cost, or if fact quality drops below threshold.

**Effort:** Config toggle + monitoring

#### 10. Routing TaskType Inconsistency

**Problem:** `task_assignment` messages sometimes route as `research`, sometimes as `coding`, depending on content. Scenario assertions had to be adjusted to match actual behavior (commit 403a9f1).

**Impact:** VERIFY stage only triggers for `coding` taskType. If a coding task routes as `research`, verification is skipped.

**Fix options:**
- Improve routing prompt to be more consistent
- Add task type override in scenario YAML
- Make VERIFY trigger on `task_assignment` messageType regardless of inferred taskType

**Effort:** 1-2 hours for option C, 1 day for option A

---

### P3 — Post-Launch

#### 11. Multi-Agent State (Phase H)

Agent registry, persona export/import, state synchronization across agents. Currently each agent is independent — no shared task tracking.

#### 12. Homeostasis L3-L4

L3 (cross-dimension patterns) and L4 (predictive) are stubs only. L0-L2 covers current needs.

#### 13. Session Resume UX

Operational memory tracks phase, but no explicit "resume this task" UI. Agents can continue across ticks via carryover summaries, but it's not surfaced to operators.

#### 14. Local LLM Hallucination Mitigation (Gap #13)

Every LLM-facing prompt needs strict structured output. Currently handled case-by-case. Systematic audit of all LLM touchpoints would reduce risk.

---

## Critical Path

```
Now:     Update ARCHITECTURE.md (30m)
         └─→ Async Job Model implementation (2-3 days)
              └─→ Scenario runner stability (may be fixed by async model)

Parallel: Routing taskType fix (1-2h)
          Agent worktree/MR pipeline fix (see below)

After:   Confabulation guard (1-2 days)
         Vector retrieval testing (1 day)

Launch:  ~1 week from today (2026-03-21)
```

**Note:** Items 4 (Settings Backend) and 5 (Fleet Dashboard) were already implemented on main but listed as missing. Stale worktrees `settings-screen-101` and `settings-screen-impl` cleaned up on 2026-03-15.

---

## Decisions Needed

1. **Async job model storage**: In-memory only (simpler, loses state on restart) or Redis (durable, adds dependency)?
2. **VERIFY trigger**: Should it fire on all `task_assignment` messages or only when taskType is `coding`?
3. **Vector retrieval**: Enable before launch or defer until fact count exceeds 500?
4. **Confabulation guard**: Block launch on this or accept heuristics-only extraction risk?
