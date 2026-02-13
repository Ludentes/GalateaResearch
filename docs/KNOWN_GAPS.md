# Known Gaps: v2 Architecture

**Date:** 2026-02-11
**Context:** Gap analysis from the v2 architecture redesign brainstorm session.
**Architecture:** See [v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md)

---

## Identified Gaps

| # | Gap | Severity | Status | Resolution |
|---|-----|----------|--------|------------|
| 1 | **Shadow learning pipeline** | Critical | ✅ Phase B | Six-module pipeline: Transcript Reader → Signal Classifier → Knowledge Extractor → Store → Context Assembler. |
| 2 | **Heartbeat mechanism** | High | 📋 Phase E | Emerges from homeostasis — needs a long-running process or scheduled trigger for periodic dimension re-evaluation. |
| 3 | **Memory overflow** | Medium | 📋 Deferred | Start with CLAUDE.md (Tier 1). Design clean upgrade path to RAG/Mem0 (Tier 3) when needed. |
| 4 | **Temporal validity** | Medium | 📋 Phase D | Convention: custom metadata in SKILL.md frontmatter (`valid_until`, `confidence`) + lifecycle management code. |
| 5 | **Skill auto-generation** | High | 📋 Phase E | Pipeline from extracted procedures → SKILL.md files. Needs code (template + LLM formatting). |
| 6 | **Cognitive models** | Medium | ✅ Phase C | Not separate structures. `KnowledgeEntry.about` field enables predicate-style tagging. Models are views: `entries.filter(e => e.about?.type === "user")`. |
| 7 | **ThinkingDepth pattern** | Low | 📝 Documented | L0-L4 cognitive effort scaling appears in multiple domains (self-assessment, task routing, extraction). Currently NOT abstracted (YAGNI). Abstract when implementing second internal instance. See `server/engine/homeostasis-engine.ts`. |

---

## What v2 Resolves vs Defers

### Resolved by v2 Architecture

These were gaps in Phase 2-3 that the v2 pivot eliminates:

| Old Gap | How v2 Resolves |
|---------|----------------|
| Graphiti 18-21% extraction quality | File-based memory (CLAUDE.md/SKILL.md) replaces Graphiti for primary storage |
| Custom context assembler complexity | Replaced by Skills progressive disclosure + CLAUDE.md |
| Activity Router misclassification | Replaced by skill availability as routing signal. Note: the L0-L4 "thinking depth" pattern was revived for homeostasis self-assessment (Phase C). See ThinkingDepth note in `server/engine/homeostasis-engine.ts`. |
| PostgreSQL fact/procedure tables | Replaced by standard file formats |
| Cognitive model integration | Not separate data structures. KnowledgeEntry has `about` field (Phase C) enabling predicate-style tagging: `about:{entity:"mary", type:"user"}`. Models are views over knowledge store filtered by `about.type`. See `server/memory/types.ts`. |
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
