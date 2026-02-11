# Galatea Documentation

Create off-the-shelf developer agents (and eventually any personal assistant) by shadowing real professionals, learning their unique processes, and deploying agents that behave like trained team members.

## Architecture (v2)

Galatea builds **two things**. Everything else leverages the ecosystem.

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

## Key Documents

| Document | Description |
|----------|-------------|
| **[v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md)** | Core architecture — homeostasis + memory-with-lifecycle, ecosystem integration |
| **[Learning Scenarios](plans/2026-02-11-learning-scenarios.md)** | 9 scenarios tracing OBSERVE → EXTRACT → WRITE → USE |
| **[GUIDING_PRINCIPLES.md](GUIDING_PRINCIPLES.md)** | Core principles — pragmatic, iterative, reuse |
| **[USER_STORIES.md](USER_STORIES.md)** | Feature requirements from user perspective (8 epics, 40+ stories) |
| **[REFERENCE_SCENARIOS.md](REFERENCE_SCENARIOS.md)** | Narrative scenarios for context (source for stories/contracts) |

## Supporting Documents

| Document | Description |
|----------|-------------|
| **[OBSERVATION_PIPELINE.md](OBSERVATION_PIPELINE.md)** | OTEL-first observation pipeline (7 event sources, 4 layers) |
| **[ECOSYSTEM_REUSE.md](ECOSYSTEM_REUSE.md)** | MCP ecosystem, Skills, Agent Teams landscape |
| **[PSYCHOLOGICAL_ARCHITECTURE.md](PSYCHOLOGICAL_ARCHITECTURE.md)** | Original architecture (partially superseded — psychological foundations survive) |
| **[STAGE_G_FINDINGS.md](STAGE_G_FINDINGS.md)** | Phase 3 testing findings (Graphiti quality issues, prompt insights) |
| **[DECISIONS.md](DECISIONS.md)** | Key technical decisions with rationale |
| **[KNOWN_GAPS.md](KNOWN_GAPS.md)** | Known gaps and deferred items |

## Design Documents (`/plans`)

| Document | Description |
|----------|-------------|
| **[Homeostasis Design](plans/2026-02-02-homeostasis-architecture-design.md)** | Homeostasis decision record (concept survives in v2) |
| **[Logging Architecture](plans/2026-02-02-logging-architecture-design.md)** | OTEL logging decision |
| **[Memory Research](plans/2026-02-02-memory-findings.md)** | Memory system research findings |
| **[MD Files Input Layer](plans/2026-02-03-md-files-input-layer.md)** | MD files for static content (aligns with CLAUDE.md/SKILL.md) |
| **[TanStack Architecture](plans/2026-02-03-system-architecture-tanstack.md)** | UI/full-stack architecture |
| **[Multi-Provider Streaming](plans/2026-02-04-multi-provider-streaming.md)** | Multi-provider LLM streaming |
| **[Memory Lifecycle](plans/2026-02-07-memory-lifecycle.md)** | Memory consolidation/decay design |
| **[Stage G Test Plan](plans/2026-02-10-stage-g-reference-scenario-testing.md)** | Reference scenario testing approach |

## Observation Pipeline (`/observation-pipeline`)

OTEL-first architecture for capturing user activity across 7 sources. Maps cleanly to v2 — output format changes from PostgreSQL/Graphiti to SKILL.md/CLAUDE.md files.

See [observation-pipeline/README.md](observation-pipeline/README.md) for details.

## Research (`/research`)

Agent deconstructions and psychology research:
- OpenClaw, Cline, GPT-Engineer analysis
- MAGELLAN, WorldLLM, Reflexion patterns
- Tools landscape survey, OTEL vs MQTT comparison
- Psychology implementation report

## Key Decisions (v2)

| Decision | Choice |
|----------|--------|
| Architecture | 2 components (Homeostasis + Memory-with-lifecycle) + ecosystem |
| Memory format | CLAUDE.md (semantic) + SKILL.md (procedural) + event logs (episodic) |
| Memory tiers | Tier 1: CLAUDE.md → Tier 2: structured files → Tier 3: RAG/Mem0 |
| Routing | Skill availability as routing signal (replaces custom Activity Router) |
| Observation | OTEL-first pipeline (7 event sources) |
| UI framework | TanStack Start |
| Events | OTEL for all sources (HomeAssistant/Frigate via MQTT-to-OTEL bridge) |

## Archived Documents

Outdated documents from earlier architecture iterations:

- **`archive/pre-v2/`** — Phase 2-3 implementation docs (PostgreSQL, Graphiti, Activity Router, Reflexion Loop, custom context assembler)
- **`archive/phase2a-exploration/`** — Graphiti/Mem0 benchmarking results

---

*Last Updated: 2026-02-11*
