# Galatea Open Questions

**Date**: 2026-02-06 (Updated)
**Status**: Active research topics requiring dedicated sessions

---

## 1. ~~Logging & Observation Infrastructure~~ ✅ RESOLVED

**Priority**: ~~High~~ **RESOLVED (2026-02-06)**
**Status**: ~~Needs dedicated brainstorm session~~ **Decided: OpenTelemetry (OTEL)**

**Decision**: Adopted **OpenTelemetry (OTEL) as unified observation backbone**.

**Solution**:
- Claude Code → OTEL (native hooks)
- VSCode → OTEL (custom extension)
- Browser → OTEL (custom extension)
- Linux Activity → OTEL (systemd/X11)
- Home Assistant/Frigate → MQTT → OTEL Collector (infrastructure bridge)

**Documentation**:
- [observation-pipeline/00-architecture-overview.md](./observation-pipeline/00-architecture-overview.md)
- [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md)
- [OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)

---

### ~~Original Question (Archived)~~

<details>
<summary>Click to expand original question</summary>

### The Problem

Galatea needs to observe user activity across multiple sources:
- Browser (tabs, searches)
- Claude Code (prompts, responses, iterations)
- VSCode (file edits, debugging)
- Terminal (commands, output)

Currently no unified logging layer exists. Options considered:

| Option | Pros | Cons |
|--------|------|------|
| **ActivityWatch** | Free, captures window activity | Too simple (just "active window"), data not rich enough |
| **LangFuse** | Already integrates with Claude Code, captures LLM interactions | Focused on LLM, not general activity |
| **Grafana/Loki** | Flexible, industry standard | Need to build all collectors |
| **Custom extensions** | Full control, capture exactly what we need | High development effort |

### Key Questions

1. **What data do we actually need?**
   - Just "user was in VSCode" or full file diffs?
   - Just "user ran command" or full output?
   - How much context is enough for learning?

2. **What's the schema?**
   - Unified event format across sources?
   - How to correlate events (browser search → VSCode edit)?
   - How to handle high-frequency events (typing)?

3. **Storage & retention?**
   - How long to keep raw events?
   - When to aggregate/summarize?
   - Privacy considerations?

4. **LangFuse specifically:**
   - Can it be extended beyond LLM interactions?
   - Can we add custom events (browser, VSCode)?
   - Is it the right foundation or a separate concern?

5. **Build vs buy vs integrate?**
   - Use existing tool (ActivityWatch, LangFuse)?
   - Build custom on top of existing (Grafana stack)?
   - Build from scratch?

### Task for Brainstorm Session

```
OBJECTIVE: Design the observation/logging infrastructure for Galatea

INPUT:
- Current tools: Browser, Claude Code, VSCode, Terminal
- Goal: Unified event stream for Galatea to learn from
- Constraints: Team of one, prefer reuse

OUTPUT:
- Chosen approach (build/buy/integrate)
- Event schema definition
- Data flow architecture
- Implementation plan

DELIVERABLE: docs/LOGGING_ARCHITECTURE.md
```

</details>

---

## 2. Claude Code Relationship (Long-term)

**Priority**: Medium
**Status**: Deferred (using direct LLM+MCP for now)

### Current Decision

For v1, Galatea will:
- **Observe** user using Claude Code (via logging layer)
- **Learn** patterns, preferences, conventions
- **Execute** using Claude API + MCP directly (not via Claude Code)

This is like a junior developer learning by watching, then working independently.

### Future Exploration

The user intuited there might be a more elegant solution than "wrap Claude Code" or "replace Claude Code". Ideas to explore:

1. **Galatea as Claude Code's memory**
   - Claude Code queries Galatea for context
   - "What do I know about this codebase?"
   - Claude Code remains the executor, Galatea provides intelligence

2. **Unified agent with Claude Code interface**
   - Galatea presents same interface as Claude Code
   - User doesn't notice the difference
   - But has persistent memory, autonomy, learning

3. **Galatea observes AND controls Claude Code**
   - For cases where Claude Code has capabilities Galatea doesn't
   - Galatea acts as intelligent operator

4. **Meta-learning from Claude Code interactions**
   - Not just learn coding patterns
   - Learn how to prompt effectively
   - Learn iteration strategies
   - Learn when to ask for clarification

### Questions for Future

