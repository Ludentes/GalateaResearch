# Phase 3: Homeostasis Engine + Activity Router — Implementation Plan

**Date**: 2026-02-06
**Status**: Ready to Start
**Duration**: 2 weeks (estimated)
**Prerequisites**: Phase 2 COMPLETE ✅

---

## Executive Summary

Phase 3 implements the **psychological core** of Galatea: the Homeostasis Engine (6-dimension balance-seeking) and Activity Router (Level 0-3 task classification). This phase transforms Galatea from a memory-enhanced LLM into an agent with **emergent behavior** driven by homeostatic balance.

**Key Deliverables:**
1. HomeostasisEngine class with 6-dimension assessment
2. ActivityRouter class with Level 0-3 classification
3. Model selection logic (none/Haiku/Sonnet)
4. Reflexion loop for Level 3 tasks
5. Cognitive models integration (self + user awareness)
6. UI visualization for homeostasis state and activity level
7. Integration tests with reference scenarios

**Success Criteria:**
- Agent asks when knowledge_sufficiency LOW (>85% accuracy)
- Agent proceeds when certainty_alignment HEALTHY (>85% accuracy)
- Activity routing reduces cost by >50% vs always-Sonnet
- Level 0-1 activities account for >60% of operations
- Cognitive models appear in assembled context

---

## Phase 2 Handoff Status

### What We Have (Phase 2)
✅ Graphiti + FalkorDB memory system operational
✅ Context assembly pipeline (6 steps, <100ms)
✅ Gatekeeper filtering (pattern-based, zero cost)
✅ Memory Browser UI
✅ Cognitive models infrastructure (`getSelfModel`, `getUserModel`, `updateSelfModel`, `updateUserModel`)
✅ 102/104 tests passing

### What's Missing (Phase 3 Scope)
❌ Homeostasis assessment (dimensions not measured)
❌ Activity-level routing (all tasks use same pipeline)
❌ Cognitive models not integrated into context assembly
❌ Model selection (currently always uses configured default)
❌ Reflexion loop (no Level 3 deep reasoning)
❌ Homeostasis guidance not in prompts

### Integration Points
| Phase 2 Component | Phase 3 Uses It For |
|-------------------|---------------------|
| `context-assembler.ts` | Add homeostasis state + cognitive models sections |
| `graphiti-client.ts` | Store homeostasis states as episodes for learning |
| `cognitive-models.ts` | Call `getSelfModel()` and `getUserModel()` in context assembly |
| `chat.logic.ts` | Route through ActivityRouter before context assembly |

---

## Architecture Overview

### Updated Flow (Phase 3)

```
User Message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  ACTIVITY ROUTER (NEW)                                      │
│  1. Quick classification (no LLM, <1ms)                    │
│  2. Determine: level (0-3), model (none/haiku/sonnet)      │
│  3. Decide: skip memory? skip homeostasis?                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        │             │             │             │
        ▼             ▼             ▼             ▼
    Level 0       Level 1       Level 2       Level 3
   (Direct)      (Pattern)     (Reason)     (Reflect)
   No LLM        Haiku         Sonnet       Reflexion
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  CONTEXT ASSEMBLY (ENHANCED)                                │
│  1. Retrieve preprompts (hard rules + procedures)          │
│  2. Retrieve cognitive models (self + user)                │
│  3. Assess homeostasis (6 dimensions)                      │
│  4. Search Graphiti                                         │
│  5. Assemble prompt with homeostasis guidance              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM GENERATION                                             │
│  Model: Selected by Activity Router                         │
│  Prompt: Enriched with homeostasis + cognitive models       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
                  Response
```

---

## Implementation Stages

### Stage A: Homeostasis Engine (Days 1-3)

**Objective**: Implement 6-dimension assessment and guidance system.

#### Tasks

**A1. Create HomeostasisEngine class** (~4 hours)
- File: `server/engine/homeostasis-engine.ts`
- Core class with 6 dimensions defined
- Type definitions for states, assessments, guidance

**A2. Implement computed assessments** (~3 hours)
- `assessCommunicationHealth`: Time since last message
- `assessProgressMomentum`: Time on current task, action count
- `assessProductiveEngagement`: Task assignment status

