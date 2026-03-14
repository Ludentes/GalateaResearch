# Sprint 12: Agent Runtime Foundation (Phase F Part 1)

**Date**: 2026-03-14
**Phase**: F (Agent Runtime v2) — Part 1
**Duration**: 1 week
**Dependencies**: Phase E complete
**Predecessor**: Sprint 11 (Phase E completion)
**Successor**: Sprint 13 (Phase F Part 2)

---

## Overview

Sprint 12 focuses on **foundational runtime infrastructure** for Phase F. The goal is to replace the single-call tick loop with a modern agent architecture that supports multi-step work, conversation history, and channel-based message routing.

This sprint establishes the substrate before any work execution (Phase G) can happen. **Everything else in the system depends on these architectural changes.**

### Key Constraints
- No destructive changes to Phase E code (must maintain 163 green tests)
- Vector retrieval (Qdrant) remains disabled until F.5
- Single-agent implementation (multi-agent interfaces designed, not implemented)
- No tool execution yet (scaffolding only in F.2)

---

## Deliverables

### F.1: Channel Message Abstraction (Core Foundation)

**Status**: 🚀 Starting
**Why First**: Every other deliverable depends on unified message routing.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.1.1 | Define `ChannelMessage` type | backend | 2 | ✅ Type exported from `server/types/channel.ts` with routing, direction, messageType, metadata |
| F.1.2 | Implement Discord adapter (inbound) | backend | 3 | ✅ Discord messages → ChannelMessage; mention parsing works; @agent tags extracted |
| F.1.3 | Implement Discord adapter (outbound) | backend | 3 | ✅ ChannelMessage → Discord webhooks; thread routing works; round-trip verified |
| F.1.4 | Implement Dashboard adapter | backend | 2 | ✅ Chat UI messages ↔ ChannelMessage; SSE delivery for outbound; routing metadata preserved |
| F.1.5 | Create channel dispatcher | backend | 2 | ✅ Routes outbound ChannelMessage to correct adapter; logs to OTEL; delivery confirmation |
| F.1.6 | Integration test: Round-trip routing | test | 3 | ✅ Discord → tick → Discord verified; Dashboard → tick → Dashboard verified; Thread context preserved |
| F.1.7 | Migration guide for legacy PendingMessage | docs | 1 | ✅ Document explains ChannelMessage replacement; shows before/after code; lists files to update |

**Total**: 16 story points

**Key Files**:
- `server/types/channel.ts` (new)
- `server/runtime/channel-dispatcher.ts` (new)
- `server/adapters/discord-adapter.ts` (refactor existing)
- `server/adapters/dashboard-adapter.ts` (refactor existing)
- Tests: `server/__tests__/channel-abstraction.test.ts` (new)

**Validation**:
- Run `pnpm test channel` — all tests green
- Verify Discord and dashboard in manual testing
- Check OTEL logs for channel routing events

---

### F.2: Agent Loop v2 with Tool Scaffolding

**Status**: 🚀 Starting (depends on F.1)
**Why Critical**: Replaces the broken tick loop. Everything else builds on this.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.2.1 | Define ReAct agent loop interface | backend | 2 | ✅ Loop contract: input context, inner loop logic, budget controls, response output |
| F.2.2 | Implement inner loop (LLM + tool call handling) | backend | 5 | ✅ LLM call; tool_call detection; safety pre-check stub; budget enforcement (max 10 steps); timeout (60s) |
| F.2.3 | Implement tool registration system | backend | 3 | ✅ `registerTool()` function; tool schema from ZodSchema; stub tools (echo, list-tools); risk metadata on each tool |
| F.2.4 | Tool safety pre-check scaffold | backend | 2 | ✅ Placeholder hook that always allows; returns deny/allow + reason; integrated into inner loop |
| F.2.5 | Conversation history in context | backend | 3 | ✅ Last 5 exchanges from operational memory; appended to system prompt; history bounded correctly |
| F.2.6 | Budget accounting | backend | 2 | ✅ Track token usage per section (system, knowledge, tools, history); log overage events |
| F.2.7 | Inner loop tests (unit) | test | 4 | ✅ Simple response (no tools); tool call iteration; budget limit; timeout; history preservation |
| F.2.8 | Integration test: Agent loop with stub tools | test | 3 | ✅ Send task → loop → stub tool calls → final response; verifies multi-turn capability |

