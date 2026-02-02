# Galatea Documentation

This directory contains all architectural documentation, design decisions, and research materials.

## Key Documents

| Document | Description |
|----------|-------------|
| **[PSYCHOLOGICAL_ARCHITECTURE.md](PSYCHOLOGICAL_ARCHITECTURE.md)** | Full architecture design - homeostasis, memory, models |
| **[FINAL_MINIMAL_ARCHITECTURE.md](FINAL_MINIMAL_ARCHITECTURE.md)** | Implementation roadmap - 10 weeks, 6 phases |
| **[GUIDING_PRINCIPLES.md](GUIDING_PRINCIPLES.md)** | Core principles - pragmatical, iterative, reuse |
| **[REFERENCE_SCENARIOS.md](REFERENCE_SCENARIOS.md)** | Test scenarios for validation |

## Design Documents (`/plans`)

| Document | Description |
|----------|-------------|
| **[BRAINSTORM_QUEUE.md](plans/BRAINSTORM_QUEUE.md)** | Open research questions |
| **[2026-02-02-homeostasis-architecture-design.md](plans/2026-02-02-homeostasis-architecture-design.md)** | Homeostasis decision record |
| **[2026-02-02-memory-system-design.md](plans/2026-02-02-memory-system-design.md)** | Graphiti memory design |

## Research (`/research`)

Agent deconstructions and psychology research:
- OpenClaw, Cline, GPT-Engineer analysis
- MAGELLAN, WorldLLM, Reflexion patterns
- Tools landscape survey
- Psychology implementation report

## Architecture Overview

```
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
| Three layers | Guidance → Homeostasis → Guardrails |

## Project Status

**Research Complete, Implementation Ready**

See [FINAL_MINIMAL_ARCHITECTURE.md](FINAL_MINIMAL_ARCHITECTURE.md) for the 10-week implementation roadmap.

---

*Last Updated: 2026-02-02*
