# Sprint 12: Dependency Graph & Critical Path

---

## Critical Path (Must Complete In Sequence)

```
Week 1: Foundation
═════════════════════════════════════════════════════════════════
│
├─ F.1: Channel Abstraction (16 pts) ◄─── BLOCKS EVERYTHING
│   ├─ Define ChannelMessage type
│   ├─ Discord adapter in/out
│   ├─ Dashboard adapter
│   ├─ Channel dispatcher
│   └─ Round-trip tests
│
├─ F.2: Agent Loop v2 (24 pts) ◄─────── Depends on F.1
│   ├─ ReAct loop interface
│   ├─ Inner loop + tool handling
│   ├─ Tool registration
│   ├─ Safety scaffold
│   ├─ Conversation history
│   ├─ Budget accounting
│   └─ Integration tests
│
└─ F.3: Operational Memory (20 pts) ◄── Parallel start with F.2
    ├─ OperationalContext types
    ├─ JSONL store
    ├─ Task assignment
    ├─ Phase progression
    ├─ Heartbeat handler
    ├─ Carryover
    └─ Tests
```

---

## Week 2: Extension + Support

```
Week 2: Capabilities & Polish
═════════════════════════════════════════════════════════════════
│
├─ F.4: Homeostasis Wiring (13 pts) ◄── Depends on F.3
│   ├─ Connect 6 dimensions to operational memory
│   ├─ Phase duration tracking
│   ├─ Communication cooldown
│   └─ Tests
│
├─ F.5: Qdrant Retrieval (19 pts) ◄──── Parallel with F.4
│   ├─ Verify Qdrant running
│   ├─ Hybrid retrieval (vector + payload)
│   ├─ Composite re-ranking
│   ├─ Migrate entries
│   ├─ Hard rules reservation
│   ├─ Fallback logic
│   └─ Load tests (500 entries)
│
├─ F.6: Confabulation Guard (13 pts) ◄─ Parallel with F.5
│   ├─ Entity validation
│   ├─ about.entity checks
│   ├─ Confidence distribution
│   ├─ Type distribution
│   ├─ Pipeline integration
│   └─ Tests
│
├─ F.7: Token Budget (11 pts) ◄────── Parallel with F.6
│   ├─ Upgrade to 12K
│   ├─ Per-section accounting
│   ├─ Truncation priority
│   ├─ Overage logging
│   └─ Tests
│
└─ F.8: Safety Design (14 pts) ◄────── Parallel with F.7
    ├─ 4-layer model documentation
    ├─ Layer 0: LLM guardrails
    ├─ Layer 0.5: Ollama guardrail model
    ├─ Layer 1: Homeostasis self_preservation
    ├─ Layer 2: Hard guardrails
    ├─ Trust matrix
    ├─ Tool risk metadata
    └─ PM approval
```

---

## Dependency Matrix (What Blocks What)

```
       F.1  F.2  F.3  F.4  F.5  F.6  F.7  F.8
F.1    —    🔴  🔴  ⚫  ⚫  ⚫  ⚫  ⚫
F.2    ✅   —   🟡  ⚫  ⚫  ⚫  ⚫  ⚫
F.3    ✅  ✅   —   🔴  ⚫  ⚫  ⚫  ⚫
F.4    ✅  ✅  ✅   —   🟡  🟡  🟡  🟡
F.5    ✅  ✅   ⚫   🟡   —   🟡  🟡  🟡
F.6    ✅  ✅   ⚫   🟡   🟡   —   🟡  🟡
F.7    ✅  ✅   ⚫   🟡   🟡   🟡   —   🟡
F.8    ✅  ✅   ⚫   🟡   🟡   🟡   🟡   —

Legend:
  —   = No dependency (independent)
 🔴  = Hard blocker (cannot start until done)
 🟡  = Soft dependency (can start in parallel, needs input later)
 ⚫  = Not dependent (info only)
 ✅  = From completed phase
```

---

## Parallel Work Streams

### Stream 1: Message Routing (Weeks 1-2)
```
F.1 (16 pts)
    ↓
F.2 (24 pts)
    ↓
Tests: Discord ↔ Tick ↔ Discord ✅
```

**Owner**: Backend lead
**Risk**: Low (no dependencies)
**Validation**: Manual Discord round-trip test

