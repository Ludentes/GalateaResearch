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
| **[ROADMAP.md](ROADMAP.md)** | Development roadmap (Phases A-F) |
| **[KNOWN_GAPS.md](KNOWN_GAPS.md)** | Known gaps and deferred items with resolution status |
| **[REFERENCE_SCENARIOS.md](REFERENCE_SCENARIOS.md)** | Narrative scenarios for context |
| **[GUIDING_PRINCIPLES.md](GUIDING_PRINCIPLES.md)** | Core principles — pragmatic, iterative, reuse |

## Supporting Documents

| Document | Description |
|----------|-------------|
| **[PSYCHOLOGICAL_ARCHITECTURE.md](PSYCHOLOGICAL_ARCHITECTURE.md)** | Psychological foundations — homeostasis dimensions, ThinkingDepth |
| **[Learning Scenarios](plans/2026-02-11-learning-scenarios.md)** | 9 scenarios tracing OBSERVE → EXTRACT → WRITE → USE |
| **[End-to-End Trace](plans/2026-02-13-end-to-end-trace.md)** | Full system trace (Layers 1-3, cross-cutting X1-X6) |
| **[Phase D Plan](plans/2026-02-13-phase-d-revised.md)** | Current: Formalize + Close the Loop |
| **[Domain Model](plans/2026-02-13-domain-model.md)** | Projects, people, technologies on this machine |

## Design Documents (`/plans`)

| Document | Description |
|----------|-------------|
| **[Homeostasis Design](plans/2026-02-02-homeostasis-architecture-design.md)** | Homeostasis decision record (concept survives in v2) |
| **[Memory Research](plans/2026-02-02-memory-findings.md)** | Memory system research findings |
| **[Memory Lifecycle](plans/2026-02-07-memory-lifecycle.md)** | Memory consolidation/decay design |
| **[Cognitive Models](plans/2026-02-12-cognitive-models-design.md)** | Cognitive models as views over knowledge store |

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

- **`archive/pre-v2/`** — Phase 2-3 docs, pre-v2 plans, deprecated APIs
- **`archive/phase2a-exploration/`** — Graphiti/Mem0 benchmarking results
- **`archive/completed/`** — Completed Phase A/B/C plans and superseded Phase D

---

*Last Updated: 2026-02-13*
