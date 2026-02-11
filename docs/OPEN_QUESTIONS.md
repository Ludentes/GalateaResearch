# Galatea Open Questions

**Date**: 2026-02-11 (Updated for v2)
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
**Status**: Partially resolved by v2 + Agent Teams

### v2 Update (2026-02-11)

The ecosystem has evolved significantly. Claude Code now supports:
- **Agent Skills** (SKILL.md) — Galatea's output format for procedural knowledge
- **CLAUDE.md** — Galatea's output format for semantic knowledge
- **Agent Teams** — Multi-agent coordination with shared tasks and mailbox messaging
- **MCP** — Tool access for any domain

This changes the question from "wrap vs replace Claude Code" to "how does Galatea enhance Claude Code agents?"

### Current Direction

Galatea provides the **learning pipeline** that Claude Code agents lack:
1. **Shadow** user working (via OTEL observation pipeline)
2. **Extract** patterns, preferences, procedures
3. **Write** SKILL.md + CLAUDE.md files
4. **Agent uses** these files natively (no wrapper needed)

Galatea is to Claude Code what training is to a new hire — it produces the knowledge artifacts that make the agent effective in a specific context.

### Remaining Questions

- How does Galatea interact with Agent Teams? (Observer? Coordinator? Training agent?)
- Should Galatea BE a Claude Code agent (with skills) or a separate service?
- How to handle the handoff from "shadowing" to "working" mode?

---

## 3. Emergence vs Explicit Mechanisms

**Priority**: High (Architectural principle)
**Status**: Partially validated by v2 design

### v2 Update (2026-02-11)

The v2 architecture addresses this directly: homeostasis defines "healthy" declaratively, and behavior emerges from the agent striving toward balance. This replaces the imperative "when X do Y" pattern.

Examples of emergent behavior from homeostasis tension:
- productive_engagement LOW + communication_health HIGH → "Can't ask again, review MRs instead"
- knowledge_sufficiency LOW + progress_momentum LOW → "Research, but don't spiral"
- knowledge_application HIGH + progress_momentum LOW → "Stop researching, start building"

### Remaining Questions

1. Can homeostasis dimensions fully replace explicit mechanisms, or do some behaviors need explicit rules?
2. How to test for emergence vs hardcoded behavior in practice?
3. What's the right granularity for homeostasis dimensions — too few miss nuance, too many recreate the 62-system problem?

---

## 4. Multi-Agent Coordination

**Priority**: Medium
**Status**: Partially resolved by Agent Teams

### v2 Update (2026-02-11)

Claude Code Agent Teams (experimental) provides multi-agent coordination with shared tasks and mailbox messaging. This removes the need for custom A2A protocols.

### Remaining Questions

1. **Galatea's role**: Is Galatea a team member, coordinator, or training system for Agent Teams?
2. **Shared memory**: How do multiple agents share learned knowledge? (Same CLAUDE.md? Separate? Merged?)
3. **Persona transfer**: Can a persona trained by shadowing one developer be used by an agent in a team?
4. **Consistency**: How do multiple agents maintain consistent project understanding via shared CLAUDE.md?

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
**Status**: Addressed by v2 memory tiers

### v2 Update (2026-02-11)

The memory tier system addresses scaling:
- Tier 1: CLAUDE.md + Skills (<50 facts)
- Tier 2: Structured files on disk (50-500 facts)
- Tier 3: RAG/Mem0 (>500 facts, cross-project)

### Remaining Questions

1. **Tier transitions**: When exactly to upgrade? Automated or manual?
2. **Onboarding**: Shadow mode produces SKILL.md/CLAUDE.md — how long until agent is "ready"?
3. **Segmentation**: Different CLAUDE.md per project? Shared skill library?

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

### v2 Note

In v2, safety could be a homeostasis dimension (e.g., "safety_compliance" always HIGH) and/or a dedicated skill that guides boundary-checking. The declarative approach ("this is safe behavior") may be more robust than imperative safety rules.

---

## Summary

| Question | Priority | Status | Next Step |
|----------|----------|--------|-----------|
| ~~Logging infrastructure~~ | ~~High~~ | **RESOLVED** | OTEL adopted (see observation-pipeline/) |
| Claude Code relationship | Medium | Partially resolved | Galatea produces SKILL.md/CLAUDE.md that agents use natively |
| Emergence vs explicit | High | Partially validated | v2 homeostasis is declarative; validate with implementation |
| Multi-agent | Medium | Partially resolved | Agent Teams provides coordination; Galatea's role TBD |
| Marketplace | Low | Deferred | Validate demand first |
| Company context scaling | Medium | Addressed | v2 memory tiers; transition points TBD |
| Safety & boundaries | High | Not addressed | Before production; may be homeostasis dimension |

---

*Last updated: 2026-02-11*