**Total**: 24 story points

**Key Files**:
- `server/runtime/agent-loop.ts` (new)
- `server/runtime/tool-registry.ts` (new)
- `server/runtime/safety-check.ts` (skeleton)
- Tests: `server/__tests__/agent-loop.test.ts` (new)

**Validation**:
- `pnpm test agent-loop` — all tests green
- Manual: Send message → stub tool calls → response in Discord/Dashboard
- Verify budget accounting in logs

---

### F.3: Operational Memory (Work State Persistence)

**Status**: 🚀 Starting (depends on F.2)
**Why Essential**: Without this, the agent can't continue work across ticks.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.3.1 | Define `OperationalContext` and `TaskState` types | backend | 2 | ✅ Types exported; all fields from unified architecture spec |
| F.3.2 | Implement operational memory store (JSONL) | backend | 3 | ✅ Load from `data/agents/{id}/context.jsonl`; save after each tick; atomic writes |
| F.3.3 | Task assignment from ChannelMessage | backend | 2 | ✅ Message with type="task_assignment" → TaskState created; source routing preserved |
| F.3.4 | Task phase progression | backend | 2 | ✅ Phase updates trigger `phaseStartedAt`; state saved; phases: exploring → deciding → implementing → verifying |
| F.3.5 | Heartbeat tick handler | backend | 3 | ✅ Heartbeat detects in-progress tasks; continues work arc; respects 30s interval; skips idle |
| F.3.6 | Carryover for cross-session continuity | backend | 2 | ✅ Completed task → carryover summary; available in next session's context |
| F.3.7 | Operational memory load/save tests | test | 3 | ✅ Task persists across server restart; multi-task prioritization; carryover available |
| F.3.8 | Heartbeat integration test | test | 3 | ✅ In-progress task continues without new inbound message; phase timestamps tracked |

**Total**: 20 story points

**Key Files**:
- `server/runtime/operational-memory.ts` (new)
- `server/runtime/task-state.ts` (type definitions)
- `server/runtime/heartbeat.ts` (refactor existing)
- Tests: `server/__tests__/operational-memory.test.ts` (new)

**Validation**:
- Kill server mid-task → restart → task resumes ✅
- Heartbeat ticks without inbound messages ✅
- Carryover notes available in next session ✅

---

### F.4: Homeostasis Wiring to Operational Memory

**Status**: 🔵 Planned (depends on F.3)
**Why Important**: Operational memory feeds homeostasis for context-aware guidance.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.4.1 | Connect `communication_health` to `lastOutboundAt` | backend | 2 | ✅ HIGH state when message sent < 5 min ago; LOW when in-progress task + silent 3h+ |
| F.4.2 | Connect `progress_momentum` to phase duration | backend | 2 | ✅ Stuck detection via `phaseEnteredAt`; LOW after 2h in same phase with HEALTHY knowledge_sufficiency |
| F.4.3 | Connect `productive_engagement` to task list | backend | 2 | ✅ Reads operational tasks; HEALTHY if assigned or in-progress; LOW if idle + no pending messages |
| F.4.4 | Connect `knowledge_sufficiency` to task context | backend | 2 | ✅ Uses task.description for retrieval queries; rated against retrieved facts count + confidence |
| F.4.5 | Connect `certainty_alignment` to task phase | backend | 1 | ✅ Lower threshold for implementing/verifying vs exploring; still defaults HEALTHY without L2 |
| F.4.6 | Connect `knowledge_application` to phase duration | backend | 1 | ✅ HIGH after exploring 90+ minutes with HEALTHY knowledge_sufficiency |
| F.4.7 | Integration test: Homeostasis reads operational memory | test | 3 | ✅ Dimension states react to task phase, phase duration, last outbound time |

