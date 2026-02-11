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

## Observation Pipeline Mapping

The existing observation pipeline design (see `docs/OBSERVATION_PIPELINE.md`) maps cleanly to v2. OTEL-first architecture is kept. Output format changes.

| Pipeline Layer | Original Design | v2 Change |
|---|---|---|
| Layer 0: Sources (OTEL) | Claude Code hooks, VSCode, browser, Linux, HomeAssistant, Frigate | **No change**. Universal event capture is the right design. |
| Layer 1: Ingestion | API endpoint, PostgreSQL storage | **Simplify**. May not need PostgreSQL for raw events — file-based logs may suffice. |
| Layer 2: Enrichment | LLM intent guessing, session boundary detection | **Keep logic, repackage prompts as skill**. A "shadow-learning" skill guides extraction. |
| Layer 3: Dialogue | Validation, learning questions, daily rituals | **Keep as code** (UI/delivery concern). Question templates could be skills. |
| Layer 4: Memory Formation | Graphiti + FalkorDB entities/facts | **Change output format**: Procedures → SKILL.md, Facts → CLAUDE.md, Episodes → log files |

**The heartbeat emerges naturally**: the enrichment batch cycle (every 30s) IS the heartbeat. Homeostasis dimensions can be re-evaluated on each batch cycle.

---

## Learning Lifecycle (from scenarios)

See `docs/plans/2026-02-11-learning-scenarios.md` for 9 detailed scenarios tracing OBSERVE → EXTRACT → WRITE → USE.

Summary of the promotion pipeline:

```
Single occurrence        → Episode log only (no memory formed)
2+ occurrences           → CLAUDE.md entry (confidence 0.6-0.8)
3+ occurrences + valid.  → SKILL.md generated (confidence 0.8+)
Explicit user statement  → CLAUDE.md immediately (confidence 1.0)
```

Memory consolidation over time:
```
Used successfully   → confidence increases
Used, failed        → skill updated, episode logged
Not used 60+ days   → confidence decays
Superseded          → archived to _archived/ directory
Memory grows large  → tier upgrade (CLAUDE.md → structured files → RAG/Mem0)
```

---

## Answers to Open Questions (from brainstorm)

1. **Can shadow learning be a skill or needs a daemon?**
   Answer: **Hybrid**. The observation pipeline (OTEL ingestion, session detection, batch processing) needs code. The extraction/enrichment prompts can be packaged as a skill. The output (SKILL.md, CLAUDE.md) is standard format.

2. **Minimum viable heartbeat?**
   Answer: **The observation pipeline's batch cycle IS the heartbeat**. Every 30s it processes new events. Homeostasis dimensions evaluated on each cycle. No separate heartbeat needed.

3. **Skill auto-generation quality?**
   Answer: Skills are generated from 3+ validated occurrences. LLM formats the skill. User validates via dialogue. Low-confidence skills (<0.8) get a `metadata.confidence` field. User can review/edit generated skills like any file.

4. **Temporal validity in SKILL.md?**
   Answer: Use `metadata` frontmatter field (part of the spec). Example: `metadata: { valid_until: "NativeWind 4.1", confidence: 0.95 }`. Pipeline checks metadata on dep updates.

5. **Persona export?**
   Answer: **Export = zip of `.claude/skills/` + `CLAUDE.md` + `memory/` directory**. Standard files. Import = unzip into new project. Cross-platform compatible.

6. **Testing approach?**
   Answer: Learning scenarios (L1-L9) become integration tests. Input: sequence of OTEL events. Expected output: specific SKILL.md and CLAUDE.md content. Replace golden dataset with scenario-based testing.

---

## Next Steps

1. ~~Explore shadow learning~~ → See learning scenarios doc (completed)
2. **Prototype the observation → SKILL.md pipeline** — Build the minimum code that takes OTEL events and generates a skill file
3. **Write the homeostasis guidance skill** — Define dimensions and "healthy" as a SKILL.md
4. **Design memory tier upgrade path** — CLAUDE.md → structured files → RAG/Mem0 transition points
5. **Plan v2 implementation** — Once prototypes validate, create phased implementation plan

---

*Design document from brainstorm session, 2026-02-11*
*Updated with observation pipeline mapping and learning scenarios*
*Key insight: Galatea builds TWO things (homeostasis + memory-with-lifecycle). Everything else is the ecosystem.*