**A3. Implement LLM-based assessments** (~4 hours)
- `assessKnowledgeSufficiency`: LLM evaluates retrieved memories vs task
- `assessCertaintyAlignment`: LLM evaluates confidence vs action stakes
- `assessKnowledgeApplication`: LLM evaluates research time vs building time

**A4. Implement guidance lookup** (~3 hours)
- `getGuidance(states)`: Returns guidance text for imbalanced dimensions
- Guidance text stored in structured format (YAML or JSON)
- Prioritization when multiple dimensions imbalanced

**A5. Unit tests** (~4 hours)
- Test computed assessments with mock data
- Test LLM assessments with mocked LLM calls
- Test guidance lookup for all dimension combinations
- Test edge cases (all HEALTHY, all LOW, mixed states)

**Deliverable**: HomeostasisEngine working in isolation

**Files Created/Modified**:
```
server/engine/
├── homeostasis-engine.ts          # Core engine
├── types.ts                       # HomeostasisState, Assessment, Guidance types
├── guidance.yaml                  # Guidance text for all states
└── __tests__/
    └── homeostasis-engine.unit.test.ts
```

**API Surface**:
```typescript
class HomeostasisEngine {
  // Assess all 6 dimensions
  async assessAll(context: AgentContext): Promise<HomeostasisState>

  // Assess single dimension
  async assessDimension(dimension: Dimension, context: AgentContext): Promise<State>

  // Get guidance for imbalanced state
  getGuidance(state: HomeostasisState): GuidanceText

  // Quick check (computed only, for Level 1)
  assessQuick(context: AgentContext): Partial<HomeostasisState>
}

interface HomeostasisState {
  knowledge_sufficiency: 'LOW' | 'HEALTHY' | 'HIGH'
  certainty_alignment: 'LOW' | 'HEALTHY' | 'HIGH'
  progress_momentum: 'LOW' | 'HEALTHY' | 'HIGH'
  communication_health: 'LOW' | 'HEALTHY' | 'HIGH'
  productive_engagement: 'LOW' | 'HEALTHY' | 'HIGH'
  knowledge_application: 'LOW' | 'HEALTHY' | 'HIGH'
  assessed_at: Date
  assessment_method: Record<Dimension, 'computed' | 'llm'>
}

interface GuidanceText {
  primary: string       // Most important guidance
  secondary?: string    // Additional considerations
  dimensions: Dimension[]  // Which dimensions triggered this
}
```

---

### Stage B: Activity Router (Days 3-5)

**Objective**: Implement Level 0-3 classification and model selection.

#### Tasks

**B1. Create ActivityRouter class** (~3 hours)
- File: `server/engine/activity-router.ts`
- Classification logic (no LLM, pattern-based)
- Model selection logic
- Integration with HomeostasisEngine

**B2. Implement classification helpers** (~3 hours)
- `isDirectToolCall(task)`: MCP tool detection
- `isTemplateMessage(task)`: Pattern matching for templates
- `isIrreversibleAction(task)`: Destructive action detection
- `hasProcedureMatch(task)`: Check if procedure exists with high success rate

**B3. Implement classification logic** (~4 hours)
- `classifyActivity(task, procedure, homeostasis)`: Main classification
- Level 0: Direct actions (tool calls, templates)
- Level 1: Procedure match with high success rate
- Level 2: Default reasoning tasks
- Level 3: Knowledge gaps, high stakes, irreversible actions

**B4. Implement model selection** (~2 hours)
- Model config: `config/models.yaml`
- `selectModel(level)`: Maps level to model (none/haiku/sonnet)
- Support for provider override (ollama/openrouter/claude-code)

**B5. Unit tests** (~4 hours)
- Test all classification paths
- Test model selection for each level
- Test edge cases (missing procedure, conflicting signals)

**Deliverable**: ActivityRouter working in isolation

**Files Created/Modified**:
```
server/engine/
├── activity-router.ts             # Core router
├── classification-helpers.ts      # isDirectToolCall, etc.
├── types.ts                       # ActivityClassification, ModelSpec types
└── __tests__/
    └── activity-router.unit.test.ts

config/
└── models.yaml                    # Model specifications
```

