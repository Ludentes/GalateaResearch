# Sprint 12 Task Checklist

**Sprint**: 12 (Phase F Part 1: Agent Runtime Foundation)
**Duration**: 1 week (Mon 2026-03-14 — Fri 2026-03-21)
**Status**: 🚀 Ready to start
**Capacity**: ~130 story points (65 points/week available)

---

## Critical Path (Must Complete Week 1)

### Week 1: Foundation Layer
- [ ] **F.1.1** Define `ChannelMessage` type (2 pts) — @backend
- [ ] **F.1.2** Discord adapter inbound (3 pts) — @backend
- [ ] **F.1.3** Discord adapter outbound (3 pts) — @backend
- [ ] **F.1.4** Dashboard adapter (2 pts) — @backend
- [ ] **F.1.5** Channel dispatcher (2 pts) — @backend
- [ ] **F.1.6** Round-trip integration test (3 pts) — @test
- [ ] **F.1.7** Migration guide (1 pt) — @docs

**F.1 Subtotal**: 16 pts ✓ Must complete before F.2

- [ ] **F.2.1** ReAct loop interface design (2 pts) — @backend
- [ ] **F.2.2** Inner loop + tool handling (5 pts) — @backend
- [ ] **F.2.3** Tool registration system (3 pts) — @backend
- [ ] **F.2.4** Safety pre-check scaffold (2 pts) — @backend
- [ ] **F.2.5** Conversation history (3 pts) — @backend
- [ ] **F.2.6** Budget accounting (2 pts) — @backend
- [ ] **F.2.7** Inner loop unit tests (4 pts) — @test
- [ ] **F.2.8** Agent loop integration test (3 pts) — @test

**F.2 Subtotal**: 24 pts ✓ Must complete before F.3

- [ ] **F.3.1** Define operational memory types (2 pts) — @backend
- [ ] **F.3.2** Operational memory store (JSONL) (3 pts) — @backend
- [ ] **F.3.3** Task assignment from messages (2 pts) — @backend
- [ ] **F.3.4** Task phase progression (2 pts) — @backend

**F.3 Early Subtotal**: 9 pts ✓ Parallel with F.2

---

## Extended Delivery (Week 2)

### F.3 Completion
- [ ] **F.3.5** Heartbeat tick handler (3 pts) — @backend
- [ ] **F.3.6** Carryover for continuity (2 pts) — @backend
- [ ] **F.3.7** Operational memory tests (3 pts) — @test
- [ ] **F.3.8** Heartbeat integration test (3 pts) — @test

**F.3 Late Subtotal**: 11 pts ✓ Total F.3: 20 pts

### High Priority Support (Week 2)
- [ ] **F.4.1** Communication health → lastOutboundAt (2 pts) — @backend
- [ ] **F.4.2** Progress momentum → phase duration (2 pts) — @backend
- [ ] **F.4.3** Productive engagement → task list (2 pts) — @backend
- [ ] **F.4.4** Knowledge sufficiency → task context (2 pts) — @backend
- [ ] **F.4.5** Certainty alignment → task phase (1 pt) — @backend
- [ ] **F.4.6** Knowledge application → phase duration (1 pt) — @backend
- [ ] **F.4.7** Homeostasis wiring integration test (3 pts) — @test

**F.4 Subtotal**: 13 pts

- [ ] **F.5.1** Verify Qdrant health check (1 pt) — @infra
- [ ] **F.5.2** Hybrid vector + payload retrieval (4 pts) — @backend
- [ ] **F.5.3** Composite re-ranking score (3 pts) — @backend
- [ ] **F.5.4** Migrate entries to Qdrant (2 pts) — @backend
- [ ] **F.5.5** Hard rules budget reservation (2 pts) — @backend
- [ ] **F.5.6** Qdrant fallback + logging (2 pts) — @backend
- [ ] **F.5.7** Retrieval tests (3 pts) — @test
- [ ] **F.5.8** Load test 500+ entries (2 pts) — @perf

**F.5 Subtotal**: 19 pts

