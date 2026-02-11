# Galatea Documentation Changelog

## 2026-02-11: Phase B — Shadow Learning Pipeline

### Dedup Fix: Three-Path Detection + Source-Level Guard

Root cause: dedup used triple-AND gate (type match AND entity overlap AND Jaccard > 0.6) — all three signals unreliable across LLM runs. Re-extraction on the same 53MB session produced 177 entries with 0 duplicates caught.

**Changes:**
- Replaced triple-AND gate with three independent detection paths:
  - Path 1: Evidence Jaccard >= 0.5 + content Jaccard >= 0.2 (catches rephrased content)
  - Path 2: Content Jaccard >= 0.5 (catches entries without evidence)
  - Path 3: Embedding cosine similarity > 0.85 via Ollama nomic-embed-text (semantic dedup, graceful fallback)
- Added stop word removal to Jaccard tokenizer
- Added source-level dedup: re-extracting same session is instant no-op (`--force` to override)
- Fixed `schema.test.ts` missing `// @vitest-environment node` (was breaking all DB tests)

**Verification (Steps 1-10 of Phase B guide):**
- 76/76 tests pass (was 66 passing + 9 DB failures before fix)
- Extraction: 140 entries from 53MB Umka session (270 signal turns)
- Dedup: 58/177 caught on re-run (33% via Paths 1+2). Path 3 max cosine was 0.847 (just under 0.85 threshold)
- Source-level dedup: instant skip on re-extraction
- Context assembly: 12 rules in CONSTRAINTS, 17 preferences, 259 total entries
- Token budget: 7509/4000 (bloated from 2 runs — clean extraction is ~4000)
- Agent usefulness: 4.5/5 questions answered correctly with knowledge vs generic without

**Tech debt identified:**
- LLM consolidation (periodic cron to merge/distill entries) — needed for token budget
- Embedding threshold tuning (0.85 too high, 0.80 catches false positives on related facts)
- Confidence calibration (LLM outputs near-uniform 1.0)

### Phase B Verification Guide

Added **[Phase B Verification Guide](guides/2026-02-11-phase-b-verification-guide.md)** — 10-step guide for validating shadow learning pipeline with real data.

---

## 2026-02-11: v2 Architecture Redesign

### Major Pivot: 2 Components + Ecosystem

After evaluating Phase 2-3 implementation against the evolving agent ecosystem (Skills, MCP, Agent Teams), redesigned Galatea's architecture around **two core components** (Homeostasis + Memory-with-lifecycle) that leverage ecosystem standards instead of custom infrastructure.

### New Documentation

- **[v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md)** — Core architecture document
- **[Learning Scenarios](plans/2026-02-11-learning-scenarios.md)** — 9 scenarios tracing OBSERVE → EXTRACT → WRITE → USE

### Archived Documentation

Moved 22 deprecated documents to `archive/pre-v2/`:
- Phase 2-3 status docs (PHASE2_STATUS, PHASE3_COMPLETE, DEDUP_REDUNDANCY_ANALYSIS)
- Deprecated designs (DATA_MODEL, FINAL_MINIMAL_ARCHITECTURE, REFLEXION_COMPARISON)
- Deprecated API docs (activity-router, reflexion-loop)
- Deprecated plans (10 plan documents from Phase 2-3)

### Updated Documentation

- **README.md** — Rewritten for v2 architecture
- **DECISIONS.md** — Added v2 decisions, marked Phase 3 decisions as historical
- **KNOWN_GAPS.md** — Rewritten for v2 gaps
- **OPEN_QUESTIONS.md** — Updated all questions with v2 context
- **PSYCHOLOGICAL_ARCHITECTURE.md** — Added superseded header
- **TEST_CONTRACTS.md** — Added review-needed header
- **STAGE_G_FINDINGS.md** — Added context header
- **api/homeostasis-engine.md** — Added superseded header

### Key Changes

**Before (Phase 2-3)**:
- Custom Activity Router (4 levels, pattern-based classification)
- Custom Reflexion Loop (draft-critique-revise in TypeScript)
- Custom Context Assembler (6 sections, token budget)
- PostgreSQL tables for facts, procedures, gatekeeper_log
- Graphiti/FalkorDB as primary memory store
- Cognitive models as TypeScript classes

**After (v2)**:
- Skill availability as routing signal (replaces Activity Router)
- Draft-critique-revise as a SKILL.md (replaces Reflexion Loop)
- Skills progressive disclosure + CLAUDE.md (replaces context assembler)
- SKILL.md files for procedural knowledge (replaces procedures table)
- CLAUDE.md entries for semantic knowledge (replaces facts table)
- Homeostasis as sensors + guidance skill (replaces engine class)

### Code Cleanup (Pending)