**API Surface**:
```typescript
class ActivityRouter {
  // Main classification method
  async classify(
    task: Task,
    procedure: Procedure | null,
    homeostasis: HomeostasisState | null
  ): Promise<ActivityClassification>

  // Get model for level
  selectModel(level: 0 | 1 | 2 | 3): ModelSpec
}

interface ActivityClassification {
  level: 0 | 1 | 2 | 3
  reason: string
  model: 'none' | 'haiku' | 'sonnet'
  skipMemory: boolean
  skipHomeostasis: boolean
}

interface ModelSpec {
  id: string
  provider: string
  model_id: string
  characteristics: string[]
  suitable_for: number[]
  cost_per_1k_tokens: number
}
```

---

### Stage C: Reflexion Loop (Days 5-6)

**Objective**: Implement Level 3 deep reasoning with Draft → Critique → Revise loop.

#### Tasks

**C1. Create ReflexionLoop class** (~4 hours)
- File: `server/engine/reflexion-loop.ts`
- Draft generation
- Evidence gathering
- Critique generation
- Revision with evidence

**C2. Implement loop logic** (~4 hours)
- `executeReflexion(task, context, maxIterations)`: Main loop
- Exit conditions: critique passes OR max iterations reached
- Trace storage for debugging

**C3. Evidence gathering** (~3 hours)
- Memory search for related facts
- Codebase search (if relevant)
- Documentation search (if relevant)
- Structured evidence format

**C4. Unit tests** (~3 hours)
- Test loop with mocked LLM calls
- Test early exit (critique passes on iteration 1)
- Test max iterations (critique never passes)
- Test evidence gathering

**Deliverable**: Reflexion loop working for Level 3 tasks

**Files Created/Modified**:
```
server/engine/
├── reflexion-loop.ts              # Reflexion implementation
├── evidence-gatherer.ts           # Evidence search logic
├── types.ts                       # Draft, Critique, Evidence types
└── __tests__/
    └── reflexion-loop.unit.test.ts
```

**API Surface**:
```typescript
class ReflexionLoop {
  async execute(
    task: Task,
    context: AgentContext,
    maxIterations: number = 3
  ): Promise<ReflexionResult>
}

interface ReflexionResult {
  final_draft: string
  iterations: ReflexionIteration[]
  total_llm_calls: number
  success: boolean
}

interface ReflexionIteration {
  draft: string
  evidence: Evidence[]
  critique: Critique
  revised: boolean
}

interface Critique {
  issues: Issue[]
  confidence: number
  passes: boolean
}

interface Issue {
  type: 'missing' | 'unsupported' | 'incorrect'
  description: string
  suggested_fix?: string
}
```

---

### Stage D: Cognitive Models Integration (Days 6-7)

**Objective**: Integrate self-model and user-model into context assembly.

#### Tasks

**D1. Enhance context-assembler.ts** (~3 hours)
- Add `getSelfModel(personaId)` call
- Add `getUserModel(userName)` call
- Add SELF-AWARENESS section (priority 4) to assembled prompt
- Add USER CONTEXT section (priority 5) to assembled prompt

**D2. Self-model prompt formatting** (~2 hours)
- Format strengths, weaknesses, recent misses
- Token budget allocation for self-awareness section
- Graceful degradation if self-model empty

**D3. User-model prompt formatting** (~2 hours)
- Format preferences, expectations, communication style
- Token budget allocation for user context section
- Graceful degradation if user-model empty

**D4. Integration tests** (~3 hours)
- Test context assembly with cognitive models
- Test token budget allocation
- Test graceful degradation
- Test cognitive models in live chat flow

**Deliverable**: Cognitive models appear in assembled context

**Files Modified**:
```
server/memory/
├── context-assembler.ts           # Enhanced with cognitive models
├── types.ts                       # Updated PromptSection, AssembledContext
└── __tests__/
    └── context-assembler.unit.test.ts  # Updated tests
```