- [ ] **F.6.1** Entity validation heuristics (2 pts) — @backend
- [ ] **F.6.2** about.entity validation (2 pts) — @backend
- [ ] **F.6.3** Confidence distribution check (2 pts) — @backend
- [ ] **F.6.4** Type distribution check (1 pt) — @backend
- [ ] **F.6.5** Integrate into pipeline (2 pts) — @backend
- [ ] **F.6.6** Guard unit tests (2 pts) — @test
- [ ] **F.6.7** Pipeline + guard integration test (2 pts) — @test

**F.6 Subtotal**: 13 pts

- [ ] **F.7.1** Upgrade budget to 12K (1 pt) — @backend
- [ ] **F.7.2** Per-section accounting (3 pts) — @backend
- [ ] **F.7.3** Truncation priority logic (2 pts) — @backend
- [ ] **F.7.4** Budget overage logging (2 pts) — @backend
- [ ] **F.7.5** Token budget tests (2 pts) — @test
- [ ] **F.7.6** Manual verification (1 pt) — @manual

**F.7 Subtotal**: 11 pts

- [ ] **F.8.1** Document Layer 0 (LLM guardrails) (2 pts) — @docs
- [ ] **F.8.2** Document Layer 0.5 (Ollama guardrail) (2 pts) — @docs
- [ ] **F.8.3** Document Layer 1 (Homeostasis self_preservation) (2 pts) — @docs
- [ ] **F.8.4** Document Layer 2 (Hard guardrails) (2 pts) — @docs
- [ ] **F.8.5** Define trust matrix (2 pts) — @docs
- [ ] **F.8.6** Define tool risk metadata schema (1 pt) — @docs
- [ ] **F.8.7** Document hook integration (2 pts) — @docs
- [ ] **F.8.8** Safety design review + approval (1 pt) — @PM

**F.8 Subtotal**: 14 pts

---

## Testing & Validation Checkpoints

### Daily (EOD)
- [ ] `pnpm test` — Phase E tests still green (163 tests)
- [ ] No regressions in existing functionality

### Per Deliverable (Before PR)
- [ ] F.1: Discord round-trip verified manually
- [ ] F.2: Stub tool iteration verified (mock echo tool)
- [ ] F.3: Operational memory persists across restart
- [ ] F.4: Homeostasis dimensions use operational context
- [ ] F.5: Retrieval latency < 500ms with 500 entries
- [ ] F.6: Confabulation guard catches hallucinations
- [ ] F.7: Per-section token accounting logged
- [ ] F.8: Safety design reviewed by PM + tech lead

### Sprint End
- [ ] All 8 PRs merged to main
- [ ] All Phase E tests still green
- [ ] Sprint demo: E2E message flow (Discord → tick → Discord)
- [ ] Sprint demo: Heartbeat continues in-progress work
- [ ] Safety design approved + ready for Phase G

---

## Story Point Summary

| Phase | Total | Week 1 Target | Week 2 Target |
|-------|-------|---------------|---------------|
| F.1 | 16 | 🔴 16 (Critical) | — |
| F.2 | 24 | 🔴 24 (Critical) | — |
| F.3 | 20 | 9 (Parallel) | 11 (Finish) |
| F.4 | 13 | — | 13 |
| F.5 | 19 | — | 19 |
| F.6 | 13 | — | 13 |
| F.7 | 11 | — | 11 |
| F.8 | 14 | — | 14 |
| **TOTAL** | **130** | **49** | **81** |

**Pace**: 49 pts Week 1 (feasible with 2 solid backend devs + 1 test), 81 pts Week 2 (if Week 1 stays on track)

---

## Key Blockers to Avoid