---

### Stream 2: Task State (Weeks 1-2)
```
F.3 (20 pts)
    ↓
Heartbeat tick handler
    ↓
Tests: In-progress work continues ✅
```

**Owner**: Backend ops
**Risk**: Medium (depends on agent loop timing)
**Validation**: Kill server → restart → task resumes

---

### Stream 3: Smarter Homeostasis (Week 2)
```
F.3 + F.4 (13 pts)
    ↓
Phase duration detection
    ↓
Communication cooldown
    ↓
Tests: Dimensions read operational context ✅
```

**Owner**: Backend brain
**Risk**: Low (local to homeostasis engine)
**Validation**: Unit tests + scenario replay

---

### Stream 4: Better Retrieval (Week 2)
```
F.5 (19 pts)
    ↓
Qdrant hybrid search
    ↓
Fallback to keyword
    ↓
Tests: 500 entries, <500ms latency ✅
```

**Owner**: Backend search
**Risk**: Medium (Qdrant operational complexity)
**Validation**: Load test + fallback scenario

---

### Stream 5: Quality Gates (Week 2)
```
F.6 (13 pts)      F.7 (11 pts)      F.8 (14 pts)
    ↓                  ↓                  ↓
Guard              Budget             Safety Model
    ↓                  ↓                  ↓
Tests           Tests & Logs         PM Approval ✅
```

**Owner**: Backend quality + PM
**Risk**: Low (mostly independent)
**Validation**: Unit tests + manual spot checks

---

## Start Order (Recommended)

