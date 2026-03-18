# Sprint 12 Quick Reference Card

**Sprint**: 12 (Phase F Part 1: Agent Runtime Foundation)
**Duration**: 1 week (Mon 2026-03-14 — Fri 2026-03-21)
**Total Capacity**: 130 story points (49 pts Week 1, 81 pts Week 2)
**Status**: 🚀 Ready to start

---

## 📋 8 Deliverables at a Glance

| # | Deliverable | Pts | Week | Priority | Blocks |
|---|------------|-----|------|----------|--------|
| **F.1** | Channel Message Abstraction | 16 | 1 | 🔴 CRITICAL | F.2, F.3 |
| **F.2** | Agent Loop v2 + Tool Scaffolding | 24 | 1 | 🔴 CRITICAL | F.3 |
| **F.3** | Operational Memory (State Persistence) | 20 | 1-2 | 🔴 CRITICAL | F.4 |
| **F.4** | Homeostasis ↔ Operational Memory | 13 | 2 | 🟡 HIGH | — |
| **F.5** | Qdrant Retrieval (Hybrid Vector Search) | 19 | 2 | 🟡 HIGH | — |
| **F.6** | Confabulation Guard (Hallucination Validation) | 13 | 2 | 🟠 MEDIUM | — |
| **F.7** | Token Budget Upgrade (4K → 12K) | 11 | 2 | 🟠 MEDIUM | — |
| **F.8** | Safety Model Design (4-layer architecture) | 14 | 2 | 🟠 MEDIUM | Phase G |

---

## 🎯 What Each Deliverable Does

### F.1: Channel Message Abstraction
**Why**: Unified message routing for Discord, Dashboard, GitLab, internal
**Outcome**: ChannelMessage type + 3 adapters + dispatcher

### F.2: Agent Loop v2
**Why**: Replace broken single-call tick with ReAct loop for multi-step work
**Outcome**: Inner loop + tool registry + safety scaffold + budget accounting

### F.3: Operational Memory
**Why**: Tasks persist across ticks; work continues without new messages
**Outcome**: TaskState + JSONL storage + heartbeat tick handler

### F.4: Homeostasis Wiring
**Why**: Dimensions adapt based on task phase, duration, communication patterns
**Outcome**: 6 dimensions (sufficiency, alignment, momentum, health, engagement, application) react to operational context

### F.5: Qdrant Retrieval
**Why**: Vector search scales to 500+ entries; hybrid vector + keyword fallback
**Outcome**: Hybrid retrieval + re-ranking + hard rules reservation + fallback

### F.6: Confabulation Guard
**Why**: Catch LLM hallucinations before they enter knowledge store
**Outcome**: 4 validation heuristics + pipeline integration

### F.7: Token Budget
**Why**: 4K too tight; 12K allows all context sections
**Outcome**: Budget upgrade + per-section accounting + truncation priority

### F.8: Safety Model
**Why**: Design 4-layer safety before Phase G tool execution
**Outcome**: Architecture doc (Layer 0/0.5/1/2) + trust matrix + hook definitions + team approval

---

## 🔥 Critical Path (Week 1)

```
Monday:   Start F.1 + F.2 (in parallel, F.2 after F.1.2 ready)
          Also start F.3 early work (types + store)

Tuesday:  F.1 integration tests
          F.2 inner loop + tools
          F.3 task assignment + phase progression

Wednesday: F.1 merge + review
          F.2 tests + integration
          F.3 tests

Thursday: F.2 merge + review
          F.3 merge + review
          Week 1 buffer for any blockers

Friday:   Week 1 complete: F.1, F.2, F.3 (partial) merged
          Plan Week 2
```

## 📊 Success Metrics

By Friday EOD:
- ✅ Phase E tests still 163/163 green
- ✅ F.1, F.2, F.3.1-F.3.4 merged
- ✅ Discord round-trip works manually
- ✅ Agent loop iteration works with stub tools
- ✅ Operational memory persists

By end of Sprint (next Friday):
- ✅ All F.1-F.8 merged
- ✅ Phase E still green
- ✅ E2E demo: Discord → tick → Discord
- ✅ Heartbeat advances in-progress work
- ✅ Safety model approved by PM

---

## 🚨 High-Risk Items

| Risk | Mitigation | Owner |
|------|-----------|-------|
| F.1 blocks everything | Start immediately; pair if stuck | backend |
| F.2 inner loop too slow | Budget controls (10 steps, 60s) | backend |
| Phase E tests regress | Run daily; no breaking changes | QA |
| Qdrant operational complexity | Already running; fallback ready | infra |
| Safety design delays G | Time-box to 3 days; decision gate | PM |

---

## ✅ Daily Checklist

```
EOD Every Day:
☐ pnpm test                    → 163/163 Phase E tests green
☐ git status                   → no uncommitted work
☐ Standup notes                → blockers, progress, next day plan
☐ Code review                  → peer reviewed new work
```

---

## 🎬 Key Commands

```bash
# Run all Phase E tests (must stay green)
pnpm test

# Run specific component tests
pnpm test channel              # F.1 validation
pnpm test agent-loop           # F.2 validation
pnpm test operational-memory   # F.3 validation
pnpm test homeostasis-wiring   # F.4 validation
pnpm test qdrant               # F.5 validation
pnpm test confabulation        # F.6 validation
pnpm test token                # F.7 validation

# Watch mode for development
pnpm test:watch server/__tests__/channel-abstraction.test.ts

# Commit (conventional commits)
git add -A
git commit -m "feat(f1): implement ChannelMessage type"
git push origin feature/f1-channel-abstraction
```

---

## 📚 Key Files

- **Detailed Plan**: `docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md`
- **GitLab Task Template**: `docs/plans/2026-03-14-sprint-12-gitlab-tasks.md`
- **Full Checklist**: `SPRINT_12_CHECKLIST.md` (this repo)
- **Architecture Reference**: `docs/ARCHITECTURE.md` (Layers 1-5)

---

## 🏁 Rollover Rules

If something slips:
- **DO**: Carry to Sprint 13
- **DON'T**: Merge half-finished work
- **DO**: Re-estimate remaining tasks
- **DON'T**: Skip Phase E tests

---

## 🎉 Success looks like:

By end of Sprint 12:
- Agent processes multi-step tasks (F.2 agent loop)
- Tasks resume across server restarts (F.3 operational memory)
- Messages route through unified channels (F.1 abstraction)
- Homeostasis guides behavior based on context (F.4 wiring)
- Better retrieval at scale (F.5 Qdrant)
- Clean knowledge store (F.6 confabulation guard)
- Transparent context usage (F.7 token budget)
- Safety designed (F.8 model approved)

**Ready to execute?** Print this, share with team, start with F.1! 🚀

---

*Created: 2026-03-14*
*For: Sprint 12 Team*
*Status: Ready to execute*
