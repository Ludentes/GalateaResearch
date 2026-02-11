# Known Gaps: v2 Architecture

**Date:** 2026-02-11
**Context:** Gap analysis from the v2 architecture redesign brainstorm session.
**Architecture:** See [v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md)

---

## Identified Gaps

| # | Gap | Severity | Resolution Direction |
|---|-----|----------|---------------------|
| 1 | **Shadow learning pipeline** | Critical | Prototype the shadow-learning skill. Determine if extraction can be a skill or needs code. |
| 2 | **Heartbeat mechanism** | High | Emerges from homeostasis — needs a long-running process or scheduled trigger for periodic dimension re-evaluation. |
| 3 | **Memory overflow** | Medium | Start with CLAUDE.md (Tier 1). Design clean upgrade path to RAG/Mem0 (Tier 3) when needed. |
| 4 | **Temporal validity** | Medium | Convention: custom metadata in SKILL.md frontmatter (`valid_until`, `confidence`) + lifecycle management code. |
| 5 | **Skill auto-generation** | High | Pipeline from extracted procedures to SKILL.md files. Needs code (template + LLM formatting). |

---

## What v2 Resolves vs Defers

### Resolved by v2 Architecture

These were gaps in Phase 2-3 that the v2 pivot eliminates:

| Old Gap | How v2 Resolves |
|---------|----------------|
| Graphiti 18-21% extraction quality | File-based memory (CLAUDE.md/SKILL.md) replaces Graphiti for primary storage |
| Custom context assembler complexity | Replaced by Skills progressive disclosure + CLAUDE.md |
| Activity Router misclassification | Replaced by skill availability as routing signal |
| PostgreSQL fact/procedure tables | Replaced by standard file formats |
| Cognitive model integration | Becomes CLAUDE.md entries, not custom code |
| Episode storage dependency on Graphiti | Event logs as files; Graphiti only if Tier 3 needed |

### Deferred (not needed yet)

| Item | When Needed |
|------|-------------|
| Multi-agent coordination | When deploying 2+ agents (leverage Agent Teams) |
| Cross-agent pattern detection | When multiple agents shadow same team |
| Confidence decay / archival | When memory grows large enough (60+ days) |
| pgvector / embedding search | When text search insufficient (500+ facts) |
| Contradiction resolution (advanced) | When simple supersession isn't enough |
| Safety & boundaries system | Before production deployment |
| Persona marketplace | After validating demand |

---

*Previous gap analysis (Phase 2) archived to `archive/pre-v2/`*