🚫 **Do Not**:
- Break Phase E tests (it's the foundation for F)
- Commit directly to main — use feature branches
- Enable Qdrant in F.5 until tests pass (keep disabled, use fallback)
- Start tool execution before F.8 safety design is approved
- Implement multi-agent before F completes (Phase H only)

✅ **Do**:
- Merge F.1 → F.2 → F.3 in sequence (dependencies matter)
- Run full test suite daily
- Update ARCHITECTURE.md Implementation Status table when sections complete
- Keep CLAUDE.md up to date with decisions made
- Document new types/interfaces clearly (they're part of public API)

---

## File Checklist (Git)

### New Files to Create
- [ ] `server/types/channel.ts` — ChannelMessage type definition
- [ ] `server/runtime/agent-loop.ts` — ReAct inner loop
- [ ] `server/runtime/tool-registry.ts` — Tool registration
- [ ] `server/runtime/safety-check.ts` — Safety check stubs
- [ ] `server/runtime/operational-memory.ts` — Task state persistence
- [ ] `server/runtime/task-state.ts` — TaskState type definitions
- [ ] `server/memory/qdrant-retrieval.ts` — Hybrid vector retrieval
- [ ] `server/memory/confabulation-guard.ts` — Post-extraction validation
- [ ] `docs/plans/safety-model.md` — Safety architecture design
- [ ] `server/__tests__/channel-abstraction.test.ts`
- [ ] `server/__tests__/agent-loop.test.ts`
- [ ] `server/__tests__/operational-memory.test.ts`
- [ ] `server/__tests__/homeostasis-wiring.test.ts`
- [ ] `server/__tests__/qdrant-retrieval.test.ts`
- [ ] `server/__tests__/confabulation-guard.test.ts`
- [ ] `server/__tests__/token-budget.test.ts`

### Files to Update
- [ ] `server/adapters/discord-adapter.ts` — Refactor to use ChannelMessage
- [ ] `server/adapters/dashboard-adapter.ts` — Refactor to use ChannelMessage
- [ ] `server/memory/context-assembler.ts` — Upgrade to 12K budget + per-section accounting
- [ ] `server/memory/extraction-pipeline.ts` — Add confabulation guard
- [ ] `server/engine/homeostasis-engine.ts` — Wire operational memory inputs
- [ ] `server/memory/fact-retrieval.ts` — Support Qdrant with fallback
- [ ] `server/runtime/heartbeat.ts` — Update for new agent loop
- [ ] `docs/ARCHITECTURE.md` — Update Implementation Status table
- [ ] `docs/ROADMAP.md` — Mark Phase F in progress

---

## Definition of Done (Per Task)

Each task is DONE when:
1. ✅ Code written + type-safe (no `any` types)
2. ✅ Tests written (unit + integration as applicable)
3. ✅ Tests pass (`pnpm test <component>`)
4. ✅ PR created with clear description
5. ✅ Code reviewed by peer
6. ✅ Acceptance criteria met (from sprint plan)
7. ✅ ARCHITECTURE.md updated (if architectural change)
8. ✅ Merged to main

---

## Communication & Escalation

**Daily Standups**:
- Report blockers immediately (don't wait for EOD)
- If stuck > 2h, ping team for pairing

**Weekly Sync** (Friday):
- Sprint review: Demo E2E message flow
- Retrospective: What worked, what didn't
- Handoff plan for Sprint 13

**Risk Escalation** (immediate):
- If Phase E tests regress → stop work, fix, investigate
- If F.1 blocks F.2 → pair programming
- If safety design contentious → call team meeting (don't debate async)

---

## Success Metrics

By end of Sprint 12, these must be true:

| Metric | Target | Verification |
|--------|--------|--------------|
| Phase E tests green | 163/163 | `pnpm test` |
| F.1-F.8 PRs merged | 8/8 | Git history |
| E2E message routing | ✅ Working | Manual test: Discord ↔ tick ↔ Discord |
| Heartbeat advancement | ✅ Works | In-progress task continues without inbound |
| Operational memory | ✅ Persists | Kill server → restart → task resumes |
| Safety model approved | ✅ Yes | PM sign-off in docs/plans/safety-model.md |

---

## Rollover to Sprint 13

If any F.1-F.8 tasks slip:
- **Adjust**: Carry them to Sprint 13
- **Do NOT**: Merge half-finished work to main
- **Plan**: Sprint 13 continues F (if needed) + starts Phase G design

**Expected output** from Sprint 13:
- F.5-F.8 completion (if carried over)
- Phase G design doc (CodingToolAdapter interface, PreToolUse hooks)
- Initial Phase G implementation (G.1 adapter + G.2 hooks)

---

*Created: 2026-03-14*
*For Team*: Print this, stick it on wall, check off daily
*Reference*: docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md (detailed spec)
