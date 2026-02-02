# Homeostasis-Based Agent Architecture

**Date**: 2026-02-02
**Status**: Accepted
**Decision**: Use homeostasis as the core organizing principle for agent behavior

---

## Executive Summary

After extensive analysis of architectural approaches, we've decided to use a **homeostasis-based architecture** instead of discrete subsystems. This approach:

1. Replaces 12+ subsystems with 6 core dimensions
2. Grounds agent behavior in psychology research
3. Provides emergence for novel situations
4. Acts as guardrails against extreme behavior
5. Maintains debuggability and tunability

---

## The Problem

We evaluated three approaches:

### A) 12 Subsystems as Code
```
Curiosity Engine → Motivation Engine → Initiative Engine → ...
```
- Explicit state tracking per subsystem
- Testable in isolation
- **Problem**: Too much code, subsystems compete for context, rigid

### B) Preprompts Only
```
"When uncertain, ask. When stuck, escalate. When idle, seek work."
```
- Radical simplicity
- Full prompt control
- **Problem**: Brittle rules, no emergence, no psychological grounding

### C) Homeostasis-Based (Selected)
```
6 Dimensions → Imbalance Detection → Guidance → Emergent Behavior
```
- Psychology informs dimensions
- Balance drives behavior
- Code only where computation needed

---

## The Solution: Homeostasis

### Core Insight

Instead of explicit drives (Curiosity Engine, Motivation Engine), we define **dimensions of healthy functioning**. When a dimension is out of balance, the agent is guided to restore it.

```
┌─────────────────────────────────────────────────────────────┐
│  Dimension Assessment                                       │
│  "Which dimensions are out of balance?"                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Guidance Selection                                         │
│  "What guidance applies to imbalanced dimensions?"          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM Reasoning                                              │
│  "Given state + guidance, what should I do?"                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
                 [Action]
```

### Why Homeostasis Works

**Biological parallel**: Organisms maintain temperature, blood sugar, pH within ranges. They don't "maximize" these - they seek balance.

**Agent parallel**: Agents should maintain knowledge, progress, communication within ranges. Too little OR too much is unhealthy.

```
Knowledge seeking:
[too little]          [healthy]           [too much]
     │                    │                    │
"Can't proceed,      "Know enough         "Analysis
 knowledge gap"       to act"              paralysis"
     │                    │                    │
     └────── seek more ──►│◄── apply it ──────┘
```

---

## The Six Core Dimensions

### Psychological Grounding

| Dimension | Psychological Need | Source |
|-----------|-------------------|--------|
| Knowledge Sufficiency | Competence | Self-Determination Theory |
| Certainty Alignment | Self-awareness | Metacognition research |
| Progress Momentum | Achievement | Goal theory |
| Communication Health | Relatedness | Self-Determination Theory |
| Productive Engagement | Purpose | Meaning/flow research |
| Knowledge Application | Balance | Learning theory |

### Dimension Specifications

#### 1. Knowledge Sufficiency

**Question**: "Do I know enough to proceed effectively?"

| State | Description |
|-------|-------------|
| LOW | Can't explain approach, guessing, memories don't match task |
| HEALTHY | Can explain what and why, confident enough to proceed |
| HIGH | N/A (see Knowledge Application) |

**When LOW**:
- Retrieve more memories
- Research (docs, codebase)
- Ask teammate or PM
- Don't research forever - timebox then ask

#### 2. Certainty Alignment

**Question**: "Does my confidence match my action?"

| State | Description |
|-------|-------------|
| LOW | Uncertain but proceeding, making irreversible decisions while doubtful |
| HEALTHY | Confidence matches stakes, ask when uncertain on important things |
| HIGH | Certain but still asking, seeking validation not information |

**When LOW**: Determine if question is preference (ask PM) or technical (research first)
**When HIGH**: Try it and course-correct, don't waste others' time

#### 3. Progress Momentum

**Question**: "Am I moving forward?"

| State | Description |
|-------|-------------|
| LOW | Stuck, repeating actions, spinning |
| HEALTHY | Meaningful actions, closer to goal |
| HIGH | Rushing, skipping steps |

**When LOW**: Diagnose blocker - is it knowledge? uncertainty? external? Then unblock or escalate.
**When HIGH**: Pause to verify quality

#### 4. Communication Health

**Question**: "Am I appropriately connected to others?"

| State | Description |
|-------|-------------|
| LOW | Working in isolation, others don't know status |
| HEALTHY | Team knows what you're doing, responsive when needed |
| HIGH | Constant messaging, interrupting others |

**When LOW**: Update team, check for relevant information from others
**When HIGH**: Batch messages, try before asking

#### 5. Productive Engagement

**Question**: "Am I contributing value?"

| State | Description |
|-------|-------------|
| LOW | No task, idle, waiting without alternatives |
| HEALTHY | Working on task OR helping OR learning |
| HIGH | Overloaded, can't focus |

**When LOW**: Priority order: assigned task > help teammates > review MRs > proactive improvements > learn
**When HIGH**: Prioritize, delegate, or signal overload

#### 6. Knowledge Application

**Question**: "Am I balancing learning with doing?"

| State | Description |
|-------|-------------|
| LOW | Acting without learning, trial and error without thought |
| HEALTHY | Learn enough to act, iterate: try, learn, adjust |
| HIGH | Researching endlessly, analysis paralysis |