**Total**: 13 story points

**Key Files**:
- `server/engine/homeostasis-engine.ts` (update existing)
- Tests: `server/__tests__/homeostasis-wiring.test.ts` (new)

**Validation**:
- Phase timeout triggers knowledge_application HIGH ✅
- Communication cooldown triggered ✅
- Dimension assessments use operational context ✅

---

### F.5: Embedding-Based Retrieval (Qdrant + Hybrid Search)

**Status**: 🔵 Planned
**Why Unlocks**: Better retrieval for 500+ entries; Memory Scenario 10 requirement.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.5.1 | Verify Qdrant running at localhost:6333 | infra | 1 | ✅ Health check passes; collection "galatea-knowledge" exists |
| F.5.2 | Implement hybrid retrieval (vector + payload filter) | backend | 4 | ✅ Vector similarity + entity/type/about filtering; fallback to keyword if Qdrant unavailable |
| F.5.3 | Composite re-ranking score | backend | 3 | ✅ Formula: similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1; hard rules always included |
| F.5.4 | Migrate entries to Qdrant | backend | 2 | ✅ Load existing JSONL entries; compute embeddings; index in collection; maintain JSONL as source |
| F.5.5 | Hard rules budget reservation | backend | 2 | ✅ Rules (type="rule") never dropped; always included in retrieval; reserved slot in context budget |
| F.5.6 | Qdrant fallback + logging | backend | 2 | ✅ If unavailable, fall back to keyword retrieval; log degradation warning; continue functioning |
| F.5.7 | Retrieval tests (unit + integration) | test | 3 | ✅ Vector similarity works; entity filtering works; composite ranking orders correctly; hard rules always included |
| F.5.8 | Load test with 500+ entries | perf | 2 | ✅ Retrieval latency < 500ms for 500 entries; recall > 80% on gold standard |

**Total**: 19 story points

**Key Files**:
- `server/memory/qdrant-retrieval.ts` (new)
- `server/memory/fact-retrieval.ts` (update existing)
- Tests: `server/__tests__/qdrant-retrieval.test.ts` (new)

**Validation**:
- `pnpm test retrieval` — all tests green ✅
- 500-entry load test passes ✅
- Fallback to keyword works when Qdrant down ✅

---

### F.6: Confabulation Guard (Post-Extraction Validation)

**Status**: 🔵 Planned
**Why Needed**: Catch LLM hallucinations before entries enter the store (Gap 13).

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.6.1 | Implement entity validation heuristics | backend | 2 | ✅ Entities must appear in source text or be known aliases; flag invented entities |
| F.6.2 | Implement about.entity validation | backend | 2 | ✅ about.entity must reference known person or "unknown"; remove invalid entries |
| F.6.3 | Implement confidence distribution check | backend | 2 | ✅ Flag uniform 1.0 confidence; suggest downward adjustment for inferred entries |
| F.6.4 | Implement type distribution check | backend | 1 | ✅ Warn if all entries same type; suggest type diversity check |
| F.6.5 | Integrate into extraction pipeline | backend | 2 | ✅ Guard runs after Knowledge Extractor, before Dedup; flags or drops bad entries |
| F.6.6 | Guard unit tests | test | 2 | ✅ Valid extraction passes unchanged; hallucinated entities flagged/removed; uniform confidence adjusted |
| F.6.7 | Integration test: Pipeline with guard | test | 2 | ✅ Extract from real transcript → guard validates → entries stored are clean |

**Total**: 13 story points