**Updated API**:
```typescript
interface AssembledContext {
  systemPrompt: string
  sections: PromptSection[]
  metadata: {
    // Existing fields...
    self_model_tokens?: number
    user_model_tokens?: number
  }
}

interface PromptSection {
  priority: number
  name: string
  content: string
  tokens: number
}

// Priority order:
// 1. CONSTRAINTS (hard rules)
// 2. PROCEDURES (preprompts with priority > 10)
// 3. KNOWLEDGE (Graphiti facts)
// 4. SELF-AWARENESS (self model) -- NEW
// 5. USER CONTEXT (user model) -- NEW
// 6. HOMEOSTASIS GUIDANCE (dimension guidance) -- NEW
```

---

### Stage E: End-to-End Integration (Days 7-9)

**Objective**: Wire everything together in the chat flow.

#### Tasks

**E1. Update chat.logic.ts** (~4 hours)
- Add ActivityRouter call before context assembly
- Route Level 0 activities (direct execution, no LLM)
- Route Level 1 activities (Haiku, quick context)
- Route Level 2 activities (Sonnet, full context + homeostasis)
- Route Level 3 activities (Sonnet + Reflexion loop)

**E2. Homeostasis state storage** (~2 hours)
- Store homeostasis state as episode metadata
- Enable homeostasis state retrieval for trending analysis
- Add to PostgreSQL if needed (optional: can be ephemeral)

**E3. Activity level tracking** (~2 hours)
- Store activity level + model used in episode metadata
- Enable analytics: distribution of levels, cost per level
- Add to PostgreSQL if needed (optional: can be ephemeral)

**E4. Error handling** (~3 hours)
- Graceful degradation: if ActivityRouter fails, default to Level 2
- Graceful degradation: if HomeostasisEngine fails, skip assessment
- Graceful degradation: if Reflexion fails, fall back to single pass
- Comprehensive error logging

**E5. Integration tests** (~5 hours)
- Test all 4 levels in live chat flow
- Test homeostasis assessment triggers
- Test cognitive models in prompts
- Test error handling paths

**Deliverable**: Fully integrated Phase 3 system

**Files Modified**:
```
server/functions/
├── chat.logic.ts                  # ActivityRouter + HomeostasisEngine integration
└── __tests__/
    └── chat.logic.integration.test.ts

server/memory/
├── graphiti-client.ts             # Store homeostasis + activity metadata
└── types.ts                       # Updated Episode types
```

---

### Stage F: UI Visualization (Days 9-10)

**Objective**: Add homeostasis state and activity level to UI.

#### Tasks

**F1. Homeostasis Panel** (~4 hours)
- Component: `app/components/homeostasis/HomeostasisPanel.tsx`
- Display 6 dimensions with visual indicators (LOW/HEALTHY/HIGH)
- Color coding: RED (LOW), GREEN (HEALTHY), YELLOW (HIGH)
- Show guidance text for imbalanced dimensions

**F2. Activity Level Indicator** (~2 hours)
- Component: `app/components/chat/ActivityLevelBadge.tsx`
- Badge on each message showing level (0-3) + model used
- Tooltip with reason for classification

**F3. API endpoints** (~2 hours)
- `GET /api/homeostasis/:sessionId/current`: Current homeostasis state
- `GET /api/activity/:messageId`: Activity classification for message

**F4. Styling + UX** (~3 hours)
- Match existing design system
- Responsive layout
- Accessibility (ARIA labels, keyboard nav)

**Deliverable**: Homeostasis and activity visible in UI

**Files Created/Modified**:
```
app/components/
├── homeostasis/
│   ├── HomeostasisPanel.tsx       # 6-dimension visualization
│   └── DimensionIndicator.tsx     # Individual dimension display
├── chat/
│   └── ActivityLevelBadge.tsx     # Level + model badge
└── ui/
    └── badge.tsx                  # shadcn badge (if not exists)

server/routes/api/
├── homeostasis/
│   └── current.get.ts             # GET /api/homeostasis/:sessionId/current
└── activity/
    └── [messageId].get.ts         # GET /api/activity/:messageId

app/routes/
└── chat/$sessionId.tsx            # Add HomeostasisPanel to layout
```

---

### Stage G: Reference Scenario Testing (Days 10-11)

**Objective**: Validate against reference scenarios from `REFERENCE_SCENARIOS.md`.

#### Test Scenarios