**When LOW**: Pause to understand why, not just how
**When HIGH**: Time to apply - you can course-correct as you go

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Explicit Guidance                                 │
│  "When X happens, do Y"                                     │
│  Precise, handles known situations                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ (when guidance doesn't apply)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Homeostasis Emergence                             │
│  "Stay in balance"                                          │
│  Handles novel situations via dimension balance             │
└─────────────────────┬───────────────────────────────────────┘
                      │ (always active)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Guardrails                                        │
│  "Don't go too far in any direction"                        │
│  Catches runaway behavior                                   │
└─────────────────────────────────────────────────────────────┘
```

**Layer 1** handles anticipated situations with specific guidance.
**Layer 2** handles novel situations through balance-seeking.
**Layer 3** catches extremes (over-researching, over-asking, going dark).

---

## Agent Spec Format

Agents are defined by a spec that derives homeostasis from requirements.

### Derivation Chain

```
Natural Language Requirement
    ↓
Invariant (what must be true)
    ↓
Dimension (what to measure)
    ↓
Assessment (how to measure)
    ↓
Guidance (what to do when imbalanced)
```

### Example Spec

```yaml
identity:
  name: "Expo Developer Agent"
  role: "Mobile developer"
  domain: "Expo / React Native"

core_dimensions:
  # Universal, same for all agents
  - knowledge_sufficiency
  - certainty_alignment
  - progress_momentum
  - communication_health
  - productive_engagement
  - knowledge_application

thresholds:
  # Persona-specific tuning
  certainty_alignment:
    ask_threshold: "architecture/preference questions"
    proceed_threshold: "technical questions with research"
  communication_health:
    update_interval: "context-dependent, ~2 hours during active work"

hard_blocks:
  # Absolute prohibitions
  - "push directly to main"
  - "use Realm database"
  - "commit secrets"

learned:
  # Filled from shadow training
  facts: [...]
  procedures: [...]
  calibrations: [...]
```

---

## Comparison: Homeostasis vs Alternatives

### Value Proposition

| Aspect | Homeostasis | Smart Preprompts | 12 Subsystems |
|--------|-------------|------------------|---------------|
| Novel situations | Emergence from balance | Depends on rule generality | Explicit code needed |
| Debuggability | "Dimension X was LOW" | "LLM decided..." | "Subsystem X triggered" |
| Tunability | Adjust thresholds | Rewrite prompts | Modify code |
| Complexity | Medium | Low | High |
| Psychology grounding | Explicit | Implicit/none | Explicit but rigid |
| Guardrails | Built-in (balance) | Must be coded | Must be coded |

### When Homeostasis Excels

**Novel situation without guidance**:
```
Agent encounters mixed OAuth2 patterns (never anticipated)

Dimensions: knowledge_sufficiency LOW, certainty LOW, progress STALLING

No specific guidance exists, but homeostasis produces:
"Research briefly, then ask - this is an architecture question"
```

**Catching runaway behavior**:
```
Agent researching for 2 hours without building

knowledge_application: HIGH
progress_momentum: LOW

Guardrail triggers: "You've been learning but not doing"
```

---

## Implementation Sketch

```python
class HomeostasisEngine:
    dimensions = [
        "knowledge_sufficiency",
        "certainty_alignment",
        "progress_momentum",
        "communication_health",
        "productive_engagement",
        "knowledge_application"
    ]

    def assess(self, context: AgentContext) -> dict[str, str]:
        """LLM assesses each dimension: LOW / HEALTHY / HIGH"""
        # Some dimensions can be computed (time since message)
        # Others are emergent (LLM self-assessment of confidence)
        pass

    def get_guidance(self, states: dict) -> str:
        """Lookup guidance for imbalanced dimensions"""
        pass

    def build_context(self, agent_context: AgentContext) -> str:
        """Assemble full prompt with state + guidance + task + memories"""
        pass
```

**Key implementation decisions**:
- Assessment: Hybrid (some computed, some LLM-assessed)
- Guidance: Structured lookup, not hardcoded
- Persona differences: Threshold configuration, not code changes

---

## Relationship to Memory System

Homeostasis and memory are complementary:

- **Homeostasis** says WHAT to do (explore, ask, apply)
- **Memory** provides HOW (specific facts, procedures, context)

```
Homeostasis: "knowledge_sufficiency is LOW"
Memory retrieval: "Here's what you know about auth patterns..."
LLM: "I'll use Clerk based on this prior experience"
```

The memory system (Mem0/Graphiti) stores:
- Facts with confidence
- Procedures with triggers
- Episodes for context

Homeostasis doesn't change from learning. Memories do.

---

## Open Questions

1. **Assessment reliability**: How consistent is LLM self-assessment?
2. **Dimension completeness**: Are 6 dimensions enough for all situations?
3. **Threshold calibration**: How do we tune thresholds from observation?
4. **Cross-agent patterns**: How do agents learn from each other's mistakes?

---

## Decision Record

**Decision**: Adopt homeostasis-based architecture with 6 core dimensions.

**Rationale**:
1. Provides emergence for novel situations (Layer 2)
2. Acts as guardrails against extremes (Layer 3)
3. Grounded in psychology research (thesis support)
4. Simpler than 12 subsystems
5. More structured than ad-hoc preprompts
6. Debuggable and tunable

**Trade-offs accepted**:
- Assessment adds overhead vs pure preprompts
- Dimensions may need expansion for edge cases
- Threshold calibration is non-trivial

---

## Next Steps

1. Implement HomeostasisEngine prototype
2. Test with reference scenarios
3. Integrate with memory system (Mem0)
4. Calibrate thresholds from shadow training
5. Evaluate: Does psychology + homeostasis beat plain LLM?
