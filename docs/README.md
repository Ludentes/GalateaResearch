# Galatea Documentation

This directory contains all architectural documentation, design decisions, and research materials.

## Key Documents

| Document | Description |
|----------|-------------|
| **[PSYCHOLOGICAL_ARCHITECTURE.md](PSYCHOLOGICAL_ARCHITECTURE.md)** | Full architecture design - activity router, homeostasis, memory, models |
| **[FINAL_MINIMAL_ARCHITECTURE.md](FINAL_MINIMAL_ARCHITECTURE.md)** | Implementation roadmap - 10 weeks, 6 phases |
| **[GUIDING_PRINCIPLES.md](GUIDING_PRINCIPLES.md)** | Core principles - pragmatical, iterative, reuse |
| **[REFERENCE_SCENARIOS.md](REFERENCE_SCENARIOS.md)** | Test scenarios for validation |

## Design Documents (`/plans`)

| Document | Description |
|----------|-------------|
| **[BRAINSTORM_QUEUE.md](plans/BRAINSTORM_QUEUE.md)** | Open research questions |
| **[2026-02-03-activity-routing-design.md](plans/2026-02-03-activity-routing-design.md)** | Activity routing & model selection (System 1/2) |
| **[2026-02-02-homeostasis-architecture-design.md](plans/2026-02-02-homeostasis-architecture-design.md)** | Homeostasis decision record |
| **[2026-02-02-memory-system-design.md](plans/2026-02-02-memory-system-design.md)** | Graphiti memory design |

## Supporting Documents

| Document | Description |
|----------|-------------|
| **[CONTEXTFORGE_REUSE.md](CONTEXTFORGE_REUSE.md)** | What we reuse from ContextForge (~70%) |
| **[ECOSYSTEM_REUSE.md](ECOSYSTEM_REUSE.md)** | MCP ecosystem, 1000+ tools |
| **[OBSERVATION_PIPELINE.md](OBSERVATION_PIPELINE.md)** | How observations become memories |
| **[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)** | Logging/observation infrastructure questions |

## Research (`/research`)

Agent deconstructions and psychology research:
- OpenClaw, Cline, GPT-Engineer analysis
- MAGELLAN, WorldLLM, Reflexion patterns
- Tools landscape survey
- Psychology implementation report

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 0: ACTIVITY ROUTER                                        │
│  Level 0 (Direct) → Level 1 (Pattern) → Level 2 (Reason) → Level 3 (Reflect) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: EXPLICIT GUIDANCE                                      │
│  Persona preprompts, domain rules, hard blocks                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: HOMEOSTASIS ENGINE (6 Dimensions)                      │
│  knowledge_sufficiency, certainty_alignment, progress_momentum  │
│  communication_health, productive_engagement, knowledge_application │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MEMORY LAYER (Graphiti + FalkorDB)                              │
│  Episodic, Semantic, Procedural + 4 Cognitive Models            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Homeostasis (6 dimensions) instead of 12+ subsystems |
| Memory | Graphiti + FalkorDB (not Mem0, not simple RAG) |
| Activity Routing | 4 levels (0-3), model selection per level |
| Four layers | Router → Guidance → Homeostasis → Guardrails |

## Archived Documents

Outdated documents that don't reflect current architecture have been moved to `/archive/2026-02-early-design/`:
- Old architecture docs (cognitive-models, memory-systems, etc.)
- MODERNIZATION_PLAN.md (referenced 62 subsystems)
- QUICK_REFERENCE.md (old file migration map)
- SYNTHESIS.md (Seven Layers architecture)

## Project Status

**Research Complete, Implementation Ready**

See [FINAL_MINIMAL_ARCHITECTURE.md](FINAL_MINIMAL_ARCHITECTURE.md) for the 10-week implementation roadmap.

---

*Last Updated: 2026-02-03*
