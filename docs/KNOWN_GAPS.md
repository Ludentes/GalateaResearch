# Known Gaps: v2 Architecture

**Date:** 2026-02-13 (updated)
**Context:** Gap analysis from v2 architecture redesign, updated with end-to-end trace findings.
**Architecture:** See [v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md)
**Trace:** See [End-to-End Trace](plans/2026-02-13-end-to-end-trace.md)

---

## Identified Gaps

| # | Gap | Severity | Status | Resolution |
|---|-----|----------|--------|------------|
| 1 | **Shadow learning pipeline** | Critical | ✅ Phase B | Six-module pipeline: Transcript Reader → Signal Classifier → Knowledge Extractor → Store → Context Assembler. |
| 2 | **Heartbeat mechanism** | High | 📋 Phase D | tick() function implements the heartbeat: self-model → homeostasis → channel scan → LLM action. See Phase D Task 8. |
| 3 | **Memory overflow** | Medium | 📋 Deferred | Start with CLAUDE.md (Tier 1). Design clean upgrade path to RAG/Mem0 (Tier 3) when needed. |
| 4 | **Temporal validity** | Medium | 📋 Phase E | Convention: custom metadata in SKILL.md frontmatter (`valid_until`, `confidence`) + lifecycle management code. Moved from Phase D to Phase E (homeostasis refinement). |
| 5 | **Skill auto-generation** | High | 📋 Phase F | Pipeline from extracted procedures → SKILL.md files. Needs code (template + LLM formatting). Moved from Phase E to Phase F (skills + visualization). |
| 6 | **Cognitive models** | Medium | ✅ Phase C | Not separate structures. `KnowledgeEntry.about` field enables predicate-style tagging. Models are views: `entries.filter(e => e.about?.type === "user")`. |
| 7 | **ThinkingDepth pattern** | Low | 📝 Documented | L0-L4 cognitive effort scaling appears in multiple domains (self-assessment, task routing, extraction). Currently NOT abstracted (YAGNI). Abstract when implementing second internal instance. See `server/engine/homeostasis-engine.ts`. |
| 8 | **Feedback loop broken** | Critical | 📋 Phase D | End-to-end trace revealed: extraction works but `retrievedFacts` is always `[]` — nothing retrieved, nothing influences behavior. Phase D closes the loop: entity-based retrieval → wire into chat → tick() decisions. See `docs/plans/2026-02-13-end-to-end-trace.md`. |
| 9 | **Supersession has no code path** | Medium | 📋 Phase D | `supersededBy` field exists in `KnowledgeEntry` type but no code ever populates it. Contradictions accumulate. Phase D Task 9 adds `supersedeEntry()`. |
| 10 | **knowledge.md is dead artifact** | Low | 📋 Phase D | Rendered by context assembler but never referenced by any downstream consumer. Phase D Task 10 removes it or repurposes it. |

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
| Confidence decay / archival | Phase E — when memory grows large enough (60+ days) |
| pgvector / embedding search | When text search insufficient (500+ facts) |
| Contradiction resolution (advanced) | When simple supersession isn't enough |
| Safety & boundaries system | Before production deployment |
| Persona marketplace | After validating demand |

### Fundamental Design Questions

#### 11. Session model is unclear

**Severity:** High
**Status:** 📋 Open

The current architecture has no clear definition of what a "session" is. We have Claude Code conversation files (`.jsonl`) that we extract from, but:

- What constitutes a new session? A new Claude Code conversation? A new day? A topic change?
- The current extraction operates on entire conversation files, not bounded sessions
- Most real-world scenarios need **prebuilt session templates** — a developer session looks completely different from a PM session
- The system currently treats every Claude Code transcript the same way, regardless of what kind of work was being done
- There's no session metadata (who, what project, what phase of work) — just raw transcript

This matters because retrieval quality depends on knowing the context of when knowledge was created. A fact learned during a debugging session has different weight than one from an architecture review.

#### 12. "Work" is not modeled — the agent has no work execution model

**Severity:** Critical
**Status:** 📋 Open

Two related but distinct problems:

**A. The agent doesn't know how to _do_ work.** Shadow learning (extracting knowledge from transcripts) is valuable but secondary. The primary value of an AI agent is **doing things** — writing code, producing documents, running analyses. Currently there is no model for:
- What constitutes a "task" the agent can execute autonomously
- How to break work into steps (explore → decide → implement → verify)
- How to use tools (file reads, code execution, API calls) as part of work
- How to know when work is done vs. stuck
- How to hand off or escalate

**B. The knowledge pipeline only extracts from chat text, not from work traces.** The current pipeline assumes work = conversation transcript. In reality:

**For a developer**, work is a long process of:
- Interacting with Claude Code using skills and slash commands
- Linking correct artifacts (files, docs, tickets)
- Brainstorming approaches before implementation
- Reviewing code, running tests, iterating
- The meaningful knowledge is scattered across tool calls, file edits, and decisions — not neatly in user messages

**For a PM**, work is:
- Loading the correct documents and context
- Analyzing existing artifacts against requirements
- Producing new documents (specs, plans, status updates)
- Brainstorming with the AI assistant
- The knowledge is in document transformations and decision rationale, not chat

The current extraction pipeline only sees `[USER]: text` and `[ASSISTANT]: text`. It misses:
- Which files were read/modified (tool use context)
- What skills/workflows were invoked
- The arc of a work session (explore → decide → implement → verify)
- Cross-session continuity (this session continues where yesterday's left off)

**Implication:** Shadow learning captures what was *said*, but the agent can't act on it. A work execution model is the prerequisite for the agent being useful beyond passive knowledge accumulation.

#### 13. Local LLM hallucination requires strict prompts

**Severity:** High
**Status:** 📋 Open

Sporadic verification tests reveal Ollama models (glm-4.7-flash, gemma3:12b) hallucinate — inventing facts, misclassifying types, producing confident but wrong `about` fields. This was quantified during extraction eval experiments (best local model: gemma3:12b at 57% overall accuracy vs Gemini 2.0 Flash at 59%).

Even when moving to larger local models, we cannot rely on model quality alone. Every LLM-facing prompt must be:
- Strictly structured with explicit type decision trees (not "classify as appropriate")
- Augmented with heuristic hints (known people, entities) to ground the model
- Validated with schema enforcement (`generateObject` + Zod)
- Tested against a gold-standard dataset (Langfuse `extraction-gold-standard`, 52 items)

This applies to all LLM touchpoints: extraction, L2 homeostasis assessment, tick response generation, and any future LLM-driven features.

---

*Previous gap analysis (Phase 2) archived to `archive/pre-v2/`*
