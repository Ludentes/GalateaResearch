# Brainstorm Queue

Topics to explore in future sessions.

---

## Completed

### 1. Core Architecture: Subsystems vs Preprompts vs Hybrid

**Date Resolved**: 2026-02-02
**Decision**: Homeostasis-based architecture with 6 universal dimensions

**Summary**:
We evaluated three approaches:
- A) 12 Subsystems as Code → Too complex
- B) Preprompts Only → Too brittle, no emergence
- C) Hybrid with Homeostasis → Selected

**Key insights**:
1. Homeostasis provides emergence for novel situations
2. Same 6 dimensions work across all personas (coder, lawyer, buddy)
3. Explicit guidance → Homeostasis → Guardrails (three layers)
4. Memory provides HOW, homeostasis provides WHAT

**Documents created**:
- [homeostasis-architecture-design.md](./2026-02-02-homeostasis-architecture-design.md)
- [PSYCHOLOGICAL_ARCHITECTURE.md](../PSYCHOLOGICAL_ARCHITECTURE.md) (updated)
- [REFERENCE_SCENARIOS.md](../REFERENCE_SCENARIOS.md) (updated with traces)

---

## Completed

### 2. Memory System Implementation

**Date Resolved**: 2026-02-02
**Decision**: Graphiti with FalkorDB backend

**Summary**:
After extensive scenario tracing through shadow learning, multi-agent deployment, and cross-agent learning use cases, we determined that Graphiti is essential due to:
1. **Guaranteed hard rules** - Must inject regardless of semantic similarity
2. **Temporal validity** - "Was true then, not now" needs bi-temporal model
3. **Usage tracking** - Procedures need success rates across uses
4. **Memory promotion** - Episodes → facts → procedures requires graph edges
5. **Cross-agent patterns** - Sharing knowledge requires relationship modeling

**Key design decisions**:
- 15 node types covering episodic, semantic (5 subtypes), procedural, and 4 cognitive models
- 15 edge types for provenance, structure, relationships, and self-model tracking
- 6-level promotion hierarchy with circular prevention (50% self-reinforcement discount)
- Non-lossy invalidation (supersede, never delete)
- Memory Gatekeeper filters general knowledge LLM already knows
- Context assembly: guaranteed hard rules + semantic search + procedure matching + models

**Documents created**:
- [2026-02-02-memory-system-design.md](./2026-02-02-memory-system-design.md) (comprehensive design)
- [2026-02-02-memory-findings.md](./2026-02-02-memory-findings.md) (preliminary analysis)

---

## Pending

### 3. Adaptive Model Selection & Dual-Process (System 1/System 2)

**Date Added**: 2026-02-02
**Priority**: MEDIUM - Cost optimization, quality improvement, psychology alignment
**Context**: System should autonomously choose the most appropriate model AND processing mode for each task.

**Key Insight**: This connects to Kahneman's dual-process theory from our psychology research:
- **System 1**: Fast, automatic, pattern-matching, uses procedural memory
- **System 2**: Slow, deliberate, analytical, uses full semantic retrieval

**The core problem** (in order):
1. First: Determine if we're in System 1 or System 2 mode
2. Then: Select appropriate model based on that mode
3. Then: Select appropriate memory retrieval strategy

**NOT**: Select model first, then call it a "system" (backwards!)

**System 1 indicators** (fast path appropriate):
- Matching procedure exists with success_rate > 0.85
- Task is routine/familiar (seen similar before)
- Homeostasis: knowledge HIGH, certainty HIGH
- Low stakes (reversible, no major consequences)
- Time pressure

**System 2 indicators** (slow path needed):
- No matching procedure, or low success rate
- Novel/unfamiliar task
- Homeostasis: knowledge LOW or certainty LOW
- High stakes (irreversible, significant consequences)
- Architecture/preference decisions
- Explicit reasoning required

**Processing mode determines everything else**:
```
System 1 (Fast)                    System 2 (Slow)
─────────────────────────────────────────────────────
Memory: Procedural match only      Memory: Full retrieval pipeline
Search: Pattern match              Search: Semantic + graph traversal
Model: Haiku (cheap, fast)         Model: Sonnet/Opus (capable)
Reasoning: Minimal                 Reasoning: Deliberate
```

**Fits into architecture via**:
- Self Model: Track available models and their capabilities
- Procedural Memory: System 1 uses this primarily
- Semantic Memory: System 2 needs full access
- Homeostasis: Signals for mode selection (not the mode itself)

**Open questions**:
- How to detect task novelty/familiarity?
- Should we track "cognitive load" in Self Model?
- How to handle System 1 failures gracefully (escalate to System 2)?
- Can we learn System 1/2 boundaries from observation?
- Where does this component live? Before homeostasis? Parallel?

**Potential architecture placement**:
```
Task → [System Selector] → System 1 or 2 decision
                              │
                              ├─► System 1: Procedural match → Haiku → Execute
                              │
                              └─► System 2: Full retrieval → Homeostasis → Sonnet/Opus → Reason
```

**Related psychology**: Kahneman (Thinking Fast and Slow), Dual-Process Theory, Cognitive Load Theory

---

### 4. Threshold Calibration from Observation

**Date Added**: 2026-02-02
**Priority**: MEDIUM - Needed for shadow training
**Context**: How do we tune homeostasis thresholds from observing the user?

**Example**:
```
User asks for help after ~30 min stuck
→ certainty_alignment.ask_threshold = "~30 min"

User posts updates every ~2 hours
→ communication_health.update_interval = "~2 hours"
```

**Questions**:
- Can this be automated or does user need to confirm?
- What's the minimum observation needed for calibration?
- How do we handle conflicting observations?

---

### 5. Assessment Reliability

**Date Added**: 2026-02-02
**Priority**: MEDIUM - Affects homeostasis quality
**Context**: How consistent is LLM self-assessment of dimensions?

**Concern**: LLM says "knowledge_sufficiency: HEALTHY" when it's actually LOW.

**Testing needed**:
- Run same scenario multiple times, measure consistency
- Compare LLM assessment to ground truth in test cases
- Identify which dimensions are reliable vs unreliable

---

### 6. Cross-Agent Pattern Detection

**Date Added**: 2026-02-02
**Priority**: LOW - Phase 4 feature
**Context**: When multiple agents make the same mistake, elevate to shared knowledge.

**Example**:
```
Agent-1 misses null checks → self-observation (conf: 0.4)
Agent-3 misses null checks → self-observation (conf: 0.4)
System detects pattern → shared fact: "Null checks commonly missed" (conf: 0.7)
```

**Questions**:
- Who runs pattern detection? (Centralized system? Agent meta-cognition?)
- How many occurrences before elevating?
- How to handle false patterns?

---

### 7. Persona Specialization

**Date Added**: 2026-02-02
**Priority**: LOW - Future feature
**Context**: How do different personas (coder, lawyer, buddy) differ beyond thresholds?

**Known differences**:
- Thresholds (certainty, communication timing)
- Domain knowledge
- Hard blocks

**Unknown**:
- Do some personas need additional dimensions?
- How much does guidance text change?
- Can personas be composed? (coder + buddy)

---

## Archived (No Longer Relevant)

### ~~Homeostasis vs Drives - Redundant?~~

**Archived**: 2026-02-02
**Reason**: Resolved by homeostasis architecture - drives emerge from dimension imbalances

Original question was whether Curiosity/Motivation/Initiative engines should be separate from Homeostasis. Answer: No. They're the same thing viewed differently. "Curiosity" emerges when `knowledge_sufficiency` is LOW.

---

*Queue updated: 2026-02-02*