**G1. Trace 2: Galatea Asks Clarifying Question** (~2 hours)
- User tries JWT auth, fails, switches to Clerk
- Homeostasis: `knowledge_sufficiency: LOW`, `certainty_alignment: LOW`
- Expected: Agent asks clarifying question instead of guessing
- Verify: Activity Router escalates to Level 3

**G2. Trace 4: Agent Receives and Executes Task** (~2 hours)
- Agent-1 receives profile screen task
- Memory retrieval: procedure exists
- Homeostasis: `knowledge_sufficiency: HEALTHY`
- Expected: Agent proceeds with Level 2 (or Level 1 if procedure strong)
- Verify: Context includes procedures, no unnecessary questions

**G3. Trace 6: Agent Encounters Unknown Situation** (~2 hours)
- Agent-2 assigned push notifications (not in training)
- Memory retrieval: no procedure
- Homeostasis: `knowledge_sufficiency: VERY LOW`
- Expected: Agent researches briefly, then asks PM
- Verify: Activity Router escalates to Level 3, Reflexion loop runs

**G4. Trace 7: Idle Agent Seeks Work** (~2 hours)
- Agent-1 finishes task, nothing assigned
- Homeostasis: `productive_engagement: LOW`, `communication_health: HEALTHY`
- Expected: Agent asks PM for next task (not spam)
- Verify: Homeostasis guidance includes "Find work" priority order

**G5. Trace 8: Guardrail Catches Over-Research** (~2 hours)
- Agent-2 researching OAuth2 for 2 hours
- Homeostasis: `knowledge_application: HIGH`, `progress_momentum: LOW`
- Expected: Agent surfaces to ask if should proceed or keep researching
- Verify: Homeostasis guidance triggers "Time to apply"

**Deliverable**: All reference scenarios pass with expected homeostasis behavior

**Files Created**:
```
tests/scenarios/
├── trace2-clarifying-question.test.ts
├── trace4-execute-task.test.ts
├── trace6-unknown-situation.test.ts
├── trace7-idle-agent.test.ts
└── trace8-over-research.test.ts
```

---

### Stage H: Documentation (Days 11-12)

**Objective**: Comprehensive documentation for Phase 3.

#### Tasks

**H1. Progress report** (~2 hours)
- File: `docs/plans/2026-02-06-phase3-progress.md`
- Status of all stages
- Deviations from plan
- Test results

**H2. API documentation** (~2 hours)
- File: `docs/api/homeostasis-engine.md`
- File: `docs/api/activity-router.md`
- File: `docs/api/reflexion-loop.md`

**H3. Usage guide** (~2 hours)
- File: `docs/guides/using-homeostasis.md`
- How to interpret homeostasis states
- How to tune thresholds
- How activity routing works

**H4. Update architecture docs** (~1 hour)
- Update `FINAL_MINIMAL_ARCHITECTURE.md`: Phase 3 marked as COMPLETE
- Update `PSYCHOLOGICAL_ARCHITECTURE.md`: Add implementation notes

**Deliverable**: Complete Phase 3 documentation

---

## File Structure (New Files)

```
server/engine/                     # NEW: Core agent logic
├── homeostasis-engine.ts          # 6-dimension assessment + guidance
├── activity-router.ts             # Level 0-3 classification
├── reflexion-loop.ts              # Draft → Critique → Revise
├── classification-helpers.ts      # isDirectToolCall, etc.
├── evidence-gatherer.ts           # Evidence search
├── guidance.yaml                  # Homeostasis guidance text
├── types.ts                       # Engine type definitions
└── __tests__/
    ├── homeostasis-engine.unit.test.ts
    ├── activity-router.unit.test.ts
    └── reflexion-loop.unit.test.ts

config/
└── models.yaml                    # Model specifications (haiku/sonnet/opus)

app/components/homeostasis/        # NEW: UI components
├── HomeostasisPanel.tsx
└── DimensionIndicator.tsx

app/components/chat/
└── ActivityLevelBadge.tsx         # NEW: Activity level badge

server/routes/api/homeostasis/     # NEW: Homeostasis API
└── current.get.ts

server/routes/api/activity/        # NEW: Activity API
└── [messageId].get.ts

tests/scenarios/                   # NEW: Reference scenario tests
├── trace2-clarifying-question.test.ts
├── trace4-execute-task.test.ts
├── trace6-unknown-situation.test.ts
├── trace7-idle-agent.test.ts
└── trace8-over-research.test.ts

docs/api/                          # NEW: API documentation
├── homeostasis-engine.md
├── activity-router.md
└── reflexion-loop.md

docs/guides/                       # NEW: Usage guides
└── using-homeostasis.md
```

