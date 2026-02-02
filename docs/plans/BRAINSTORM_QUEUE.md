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

## Pending

### 2. Memory System Implementation

**Date Added**: 2026-02-02
**Priority**: HIGH - Needed for MVP
**Status**: Preliminary analysis complete

**Decision to make**: Mem0 vs Graphiti vs hybrid

**Current leaning**: Mem0 for MVP, add Graphiti later if temporal features needed

**Key questions**:
- How to handle cross-agent memory sharing?
- Episode granularity (task? session? action?)
- Fact deduplication strategy

**Related file**: [2026-02-02-memory-findings.md](./2026-02-02-memory-findings.md)

---

### 3. Threshold Calibration from Observation

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

### 4. Assessment Reliability

**Date Added**: 2026-02-02
**Priority**: MEDIUM - Affects homeostasis quality
**Context**: How consistent is LLM self-assessment of dimensions?

**Concern**: LLM says "knowledge_sufficiency: HEALTHY" when it's actually LOW.

**Testing needed**:
- Run same scenario multiple times, measure consistency
- Compare LLM assessment to ground truth in test cases
- Identify which dimensions are reliable vs unreliable

---

### 5. Cross-Agent Pattern Detection

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

### 6. Persona Specialization

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
