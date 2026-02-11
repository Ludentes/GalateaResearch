# Galatea v2: Architecture Redesign

**Date**: 2026-02-11
**Status**: Draft — Awaiting validation of shadow learning approach
**Authors**: Brainstorm session (human + Claude)
**Supersedes**: `PSYCHOLOGICAL_ARCHITECTURE.md` (partially — homeostasis concept survives, infrastructure doesn't)

---

## Core Thesis

Create off-the-shelf developer agents (and eventually any personal assistant) by:
1. **Shadow** real professionals working
2. **Learn** their unique processes, preferences, and patterns automatically
3. **Deploy** agents that behave like trained team members, not blank-slate autocomplete

The psychological insight: define "healthy agent behavior" via homeostasis dimensions, then let emergent behavior arise from the agent striving toward balance — rather than programming imperative reactions to every possible situation.

---

## The Ecosystem Shift (Feb 2026)

The agent ecosystem matured dramatically since the original architecture was designed:

| Standard | What It Provides | Scale |
|---|---|---|
| **Agent Skills** (SKILL.md, open standard) | Procedural knowledge — "how to do X" | 160K+ skills indexed, adopted by Claude/Codex/Copilot/Cursor |
| **MCP** (Model Context Protocol) | Tool access — "ability to do X" | 7,300+ servers on Smithery, 100K+ tools |
| **Agent Teams** (Claude Code experimental) | Multi-agent coordination — shared tasks, messaging | Shipping (experimental) |
| **CLAUDE.md** | Project/personal persistent memory | Built into Claude Code |
| **Progressive Disclosure** | 3-tier context loading for skills | Built into skill runtime |

### What the Ecosystem Doesn't Provide

| Need | Gap |
|---|---|
| Automatic learning from observation | Skills are manually authored. Nobody auto-generates them from watching a developer. |
| Temporal validity on knowledge | Skills/CLAUDE.md have no `valid_until`, no confidence scores, no supersession. |
| Self-regulation / drive system | No standard for "what healthy agent behavior looks like." Agents follow instructions, they don't self-regulate. |
| Memory lifecycle (consolidation, decay) | No standard for knowledge that strengthens with use and decays without it. |
| Heartbeat / time awareness | Agents are reactive (respond when prompted). No standard for persistent, proactive agents. |

---

## Why Skills If LLMs Already Know Everything?

The LLM IS the general intelligence. It knows React, Git, Kubernetes, everything. Skills exist because:

> **Skills are the delta** between "generic LLM" and "expert in THIS context."

In psychological terms:

| Memory Type | Psychology | LLM Equivalent | Where It Lives |
|---|---|---|---|
| Semantic (general) | "React is a UI library" | Already in the LLM weights | The model itself |
| Semantic (contextual) | "We use Clerk for auth" | NOT in the LLM | CLAUDE.md / fact files |
| Procedural (general) | "How to write a React component" | Already in the LLM | The model itself |
| Procedural (contextual) | "How WE submit PRs at THIS company" | NOT in the LLM | Skills (SKILL.md) |
| Episodic | "Last time I tried JWT it failed" | NOT in the LLM | Event logs / RAG |
| Working memory | Current conversation | Context window | Context window |

The LLM + Skills + Memory = **general intelligence + contextual knowledge**.

---

## Architecture: Two Components + Ecosystem

From 62 systems (original brainstorm) to 2 things Galatea builds:

```
┌────────────────────────────────────┐
│         GALATEA AGENT              │
│                                    │
│  1. HOMEOSTASIS (the drive)        │
│     Defines healthy. Measures.     │
│     Corrects. Drives learning.     │
│     Drives action. Drives rest.    │
│                                    │
│  2. MEMORY (what I know)           │
│     Working:    Context window     │
│     Episodic:   Event logs / RAG   │
│     Semantic:   CLAUDE.md / facts  │
│     Procedural: Skills (SKILL.md)  │
│     + Lifecycle: consolidate/decay │
│                                    │
│  ─ ─ ─ ECOSYSTEM (given) ─ ─ ─ ─  │
│  LLM: Claude (general intelligence)│
│  Skills: System 1/2 thinking       │
│  MCP: Tool access (any domain)     │
│  Agent Teams: Multi-agent coord.   │
└────────────────────────────────────┘
```

### Component 1: Homeostasis

**What it is**: A drive system that defines "healthy agent behavior" and makes the agent strive toward it continuously.

**What it is NOT**: An imperative rule engine ("when X, do Y"). It's declarative: "this is healthy, always return to it."

**Why it's unique**: No skill, MCP server, or agent team provides self-regulation. This is what makes an agent push back on bad prompts, recognize knowledge gaps, avoid over-research, and seek work when idle.

**Key concept: context-dependent health**

The same dimensions apply in every mode, but what "healthy" means shifts:

| Dimension | Work Mode | Learning/Shadow Mode |
|---|---|---|
| knowledge_sufficiency | "I know enough to proceed" | "Always LOW — I'm here to learn" |
| productive_engagement | "I'm building/contributing" | "I'm capturing observations" |
| progress_momentum | "I'm completing tasks" | "I'm building my memory corpus" |
| communication_health | "Team knows my status" | "I'm asking clarifying questions" |

**Key concept: emergent behavior from tension**

When multiple dimensions conflict, behavior emerges from resolution:
- productive_engagement LOW + communication_health HIGH → "Can't ask again, review MRs instead"
- knowledge_sufficiency LOW + progress_momentum LOW → "Research, but don't spiral"
- knowledge_application HIGH + progress_momentum LOW → "Stop researching, start building"

**Key concept: universal across domains**

| Domain | Same Dimensions | Different "Healthy" |
|---|---|---|
| Dev agent | knowledge_sufficiency, progress_momentum... | "Update team every ~2 hours" |
| Sales agent | Same | "Follow up within 24 hours" |
| Home assistant | Same | "Alert on anomalies, not routine" |
| Buddy | Same | "Check in if quiet for 2+ days" |

**Implementation approach**: Hybrid — lightweight code for sensors (measuring state), Skills for guidance (defining "healthy" and corrective actions per dimension).

### Component 2: Memory with Lifecycle

**What it is**: Typed knowledge (episodic, semantic, procedural) with a lifecycle (encoding → consolidation → retrieval → reconsolidation → decay).

**Psychological grounding**:

| Lifecycle Stage | Psychology | Agent Implementation |
|---|---|---|
| Encoding | Experience → memory trace | Event observed → extraction → storage |
| Consolidation | Fragile → stable (repetition) | Low confidence → confirmed through repetition → high confidence |
| Retrieval | Finding relevant memory | Skill progressive disclosure + RAG for facts |
| Reconsolidation | Retrieved memory can be updated | Skill used + result differs → update skill |
| Forgetting | Ebbinghaus curve — decay without use | Confidence decay, archival after threshold |
| Interference | New memories disrupt old | Fact supersession, skill updating |

**Memory types mapped to formats**:

| Memory Type | Format | When Used |
|---|---|---|
| Working | Context window | Always present (conversation + loaded skills + CLAUDE.md) |
| Episodic | Event log files | When recalling past experiences ("what happened last time?") |
| Semantic | CLAUDE.md entries + fact files | Project/team knowledge, preferences, policies |
| Procedural | SKILL.md files | How-to knowledge, workflows, procedures |

**Memory tiers (overflow strategy)**:

| Tier | What | Capacity | When to Upgrade |
|---|---|---|---|
| 1: Working | CLAUDE.md + active skills | ~16K chars (context budget) | Default starting point |
| 2: Active | Fact files + skill library on disk | Unlimited disk, loaded on demand | When CLAUDE.md exceeds ~50 entries |
| 3: Long-term | RAG (embeddings) or Mem0 | Unlimited, search-based | Cross-project, cross-agent, or >500 facts |

**Critical design note**: Start with Tier 1 (CLAUDE.md + Skills). Upgrade to RAG/Mem0 when memory pressure is actually felt, not preemptively. YAGNI.

---

## System 1 / System 2 Mapping

Psychology's dual-process theory (Kahneman) simplified:

| Situation | System | What Happens |
|---|---|---|
| Matching skill exists | System 1 (fast, automatic) | Follow the skill procedure |
| No skill, straightforward | System 2 (slow, deliberate) | LLM reasons from scratch |
| No skill, high stakes/uncertain | System 2+ (metacognitive) | Reason carefully, maybe draft-critique-revise |

The "activity router" simplifies to: **does a matching skill exist?** Skill progressive disclosure already handles this — the description matches the request, the skill loads, System 1 kicks in. No custom routing code needed.

---

## What Galatea Builds vs Leverages

| Concern | Build or Leverage? | How |
|---|---|---|
| General intelligence | **Leverage** | Claude (LLM) |
| Tool access | **Leverage** | MCP servers (Smithery, custom) |
| Procedural knowledge format | **Leverage** | SKILL.md (open standard) |
| Project memory format | **Leverage** | CLAUDE.md |
| Multi-agent coordination | **Leverage** | Agent Teams |
| Context management | **Leverage** | Progressive disclosure (built into skills) |
| Self-regulation / drive | **Build** | Homeostasis (sensors + guidance skill) |
| Memory lifecycle | **Build** | Consolidation, decay, supersession, archival |
| Shadow learning | **Build** | Observation → extraction → skill generation pipeline |
| Heartbeat | **Build** | Periodic homeostasis evaluation (emerges from drive system) |
| Temporal validity | **Build** | Metadata layer on skills/facts for valid_until, confidence |

---

## Psychological Foundations

| Concept | Psychologist | How We Use It |
|---|---|---|
| Homeostasis | Cannon (1932) | Drive system — define healthy state, strive toward it |
| Dual Process Theory | Kahneman (2011) | System 1 (skill exists) vs System 2 (reason from scratch) |
| Memory Types | Tulving (1972) | Episodic / Semantic / Procedural mapping to files |
| Forgetting Curve | Ebbinghaus (1885) | Confidence decay on unused memories |
| Self-Determination Theory | Deci & Ryan (1985) | Autonomy, competence, relatedness as universal drives → dimensions |
| Metacognition | Flavell (1979) | Agent knowing what it knows (and doesn't) |
| Zone of Proximal Development | Vygotsky (1978) | Optimal learning at edge of current ability |
| Flow State | Csikszentmihalyi (1990) | Optimal performance when challenge matches skill |
| Social Learning | Bandura (1977) | Shadow training — learning by observation |
| Schema Theory | Piaget (1936) | Knowledge in updatable schemas (skills that evolve) |
| Operant Conditioning | Skinner (1938) | Success rates shape future behavior |

---

## Reference Scenario Validation

### Shadow Training (Phase 1) — HOLDS
Homeostasis in "learning mode" drives observation. Shadow-learning skill guides extraction. Output: SKILL.md + CLAUDE.md entries.
**Note**: Shadow-learning skill must be sophisticated — complexity moves into the skill, not eliminated.

### Task Execution (Phase 4.2) — HOLDS
Skill matches → System 1. CLAUDE.md provides context. Homeostasis tracks state. MCP provides tools. Clean.

### Unknown Situation (Phase 4.5) — HOLDS
No matching skill → System 2. Homeostasis detects knowledge gap → drives research/ask behavior. Uniquely valuable.

### Idle Agent (Trace 7) — HOLDS (needs heartbeat)
Homeostasis tension between productive_engagement LOW and communication_health HIGH produces emergent "find alternative work" behavior. **Requires periodic re-evaluation (heartbeat)**.

### Cross-Agent Patterns (Memory Scenario 5) — HOLDS (needs memory tier upgrade)
Works initially with CLAUDE.md. **Overflows to RAG/Mem0 with 3+ agents over weeks**.

### Technology Update (Scenario 4.4) — PARTIALLY HOLDS
Skills lack built-in temporal validity. **Gap: need `valid_until` convention in skill metadata or separate lifecycle layer**.

---

## Identified Gaps (to resolve)

| # | Gap | Severity | Resolution Direction |
|---|---|---|---|
| 1 | **Shadow learning pipeline** | Critical | Prototype the shadow-learning skill. Determine if extraction can be a skill or needs code. |
| 2 | **Heartbeat** | High | Emerges from homeostasis — needs a long-running process or scheduled trigger for periodic dimension re-evaluation. |
| 3 | **Memory overflow** | Medium | Start with CLAUDE.md (Tier 1). Design clean upgrade path to RAG/Mem0 (Tier 3) when needed. |
| 4 | **Temporal validity** | Medium | Convention: custom metadata in SKILL.md frontmatter (`valid_until`, `confidence`) + lifecycle management code. |
| 5 | **Skill auto-generation** | High | Pipeline from extracted procedures → SKILL.md files. Needs code (template + LLM formatting). |

---

## What This Means for Existing Code

### Keep (repackage)
- **Homeostasis dimensions and guidance** — core concept survives, repackage as sensor code + guidance skill
- **Gatekeeper patterns** — useful for the observation/extraction pipeline
- **Pattern extraction** (Phase 2 work) — useful for shadow learning

### Deprecate
- **Custom context assembler** — replaced by Skills progressive disclosure + CLAUDE.md
- **Custom activity router** — replaced by skill availability as routing signal
- **Custom reflexion loop** — replaceable by a draft-critique-revise skill
- **PostgreSQL fact/procedure tables** — replaced by CLAUDE.md + SKILL.md files
- **Graphiti/FalkorDB** — overkill for Tier 1-2 memory. Revisit only if Tier 3 needed.

### TBD (depends on shadow learning exploration)
- **Extraction orchestrator** — may become part of shadow-learning skill or stay as code
- **Fact extractor** — may become part of shadow-learning skill or stay as code

---

## Next Steps

1. **Explore shadow learning** — Can the observation → extraction → skill generation pipeline be expressed as a skill? Or does it need dedicated code? Prototype and find out.
2. **Design memory lifecycle** — How does consolidation (episode → fact → skill) work with file-based memory? What triggers promotion?
3. **Prototype homeostasis-as-skill** — Write the guidance skill. Test if sensors can be lightweight code that feeds into skill-based judgment.
4. **Plan implementation** — Once gaps are resolved, create implementation plan for v2.

---

## Open Questions

1. Can shadow learning be a skill, or does it need a dedicated observation daemon?
2. What's the minimum viable heartbeat? Cron job? Long-running process? Agent Teams teammate?
3. How do we handle skill auto-generation quality? LLM-formatted skills may need human review.
4. Should we use SKILL.md metadata extensions (custom frontmatter fields) for temporal validity, or a separate metadata file?
5. How does persona export work in this model? Export = zip of CLAUDE.md + skill directory?
6. How do we test this? What replaces the golden dataset benchmarks?

---

*Design document from brainstorm session, 2026-02-11*
*Key insight: Galatea builds TWO things (homeostasis + memory-with-lifecycle). Everything else is the ecosystem.*