The following server modules are deprecated and pending removal:
- `server/engine/activity-router.ts`, `server/engine/reflexion-loop.ts`
- `server/memory/context-assembler.ts`, `server/memory/cognitive-models.ts`, `server/memory/graphiti-client.ts`
- `server/db/queries/facts.ts`, `server/db/queries/procedures.ts`, `server/db/queries/gatekeeper-log.ts`
- `server/routes/api/memories/` (local-facts, search, episodes)
- `scripts/clear-*.ts`

---

## 2026-02-06: OpenTelemetry Observation Pipeline

### Major Decision: OTEL as Unified Backbone

After comprehensive research (see [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md)), adopted **OpenTelemetry (OTEL) as the unified observation pipeline backbone**.

### New Documentation

**Observation Pipeline Docs** ([observation-pipeline/](./observation-pipeline/)):
1. [00-architecture-overview.md](./observation-pipeline/00-architecture-overview.md) - OTEL-first system design
2. [01-claude-code-otel.md](./observation-pipeline/01-claude-code-otel.md) - Claude Code hooks implementation
3. [02-vscode-otel.md](./observation-pipeline/02-vscode-otel.md) - VSCode extension design
4. [03-linux-activity-otel.md](./observation-pipeline/03-linux-activity-otel.md) - System activity monitoring
5. [04-discord-otel.md](./observation-pipeline/04-discord-otel.md) - Discord bot (optional)
6. [05-browser-otel.md](./observation-pipeline/05-browser-otel.md) - Browser extension design
7. [06-mqtt-to-otel-bridge.md](./observation-pipeline/06-mqtt-to-otel-bridge.md) - Home Assistant/Frigate bridge
8. [README.md](./observation-pipeline/README.md) - Index and quick start

**Research Report**:
- [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md) - Comprehensive OTEL vs MQTT analysis

### Updated Documentation

**Core Architecture Docs**:
1. **[FINAL_MINIMAL_ARCHITECTURE.md](./FINAL_MINIMAL_ARCHITECTURE.md)**
   - Updated date to 2026-02-06
   - Added OTEL observation pipeline section
   - Updated "The Observation Pipeline" to reflect OTEL-first design

2. **[PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)**
   - Updated date to 2026-02-06
   - Added note about OTEL observation pipeline

3. **[OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)**
   - Complete rewrite for OTEL-first architecture
   - Added "Architectural Decision: OpenTelemetry as Unified Backbone" section
   - Updated pipeline architecture diagram to show OTEL Collector
   - Changed Layer 1 from "Activity Capture" to "Activity Sources (OTEL Emitters)"
   - Updated data schema to show OTEL event format
   - Added OTEL infrastructure setup section
   - Archived old ActivityWatch/extension examples

4. **[OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)**
   - Marked Question #1 "Logging & Observation Infrastructure" as ✅ RESOLVED
   - Added decision summary and links to OTEL docs
   - Collapsed original question into details tag (archived)
   - Updated summary table
   - Updated date to 2026-02-06

### Key Changes Summary

**Before (2026-02-02)**:
- Observation pipeline design was incomplete
- No decision on infrastructure (ActivityWatch vs custom vs LangFuse)
- MQTT mentioned for Home Assistant but no integration plan

**After (2026-02-06)**:
- ✅ OTEL adopted as unified backbone
- ✅ Complete implementation guides for all sources
- ✅ Infrastructure architecture (OTEL Collector config)
- ✅ MQTT→OTEL bridge designed for Home Assistant/Frigate
- ✅ Single ingestion API endpoint (POST /api/observation/ingest)
- ✅ Standardized OTEL event format across all sources

### Implementation Priority

**Phase 1 (MVP)**:
1. OTEL Collector setup
2. Claude Code observation (hooks)
3. Browser extension
4. Galatea ingest API

**Phase 2**:
5. VSCode extension
6. Linux activity monitoring

**Phase 3**:
7. MQTT→OTEL bridge (Home Assistant/Frigate)

### Benefits of OTEL Approach

1. **Single Interface**: Pipeline code only consumes OTEL events (no MQTT handling)
2. **Native Support**: Claude Code has built-in OTEL support via hooks
3. **Infrastructure Bridge**: OTEL Collector bridges MQTT→OTEL (no code needed)
4. **Extensible**: Add sources by emitting OTEL (VSCode, Browser, Discord)
5. **Ecosystem**: Integration with Langfuse (already using), Jaeger, Prometheus

### Breaking Changes

None. This is a new system design, not a refactor of existing code.

### Migration Notes

N/A - This is greenfield implementation.

---

## Previous Changes

See git history for changes before 2026-02-06.

---

*This changelog tracks major documentation updates and architectural decisions.*