---

## Modified Files

```
server/functions/
└── chat.logic.ts                  # Add ActivityRouter + HomeostasisEngine

server/memory/
├── context-assembler.ts           # Add cognitive models + homeostasis guidance
├── graphiti-client.ts             # Store homeostasis + activity metadata
└── types.ts                       # Update Episode, AssembledContext types

app/routes/
└── chat/$sessionId.tsx            # Add HomeostasisPanel to layout

docs/
├── FINAL_MINIMAL_ARCHITECTURE.md  # Mark Phase 3 as COMPLETE
└── PSYCHOLOGICAL_ARCHITECTURE.md  # Add implementation notes
```

---

## Testing Strategy

### Unit Tests (Per Stage)
- **Stage A**: HomeostasisEngine in isolation
- **Stage B**: ActivityRouter in isolation
- **Stage C**: ReflexionLoop in isolation
- **Stage D**: Cognitive models formatting

**Target**: >90% code coverage for new components

### Integration Tests (Stage E)
- **E2E chat flow**: All 4 activity levels
- **Homeostasis assessment**: Trigger scenarios
- **Cognitive models**: Appear in prompts
- **Error handling**: Graceful degradation

**Target**: All critical paths tested

### Reference Scenario Tests (Stage G)
- **Trace 2-8**: Validate against documented scenarios
- **Homeostasis behavior**: Matches expected guidance
- **Activity routing**: Correct level selection

**Target**: 5/5 reference scenarios pass

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Homeostasis accuracy | >85% | Reference scenarios pass rate |
| Activity routing accuracy | >80% | Manual review of 100 messages |
| Level 0-1 activities | >60% | Activity log analysis |
| Cost reduction vs always-Sonnet | >50% | Token usage tracking |
| Context assembly time | <200ms | Performance profiling |
| UI responsiveness | No degradation | Load testing |
| Test coverage | >90% | Vitest coverage report |

---

## Dependencies & Risks

### Dependencies
1. **Phase 2 memory system** — Context assembly must work (✅ DONE)
2. **Multi-provider support** — Need Haiku + Sonnet configured (✅ DONE)
3. **FalkorDB** — Store homeostasis states as episodes (✅ DONE)

### Risks

**Risk 1: Homeostasis assessment reliability**
- **Concern**: LLM self-assessment may be inconsistent
- **Mitigation**: Hybrid approach (computed + LLM), test with scenarios, tune thresholds

**Risk 2: Activity classification accuracy**
- **Concern**: Wrong level selection degrades quality or wastes cost
- **Mitigation**: Pattern-based classification (no LLM), conservative defaults (Level 2), telemetry for tuning

**Risk 3: Reflexion loop efficiency**
- **Concern**: Level 3 tasks may take too long or cost too much
- **Mitigation**: MAX_ITERATIONS = 3, early exit on critique pass, use only for high-stakes tasks

**Risk 4: Context assembly complexity**
- **Concern**: Too many sections → prompt too long
- **Mitigation**: Token budget management, priority-based truncation, graceful degradation

**Risk 5: UI performance**
- **Concern**: Homeostasis polling adds latency
- **Mitigation**: Cached homeostasis state, update only on message send, lazy loading

---

## Effort Estimate

| Stage | Description | Estimated Hours |
|-------|-------------|----------------|
| A | Homeostasis Engine | 18 |
| B | Activity Router | 16 |
| C | Reflexion Loop | 14 |
| D | Cognitive Models Integration | 10 |
| E | End-to-End Integration | 16 |
| F | UI Visualization | 11 |
| G | Reference Scenario Testing | 10 |
| H | Documentation | 7 |
| **Total** | | **102 hours** |

**Timeline**: 2 weeks at 50 hours/week = 100 hours (within estimate)

---

## Implementation Order

