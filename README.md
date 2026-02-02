# Galatea: Psychologically-Architected AI Agent

> **Thesis**: Psychological Architecture + LLM > Plain LLM

An AI agent framework that adds psychological architecture between stimulus and response, enabling persistence, self-regulation, and continuous learning.

## Quick Start

**Start here:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - Complete vision, architecture, and decisions

## What is Galatea?

Current AI agents are stimulus-response machines: `prompt → LLM → response`

Galatea adds psychological architecture:
```
prompt → [Homeostasis + Memory + Models] → LLM → response
                      ↑
              continuous learning
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **Homeostasis Engine** | 6 dimensions that drive emergent behavior (knowledge, certainty, progress, communication, engagement, learning) |
| **Memory System** | Graphiti temporal knowledge graph with episodic, semantic, and procedural memory |
| **Cognitive Models** | Self, User, Domain, and Relationship models for context |
| **Three-Layer Architecture** | Explicit Guidance → Homeostasis → Guardrails |

### Key Innovation

Instead of 12+ discrete subsystems (Curiosity Engine, Motivation Engine, etc.), behavior **emerges** from maintaining balance across 6 homeostasis dimensions. "Curiosity" emerges when knowledge_sufficiency is LOW.

## Project Status

**Current Phase**: Research Complete, Ready for Implementation

| Phase | Status |
|-------|--------|
| Psychology research | ✅ Complete |
| Architecture design | ✅ Homeostasis-based |
| Memory system design | ✅ Graphiti + FalkorDB |
| Implementation roadmap | ✅ 10-week plan |
| Implementation | ⏳ Not started |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Memory | Graphiti + FalkorDB |
| Backend | Convex (ContextForge reuse) |
| LLM | Claude Sonnet 4 via OpenRouter |
| Tools | MCP ecosystem (1000+ servers) |
| Embeddings | Voyage AI |

## Documentation

```
galatea/
├── PROJECT_OVERVIEW.md              # Start here - executive summary
├── docs/
│   ├── PSYCHOLOGICAL_ARCHITECTURE.md # Full architecture design
│   ├── FINAL_MINIMAL_ARCHITECTURE.md # Implementation roadmap
│   ├── GUIDING_PRINCIPLES.md        # Core principles
│   ├── REFERENCE_SCENARIOS.md       # Test scenarios
│   └── plans/
│       ├── BRAINSTORM_QUEUE.md      # Open research questions
│       ├── 2026-02-02-memory-system-design.md
│       └── 2026-02-02-homeostasis-architecture-design.md
└── archive/
    └── 2024-original/               # Original psychology research
```

## Guiding Principles

| Principle | Meaning |
|-----------|---------|
| **Pragmatical** | Practice is the criterion of truth |
| **Iterative** | Useful at every step |
| **Reuse** | Team of one leverages thousands |

## Test Instantiations

We prove the thesis via two personas:

1. **"Programmer in the box"** - Expo/React Native specialist that shadow-learns from user's coding
2. **"Personal assistant"** - General helper with same core, different thresholds

Same homeostasis dimensions, different configurations. If both work well → thesis proven.

## Research Foundation

Based on established psychology:
- Self-Determination Theory (Autonomy, Competence, Relatedness)
- Goal Theory, Metacognition, Learning Theory
- Memory research (Episodic, Semantic, Procedural)

See `archive/2024-original/Modules 1-11.md` for full psychology curriculum.

## License

TBD

---

*Last Updated: 2026-02-02*
*Status: Research complete, implementation ready*
