# Phase 3: Quick Reference

**Status**: Ready to implement
**Full Plan**: [2026-02-06-phase3-implementation-plan.md](./2026-02-06-phase3-implementation-plan.md)

---

## What We're Building

Transform Galatea from **memory-enhanced LLM** → **homeostasis-driven agent** with emergent behavior.

### Two Core Systems

**1. Homeostasis Engine** (6 dimensions)
```
knowledge_sufficiency   → "Do I know enough?"
certainty_alignment     → "Does confidence match action?"
progress_momentum       → "Am I moving forward?"
communication_health    → "Am I connected?"
productive_engagement   → "Am I contributing?"
knowledge_application   → "Learning vs doing?"
```

**2. Activity Router** (4 levels)
```
Level 0: Direct      → No LLM (git status, templates)
Level 1: Pattern     → Haiku (follow procedure)
Level 2: Reason      → Sonnet (implement, review)
Level 3: Reflect     → Sonnet + Reflexion loop (unknown, high-stakes)
```

---

## Implementation Timeline

### Week 1: Core Engine (Days 1-7)
- ✅ **Stage A**: Homeostasis Engine (18h)
- ✅ **Stage B**: Activity Router (16h)
- ✅ **Stage C**: Reflexion Loop (14h)
- ✅ **Stage D**: Cognitive Models Integration (10h)

**Milestone**: Core components working in isolation

### Week 2: Integration + Testing (Days 7-12)
- ✅ **Stage E**: End-to-End Integration (16h)
- ✅ **Stage F**: UI Visualization (11h)
- ✅ **Stage G**: Reference Scenario Testing (10h)
- ✅ **Stage H**: Documentation (7h)

**Milestone**: Phase 3 COMPLETE

**Total**: 102 hours (~2 weeks)

---

## Key Architectural Changes

### Before Phase 3 (Current State)
```
User Message
     │
     ▼
Context Assembly (preprompts + Graphiti)
     │
     ▼
LLM (configured model)
     │
     ▼
Response
```

### After Phase 3 (Target State)
```
User Message
     │
     ▼
Activity Router
├─ Level 0 (Direct)     → Execute, no LLM
├─ Level 1 (Pattern)    → Haiku + procedure
├─ Level 2 (Reason)     → Sonnet + full context + homeostasis
└─ Level 3 (Reflect)    → Sonnet + Reflexion loop
     │
     ▼
Context Assembly (+ cognitive models + homeostasis guidance)
     │
     ▼
LLM (selected model)
     │
     ▼
Response (with homeostasis awareness)
```

---

## New Files Created

```
server/engine/                     # NEW: Core agent logic
├── homeostasis-engine.ts          # 6-dimension assessment
├── activity-router.ts             # Level 0-3 classification
├── reflexion-loop.ts              # Draft → Critique → Revise
├── classification-helpers.ts
├── evidence-gatherer.ts
├── guidance.yaml                  # Guidance text
├── types.ts
└── __tests__/ (3 test files)

config/
└── models.yaml                    # Model specs (haiku/sonnet/opus)

app/components/homeostasis/        # NEW: UI
├── HomeostasisPanel.tsx
└── DimensionIndicator.tsx

app/components/chat/
└── ActivityLevelBadge.tsx

tests/scenarios/                   # NEW: Reference tests
└── trace*.test.ts (5 files)
```

**Total**: ~1500 lines of new code

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Homeostasis accuracy | >85% |
| Activity routing accuracy | >80% |
| Level 0-1 activities | >60% |
| Cost reduction | >50% |
| Test coverage | >90% |

**If all met → Emergent behavior proven!**

---

## What This Unlocks

### Intelligent Decision-Making
- Agent **asks** when uncertain (not guesses)
- Agent **proceeds** when confident (not over-asks)
- Agent **escalates** when stuck (not spins)
- Agent **applies** knowledge (not endless research)

### Cost Optimization
- 60%+ activities use no LLM or cheap Haiku
- Only complex tasks use expensive Sonnet
- Reflexion loop reserved for truly hard problems
- Projected: **50%+ cost reduction**

### Emergent Behavior
- Novel situations handled via homeostasis balance-seeking
- No hardcoded rules for every case
- Psychological grounding (Self-Determination Theory, Goal Theory)
- **Thesis validation**: Psychology + LLM > Plain LLM

---

## Phase Dependencies

**Phase 3 depends on:**
- ✅ Phase 2 (Memory System) — COMPLETE

**Phase 4+ depends on Phase 3:**
- **Phase 4**: Observation Pipeline → Activity levels tracked in observations
- **Phase 5**: MCP Tools → Tool calls classified as Level 0
- **Phase 6**: Learning → Homeostasis patterns promote to procedures

---

## Quick Start (When Ready)

1. Read full plan: [2026-02-06-phase3-implementation-plan.md](./2026-02-06-phase3-implementation-plan.md)
2. Start with **Stage A** (Homeostasis Engine)
3. Follow stages A→B→C→D→E→F→G→H in order
4. Each stage has clear deliverables and tests
5. Run reference scenarios at end (Stage G)

**Ready to start building!**

---

*Summary created: 2026-02-06*
*Full details: 2026-02-06-phase3-implementation-plan.md*