**Key Files**:
- `server/memory/confabulation-guard.ts` (new)
- `server/memory/extraction-pipeline.ts` (update existing)
- Tests: `server/__tests__/confabulation-guard.test.ts` (new)

**Validation**:
- `pnpm test confabulation` — all tests green ✅
- Real transcript extraction results pass guard ✅
- Hallucinated entities caught > 50% of the time ✅

---

### F.7: Token Budget Upgrade (12K + Per-Section Accounting)

**Status**: 🔵 Planned
**Why Important**: 4K budget too tight; 12K allows all context sections.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.7.1 | Upgrade token budget to 12K | backend | 1 | ✅ Config updated; context assembler respects new limit |
| F.7.2 | Implement per-section token accounting | backend | 3 | ✅ Track tokens: identity, rules, guidance, operational, history, tools, knowledge; log per section |
| F.7.3 | Truncation priority (non-truncatable sections) | backend | 2 | ✅ Identity + rules + guidance never truncated; knowledge dropped first if budget exceeded |
| F.7.4 | Budget overage logging | backend | 2 | ✅ Per-section breakdown visible in logs; percentage of budget per section; warning if > 90% |
| F.7.5 | Context assembler tests (budgets) | test | 2 | ✅ Sections fit within budget; knowledge truncated correctly; non-truncatable preserved; accounting accurate |
| F.7.6 | Manual verification: Prompt size tracking | manual | 1 | ✅ Send message → check logs → verify per-section token usage; identify budget bottlenecks |

**Total**: 11 story points

**Key Files**:
- `server/memory/context-assembler.ts` (update existing)
- Tests: `server/__tests__/token-budget.test.ts` (new)

**Validation**:
- All sections fit in 12K ✅
- Knowledge truncated cleanly if needed ✅
- Accounting logs show expected distribution ✅

---

### F.8: Safety Model Design (Pre-Implementation)

**Status**: 🔵 Planned
**Why Critical**: Must design before Phase G (tool execution). Safety is not a feature — it's a constraint on tool design.

#### Tasks

| # | Task | Owner | Story Points | Acceptance Criteria |
|---|------|-------|---------------|-------------------|
| F.8.1 | Document Layer 0 (LLM built-in guardrails) | docs | 2 | ✅ Design doc explains leverage of Claude's native safety; no custom implementation needed |
| F.8.2 | Document Layer 0.5 (Local guardrail model) | docs | 2 | ✅ Configures Ollama guardrail model (llama-guard, shieldgemma, etc.); ~50ms latency requirement |
| F.8.3 | Document Layer 1 (Homeostasis self_preservation) | docs | 2 | ✅ Explains 7th dimension; L1 heuristics; triggers (destructive tools, hard rule conflicts, trust violations) |
| F.8.4 | Document Layer 2 (Hard guardrails) | docs | 2 | ✅ Tool risk classification (read/write/destructive); hard blocks; workspace boundaries; branch protection |
| F.8.5 | Define trust matrix | docs | 2 | ✅ Channel × Identity grid; trust levels (FULL, HIGH, MEDIUM, LOW, NONE); maps to tool permissions |
| F.8.6 | Define tool risk metadata schema | docs | 1 | ✅ Every tool declares: name, risk (read|write|destructive), allowlist/blocklist rules |
| F.8.7 | Document hook integration for Phase G | docs | 2 | ✅ PreToolUse/PostToolUse hook signatures; how safety checks integrate into CodingToolAdapter |
| F.8.8 | Review + approval of safety design | PM | 1 | ✅ PM/team signs off on 4-layer model before Phase G implementation starts |

**Total**: 14 story points

**Key Files**:
- `docs/plans/safety-model.md` (new)
- `docs/safety-architecture.md` (optional detailed reference)

**Validation**:
- Design document covers all 4 layers ✅
- Trust matrix complete ✅
- Tool risk schema documented ✅
- Approved by team before Phase G ✅

---

## Sprint Summary

### Capacity Allocation