### Day 1-2 (Monday-Tuesday)
1. **F.1 starts immediately** (doesn't depend on anything)
   - Split work: types (1 person), Discord adapter (2 people), tests (1 person)
   - Merge by EOD Tuesday

### Day 2-3 (Tuesday-Wednesday)
2. **F.2 starts immediately after F.1 merges** (hard blocker only on channel types)
   - Inner loop (2 people), tools (1 person), tests (1 person)
   - Parallel: Start F.3 task state (doesn't need F.2 done)

### Day 3-5 (Wednesday-Friday)
3. **F.3 finishes** (heartbeat + carryover)
   - Can start before F.2 is done, but tests need both F.1 + F.2
   - Merge F.3 by Friday

### Week 2 (Monday-Friday)
4. **F.4-F.8 in parallel** (all depend only on F.3 being done)
   - F.4: Homeostasis wiring (1 person)
   - F.5: Qdrant retrieval (1 person)
   - F.6: Confabulation guard (1 person)
   - F.7: Token budget (1 person)
   - F.8: Safety design (1 person)
   - Merge throughout week, final approval Friday

---

## Merging Strategy

### PR Order (Strict)
1. F.1 → main (foundation for all others)
2. F.2 → main (runtime core, depends on F.1)
3. F.3 → main (operational memory, used by F.4)
4. F.4 → main (homeostasis, depends on F.3)
5. F.5 → main (retrieval, independent)
6. F.6 → main (guard, independent)
7. F.7 → main (budget, independent)
8. F.8 → main (design doc, independent)

### Testing Before Each Merge
```
pnpm test              # All tests green?
pnpm lint              # Style OK?
pnpm type-check        # No type errors?
manual-test <feature>  # Feature-specific validation?
```

### No Half-Merges
- ❌ Do NOT merge F.2 without F.1
- ❌ Do NOT merge F.3 tests without F.1 + F.2
- ❌ Do NOT merge F.4+ before F.3

---

## Stage Gates (Definition of Done)

### Before PR
- [ ] Code complete (no stubs)
- [ ] Tests passing locally
- [ ] No regressions to Phase E tests

### During Review
- [ ] 1 peer review (preferably domain expert)
- [ ] Feedback addressed
- [ ] Architecture decisions documented (if new)

### Before Merge
- [ ] All CI checks green
- [ ] Acceptance criteria met
- [ ] Manual validation done (for user-facing features)

### After Merge
- [ ] ARCHITECTURE.md Implementation Status updated
- [ ] CLAUDE.md notes updated (if strategic decision)
- [ ] Next dependent task unblocked

---

## Risk Handoff Points

| Handoff | Risk | Mitigation |
|---------|------|-----------|
| F.1 → F.2 | Channel types not right | F.2 dev reviews F.1 PR before merge; pair if concerns |
| F.2 → F.3 | Agent loop scope creep | Timebox F.2 to 3 days max; move extras to F.5 |
| F.3 → F.4 | Operational memory unstable | F.3 tests must include restart scenario; kill-server test mandatory |
| F.4 → F.5 | Homeostasis too noisy | Threshold tuning deferred to Phase E retrospective |
| F.5 → F.6 | Qdrant not ready | Fallback to keyword always works; no blocker |
| F.7 → F.8 | Budget accounting overhead | Only log if debug flag set; no perf impact to ticks |
| F.8 → Phase G | Safety design insufficient | PM approval gate before G.1 starts |

---

## Escape Hatches (If Things Break)

### If F.1 is Blocked
→ Stick with current PendingMessage for F.2; refactor later
→ Extends F.1, adds tech debt, but unblocks team

### If F.2 Inner Loop Too Complex
→ Ship simpler version: max 2 tool calls, no budget tracking
→ Add advanced features in Phase G

### If F.3 Operational Memory Crashes
→ Use in-memory TaskState; don't persist to JSONL
→ Add persistence in F.4 after stabilizing

### If F.5 Qdrant Struggles
→ Keep disabled; keyword retrieval is fallback
→ Revisit in Phase H when multi-agent needs scaling

### If F.8 Safety Design Stalled
→ Use simplified 3-layer model (Layer 0 + Layer 1 + Layer 2)
→ Defer Layer 0.5 (guardrail model) to Phase G

---

## Capacity Planning

### Team Composition (Assumed)
- 2 backend developers (agent loop + memory + retrieval)
- 1 test developer (integration tests + scenario validation)
- 1 infra/ops (Qdrant, deployment)
- 1 PM (safety review, decisions)

### Allocation by Week
| Role | Week 1 | Week 2 |
|------|--------|--------|
| Backend Dev 1 | F.1 + F.2 (40 hrs) | F.4 + F.5 (40 hrs) |
| Backend Dev 2 | F.2 + F.3 (40 hrs) | F.3 finish + F.6 (40 hrs) |
| Test Dev | F.1 + F.2 + F.3 tests (35 hrs) | F.4-F.8 tests (35 hrs) |
| Infra | F.5 prep (5 hrs) | F.5 validation (5 hrs) |
| PM | Safety review prep (5 hrs) | F.8 approval (5 hrs) |

**Total**: ~330 person-hours / week (feasible with 5 people)

---

## Definition: "Phase F Complete"

✅ All 8 deliverables (F.1-F.8) merged to main
✅ Phase E tests still passing (163/163)
✅ E2E integration test: Discord message → tick → Discord response
✅ Heartbeat test: In-progress task continues without new inbound message
✅ Operational memory test: Server restart, task resumes
✅ Safety model document approved by PM + tech lead
✅ ARCHITECTURE.md Implementation Status updated for Phase F
✅ No known bugs in critical path (F.1-F.3)

---

## Handoff to Sprint 13

**If all 8 tasks complete on time**:
- Phase F ready for production
- Start Phase G immediately (CodingToolAdapter design + G.1 implementation)

**If 1-2 tasks slip**:
- Carry slip tasks to Sprint 13 start
- Still begin Phase G design in parallel (no blocker on full F completion)

**If critical path (F.1-F.3) slips**:
- Extend Sprint 12 scope
- F.4-F.8 defer to Sprint 13
- DO NOT merge partial work to main

---

## Checklist: Ready to Go?

- [ ] Phase E tests green (163/163)
- [ ] Sprint backlog written (this document)
- [ ] Task checklist printed (task-checklist.md)
- [ ] Team capacity assigned (5 people, 40h/week)
- [ ] Qdrant health verified (F.5 can check on Day 1)
- [ ] Safety model PM review scheduled (F.8 end-of-week gate)
- [ ] Slack channel created for sprint coordination
- [ ] Daily standup scheduled (15 min, 10am)
- [ ] Friday sprint review scheduled (1h)

---

*Created: 2026-03-14*
*Purpose*: Dependency awareness, risk mitigation, critical path clarity
*Update*: Refresh daily with blockers/risks in Slack channel
