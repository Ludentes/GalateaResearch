# The Agent Skills Ecosystem: Why It Matters and How to Use It

**Date**: 2026-02-11
**Purpose**: Rationale document for adopting the Skills ecosystem in new projects
**Context**: Lessons from Galatea v1→v2 pivot, where custom infrastructure was replaced by ecosystem standards

---

## The Ecosystem (Feb 2026)

Five standards matured nearly simultaneously, creating a composable agent infrastructure layer:

| Standard | What It Provides | Scale | Key Property |
|---|---|---|---|
| **SKILL.md** (open standard) | Procedural knowledge — "how to do X" | 160K+ skills indexed | Portable across Claude/Codex/Copilot/Cursor |
| **MCP** (Model Context Protocol) | Tool access — "ability to do X" | 7,300+ servers, 100K+ tools | Universal tool interface |
| **CLAUDE.md** | Project/personal persistent memory | Built into Claude Code | Always loaded, human-readable |
| **Progressive Disclosure** | 3-tier context loading for skills | Built into skill runtime | Solves context overflow |
| **Agent Teams** (experimental) | Multi-agent coordination | Shipping in Claude Code | Shared tasks, messaging |

**The key insight**: These standards together provide what teams used to build custom infrastructure for — routing, memory, tool access, coordination. The question is no longer "how do I build an agent framework?" but "what's missing from the ecosystem that I actually need to build?"

---

## Why Skills Exist If LLMs Already Know Everything

The LLM IS the general intelligence. It knows React, Git, Kubernetes, everything. So why bother with skills?

> **Skills are the delta between "generic LLM" and "expert in THIS context."**

| Knowledge Type | Example | In the LLM? | Where It Lives |
|---|---|---|---|
| General semantic | "React is a UI library" | Yes | Model weights |
| **Contextual semantic** | "We use Clerk for auth, not JWT" | **No** | CLAUDE.md |
| General procedural | "How to write a React component" | Yes | Model weights |
| **Contextual procedural** | "How WE submit PRs at THIS company" | **No** | SKILL.md |
| Episodic | "Last time JWT auth failed because..." | **No** | Event logs |

The LLM + Skills + CLAUDE.md = **general intelligence + contextual knowledge**. Without the contextual layer, every agent session starts from zero — the LLM knows everything about the world but nothing about your project, your team, or your preferences.

---

## System 1 / System 2: Skills as Fast-Path Routing

Kahneman's dual-process theory maps directly to skill availability:

| Situation | System | What Happens |
|---|---|---|
| Matching skill exists | **System 1** (fast, automatic) | Follow the skill procedure — no reasoning needed |
| No skill, straightforward | **System 2** (slow, deliberate) | LLM reasons from scratch |
| No skill, high stakes | **System 2+** (metacognitive) | Reason carefully, draft-critique-revise |

This means **skill availability IS the activity router**. You don't need custom routing code to decide "should the agent research or execute?" — if a skill matches, System 1 kicks in. If not, the LLM reasons from general knowledge.

In Galatea v1, we built a custom Activity Router (500+ lines) to classify situations and route to different behaviors. In v2, we deleted it. Progressive disclosure already handles skill matching — the description matches the request, the skill loads, done.

---

## What Custom Infrastructure Skills Replace

This is the core lesson from Galatea's v1→v2 pivot. We built custom systems that the ecosystem now provides:

| Custom System (v1) | Lines of Code | Replaced By | Effort to Replace |
|---|---|---|---|
| Activity Router | ~500 | Skill availability + progressive disclosure | Delete |
| Context Assembler (5-priority pipeline) | ~400 | CLAUDE.md + Skills progressive disclosure | Delete |
| Reflexion Loop (draft-critique-revise) | ~300 | A SKILL.md that describes the pattern | 1 file |
| PostgreSQL facts/procedures tables | ~600 | CLAUDE.md entries + SKILL.md files | Delete tables |
| Graphiti/FalkorDB integration | ~800 | File-based extraction + JSONL store | Delete |
| Custom routing logic | ~200 | Skill description matching (built-in) | Delete |
| **Total deleted** | **~2,800 lines** | **~50 lines of config + skill files** | |

---

## The Memory Model: Files Over Databases

### Why files win

| Property | Database (PostgreSQL) | Files (SKILL.md + CLAUDE.md) |
|---|---|---|
| Portability | Tied to one application | Works across 35+ agents |
| Version control | Complex audit logs | Git diffs, commit history |
| Human readability | Requires SQL queries | Open in any editor |
| Cross-project sharing | Custom export/import | Zip → unzip |
| Infrastructure | Requires running DB | Zero infrastructure |
| Ecosystem integration | Proprietary schema | Open standards |

### The tier strategy (YAGNI)

Don't build for scale you don't have:

| Tier | What | Capacity | When to Upgrade |
|---|---|---|---|
| 1: Working | CLAUDE.md + active skills | ~16K chars context | Default starting point |
| 2: Active | Fact files + skill library on disk | Unlimited, loaded on demand | When CLAUDE.md exceeds ~50 entries |
| 3: Long-term | RAG/embeddings or Mem0 | Unlimited, search-based | Cross-project, >500 facts |

Start at Tier 1. Most projects never need Tier 3.

---

## Practical: What to Build vs Leverage

For any new project adopting the skills ecosystem:

### Leverage (don't build)

- **LLM general intelligence** — Claude/GPT/etc. already know how to code, write, reason
- **Tool access** — MCP servers (Smithery catalog has 7,300+, or build custom)
- **Procedural knowledge format** — SKILL.md open standard
- **Project memory** — CLAUDE.md (loaded automatically)
- **Context management** — Progressive disclosure (built into skill runtime)
- **Multi-agent coordination** — Agent Teams

### Build (unique value)

Only build what the ecosystem genuinely doesn't provide:

- **Automatic learning** — Skills are manually authored today. Auto-generating them from observation is novel.
- **Memory lifecycle** — No standard for confidence scores, temporal validity, decay, supersession.
- **Self-regulation** — No standard for "what healthy agent behavior looks like." Agents follow instructions, they don't self-regulate.
- **Domain-specific logic** — Your actual business logic, integrations, workflows.

---

## The Skills Anatomy

### SKILL.md structure

```markdown
---
name: submit-pull-request
description: Use when feature is complete and ready for review
---

# Submit Pull Request

## Steps
1. Run tests: `pnpm test`
2. Check lint: `pnpm biome check .`
3. Create PR with template...

## Red Flags
- Never force-push to main
- Never skip CI checks
```

### How discovery works (Claude Search Optimization)

The `description` field is critical — it's what the agent reads to decide whether to load the skill:

- **Good**: `"Use when feature is complete and ready for review"` (triggering condition)
- **Bad**: `"A comprehensive workflow for creating pull requests with templates and review checklists"` (summary — agent reads this instead of loading the skill)

### Progressive disclosure (3 tiers)

1. **Description only** — agent sees `description` field, decides relevance
2. **Skill loaded** — full SKILL.md content enters context
3. **Supporting files** — referenced docs loaded on demand

This solves context overflow — 160K+ skills exist, but only relevant ones enter the context window.

---

## Galatea's Validation: Shadow Learning Experiment

We validated that LLM extraction from session transcripts produces useful knowledge:

| Metric | Target | Result |
|---|---|---|
| Precision | >70% | **~95%** |
| Recall | >50% | **~87%** |
| Usefulness | >60% | **~85%** |

Compare with Graphiti (graph DB approach from v1): **18-21% fact extraction quality**. The file-based approach with LLM extraction is 4-5x better than the database-centric approach.

The extracted knowledge maps directly to ecosystem formats:
- Preferences → CLAUDE.md entries
- Procedures → SKILL.md files
- Facts → CLAUDE.md or fact files
- Corrections → Updates to existing entries

---

## Why This Matters for New Projects

### 1. Reduced time-to-value

Instead of building routing, memory, tool access, and coordination infrastructure (months), you get it from the ecosystem (days). Focus on your unique value.

### 2. Portability

Knowledge captured as SKILL.md + CLAUDE.md travels between projects, agents, and platforms. No vendor lock-in, no proprietary schemas.

### 3. Composability

Skills compose naturally — a "deploy to production" skill can reference a "run tests" skill. MCP tools compose with skills. Agent Teams compose agents.

### 4. The learning loop

The most valuable property: skills can be generated from observation, validated through use, and improved through feedback. This creates a flywheel:

```
Observe developer → Extract knowledge → Write SKILL.md/CLAUDE.md
    ↑                                              │
    └──── Use in context → Track success ──────────┘
```

Each cycle makes the agent more useful. The ecosystem provides the format; you provide the learning pipeline.

---

## References

- [Galatea v2 Architecture Design](../plans/2026-02-11-galatea-v2-architecture-design.md) — Full architectural rationale
- [Shadow Learning Experiment](../archive/completed/phase-b/2026-02-11-shadow-learning-experiment.md) — Extraction validation (95% precision)
- [Learning Scenarios L1-L9](../plans/2026-02-11-learning-scenarios.md) — Detailed lifecycle examples
- [SKILL.md specification](https://www.skills.md/) — Open standard
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) — Tool access standard
- Kahneman, D. (2011). *Thinking, Fast and Slow* — System 1/2 mapping
- Tulving, E. (1972). *Episodic and Semantic Memory* — Memory type classification
- Bandura, A. (1977). *Social Learning Theory* — Learning by observation