| Deliverable | Story Points | Priority | Target Week |
|------------|--------------|----------|------------|
| **F.1**: Channel Abstraction | 16 | 🔴 Critical | Week 1 |
| **F.2**: Agent Loop v2 | 24 | 🔴 Critical | Week 1 |
| **F.3**: Operational Memory | 20 | 🔴 Critical | Weeks 1-2 |
| **F.4**: Homeostasis Wiring | 13 | 🟡 High | Week 2 |
| **F.5**: Qdrant Retrieval | 19 | 🟡 High | Week 2 |
| **F.6**: Confabulation Guard | 13 | 🟠 Medium | Week 2 |
| **F.7**: Token Budget Upgrade | 11 | 🟠 Medium | Week 2 |
| **F.8**: Safety Design | 14 | 🟠 Medium | Week 2 |

**Total**: 130 story points across 1 week → ~65 points/week capacity needed

### Phased Rollout

**Week 1 Focus** (Critical Path):
1. F.1 (Channel Abstraction) — foundation for all others
2. F.2 (Agent Loop v2) — runtime core
3. Start F.3 (Operational Memory) — parallel with F.2

**Week 2 Focus** (Extend + Support):
4. Finish F.3 (Operational Memory)
5. F.4 (Homeostasis Wiring) — critical for context-aware behavior
6. F.5 (Qdrant Retrieval) — enables scaling
7. F.6, F.7, F.8 (Polish + Design) — blockers for Phase G

### Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| F.1 delays all downstream work | Start immediately; pair programming if blocked | backend |
| F.2 inner loop too slow | Budget controls (max 10 steps, 60s timeout) + benchmarking | backend |
| Qdrant operational complexity (F.5) | Already running; fallback to keyword retrieval | infra |
| Safety design delays Phase G (F.8) | Time-box to 3 days; PM approval gate; no scope creep | PM |
| Phase E tests regress | Run full test suite daily; no breaking changes to existing code | test |

---

## Acceptance Criteria (Sprint Success)

✅ All F.1-F.8 deliverables code-complete (PRs merged)
✅ Phase E tests still green (163 tests passing)
✅ Integration test: Round-trip message routing works (Discord ↔ tick ↔ Discord)
✅ Heartbeat tick continues in-progress work without inbound messages
✅ Operational memory persists across server restarts
✅ Safety model design document reviewed and approved
✅ All per-deliverable acceptance criteria met

---

## Notes

- **Phase F** is foundational. Phase G (Work Execution) cannot start until F is complete.
- **No tool execution yet** — F.2 scaffolds the structure but only stub tools are registered. Real tools (file/git/shell) come in Phase G via CodingToolAdapter.
- **Qdrant** remains disabled in F.5 until tested. Fallback to keyword retrieval is automatic if unavailable.
- **Safety design** (F.8) is documentation + architecture, not implementation. Implementation happens in Phase G's PreToolUse hooks.
- **Single-agent** throughout. Multi-agent interfaces designed but not instantiated. Phase H handles multi-agent state partitioning.

---

## Dependencies & Handoff

**Depends on**: Phase E complete (163 tests green)
**Blocks**: Phase G (Work Execution via CodingToolAdapter)
**Handoff to**: Sprint 13 (continue F.5-F.8 completion, start Phase G design)

**Reference Scenarios Addressed**:
- Trace 4: Execute Task (need F.2 agent loop + F.3 operational memory)
- Trace 7: Idle Agent (need F.4 communication health + heartbeat)
- Trace 8: Guardrail (need F.4 phase duration + knowledge_application)
- Memory Scenario 10: Token Budget (need F.7)
- Memory Scenario 14-15: Confabulation (need F.6)

---

*Created: 2026-03-14*
*Prepared for**: Sprint 12
*Synth from**: Unified Architecture (2026-02-21), Reference Scenarios, ARCHITECTURE.md (2026-03-12)