### Week 1: Core Engine
- **Day 1-3**: Stage A (Homeostasis Engine)
- **Day 3-5**: Stage B (Activity Router)
- **Day 5-6**: Stage C (Reflexion Loop)
- **Day 6-7**: Stage D (Cognitive Models Integration)

**Milestone**: Core engine components working in isolation

### Week 2: Integration + Testing
- **Day 7-9**: Stage E (End-to-End Integration)
- **Day 9-10**: Stage F (UI Visualization)
- **Day 10-11**: Stage G (Reference Scenario Testing)
- **Day 11-12**: Stage H (Documentation)

**Milestone**: Phase 3 COMPLETE

---

## Phase 3 vs Phase 2 Comparison

| Aspect | Phase 2 | Phase 3 |
|--------|---------|---------|
| **Focus** | Memory (storage + retrieval) | Behavior (decision-making + routing) |
| **Complexity** | Medium (Graphiti integration) | High (homeostasis + routing logic) |
| **Dependencies** | FalkorDB, Voyage AI | Phase 2 memory system |
| **New Code** | ~1000 lines | ~1500 lines |
| **Tests** | 102/104 passing | Target: >90% coverage |
| **Duration** | 3 days (actual) vs 2 weeks (planned) | 2 weeks (estimated) |
| **Key Innovation** | Single-graph architecture | Homeostasis-driven emergence |

---

## Post-Phase 3: What's Next

### Phase 4: Observation Pipeline (Week 7)
- **Prerequisites**: Phase 3 complete
- **Connection**: Homeostasis states inform what to observe
- **Integration**: Activity levels tracked in observation metadata

### Phase 5: MCP Tool Integration (Week 8)
- **Prerequisites**: Phase 3 complete
- **Connection**: Activity Router classifies tool calls as Level 0
- **Integration**: Tool success rates feed into homeostasis assessment

### Phase 6: Memory Promotion & Learning (Weeks 9-10)
- **Prerequisites**: Phase 3 + 4 complete
- **Connection**: Homeostasis patterns promote to procedures
- **Integration**: Episode → observation → fact → procedure hierarchy

---

## Open Questions for Review

### Q1: Homeostasis Assessment Frequency
- **Options**:
  - A) Every message (accurate, but adds latency)
  - B) Only when Level 2-3 (faster, but may miss signals)
  - C) Cached with TTL (balanced)
- **Recommendation**: Option C (5-minute cache)

### Q2: Activity Router Override
- **Options**:
  - A) User can force level selection
  - B) System decides, no override
  - C) PM can configure level ranges per persona
- **Recommendation**: Option C (persona-level config)

### Q3: Reflexion Evidence Scope
- **Options**:
  - A) Memory only (fast, limited context)
  - B) Memory + codebase (slower, comprehensive)
  - C) Memory + web search (expensive, most comprehensive)
- **Recommendation**: Start with A, add B/C in Phase 5+

### Q4: Cognitive Models Update Triggers
- **Options**:
  - A) Manual update only
  - B) Automatic after corrections
  - C) LLM decides when to update
- **Recommendation**: Option B (automatic after corrections)

---

## Conclusion

Phase 3 implements the **psychological core** of Galatea, transforming it from a memory-enhanced LLM into an agent with emergent, homeostasis-driven behavior. The 6-dimension homeostasis system provides the foundation for intelligent decision-making in novel situations, while the activity router ensures efficient resource usage.

**Key Innovations:**
1. **Homeostasis-driven emergence**: Behavior arises from balance-seeking, not hardcoded rules
2. **Activity-level routing**: 4-level spectrum from "just do it" to "reflect deeply"
3. **Cognitive models integration**: Self-awareness and user modeling in every prompt
4. **Reflexion loop**: Level 3 tasks get Draft → Critique → Revise treatment

**Success Definition:**
- Agent demonstrates dimension-appropriate behavior (>85% accuracy)
- Activity routing reduces cost by >50% while maintaining quality
- Reference scenarios validate homeostasis-driven emergence
- Cognitive models enrich context without token explosion

**Ready to start building?**

---

*Plan created: 2026-02-06*
*Based on: Phase 2 results, homeostasis-architecture-design.md, activity-routing-design.md*
*Status: Ready for implementation*