- What capabilities does Claude Code have that raw LLM+MCP doesn't?
- Is there value in the Claude Code "personality" vs raw API?
- Could Galatea improve Claude Code's effectiveness with context?
- What would "better than wrapping" look like?

---

## 3. Emergence vs Explicit Mechanisms

**Priority**: High (Architectural principle)
**Status**: Ongoing consideration

### The Principle

If we need to define a special loop or mechanism (e.g., "iteration loop", "quality check"), we should ask:

**"Why doesn't this emerge naturally from the psychological architecture?"**

A human developer doesn't have an "iteration loop" - they have:
- Motivation to complete tasks
- Ability to recognize errors
- Knowledge of how to fix errors
- Judgment about when to ask for help

These create natural iteration without explicit loops.

### Current Concerns

| Mechanism | Should it be explicit or emergent? |
|-----------|-----------------------------------|
| Task polling | Emergent from Attention Manager? |
| Iteration on errors | Emergent from Homeostasis + competence drive? |
| Quality assessment | Emergent from learned standards + metacognition? |
| Approval seeking | Emergent from Initiative Engine + risk assessment? |
| Progress reporting | Emergent from relatedness drive? |

### Questions

1. Are our 12 subsystems sufficient for natural behavior to emerge?
2. What skills/preprompts are needed to guide emergence?
3. When is explicit mechanism OK vs sign of incomplete model?
4. How do we test for emergence vs hardcoded behavior?

---

## 4. Multi-Agent Coordination

**Priority**: Low (Phase 3)
**Status**: Deferred

### Current Decision

Agents communicate like people - via Discord, GitLab comments, etc.
No special A2A protocol needed.

### Future Questions

1. **Identity**: How does PM know they're talking to Agent-Dev-1 vs Agent-Dev-2?
2. **Consistency**: How do multiple agents maintain consistent project understanding?
3. **Conflict**: What if two agents try to edit the same file?
4. **Efficiency**: Is human-channel communication efficient enough?
5. **Coordination**: Does PM need special tools to manage agent team?

---

## 5. Persona Marketplace

**Priority**: Low (validate demand first)
**Status**: Deferred

### Current Decision

Start with export/import functions + manual sharing (gists, Discord).
Build marketplace only if demand validated.

### Future Questions

1. **What's in a persona?** Preprompts only? Memories? Skills?
2. **Privacy**: How to share learned patterns without leaking sensitive data?
3. **Versioning**: How to update personas? Merge improvements?
4. **Quality**: How to rate/review personas?
5. **Business model**: Free? Paid? Freemium?

---

## 6. Company Context Scaling

**Priority**: Medium
**Status**: Solved via skills, but needs validation

### Current Decision

Company context = skills/preprompts that can be imported.

### Questions

1. **Scale**: What if company has 1000 pages of docs? Can't fit in preprompt.
2. **Updates**: How to keep company context current?
3. **Segmentation**: Different context for different projects?
4. **Onboarding**: How does new agent learn company context?
   - Shadow mode?
   - Import from existing agent?
   - Ingest documentation?

---

## 7. Safety & Boundaries

**Priority**: High (before production)
**Status**: Not fully addressed

### Questions

1. **Permissions**: What can agent do without asking?
2. **Boundaries**: What should agent never do?
3. **Escalation**: When must agent involve human?
4. **Audit**: How to track what agent did?
5. **Rollback**: How to undo agent's changes?
6. **Credentials**: How does agent authenticate to services?

### The 62 Subsystems Had

Looking back at original 62 subsystems:
- #5 Safety Monitor
- #6 Dependency Prevention
- #7 Reality Boundary Enforcer
- #8 Crisis Detector
- #9 Intervention Orchestrator

We dropped these in minimal architecture. May need to reconsider for production.

---

## Summary

| Question | Priority | Status | Next Step |
|----------|----------|--------|-----------|
| ~~Logging infrastructure~~ | ~~High~~ | **✅ RESOLVED** | **OTEL adopted (see observation-pipeline/)** |
| Claude Code relationship | Medium | Deferred | Using LLM+MCP for v1 |
| Emergence vs explicit | High | Ongoing | Validate with implementation |
| Multi-agent | Low | Deferred | Phase 3 |
| Marketplace | Low | Deferred | Validate demand first |
| Company context scaling | Medium | Needs validation | Test with real company |
| Safety & boundaries | High | Not addressed | Before production |

---

*Last updated: 2026-02-06*
