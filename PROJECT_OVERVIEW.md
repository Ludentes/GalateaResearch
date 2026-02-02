# Galatea: Psychologically-Architected AI Agent

## Thesis

**Psychological Architecture + LLM > Plain LLM**

Current AI agents are stimulus-response machines:
```
prompt → LLM → response
```

Galatea adds psychological architecture between stimulus and response:
```
prompt → [Homeostasis + Memory + Models] → LLM → response
                      ↑
              continuous learning
```

We prove this thesis by building agents with:
- **Persistence** (memory across sessions)
- **Understanding** (models of self, user, domain, relationships)
- **Self-Regulation** (homeostasis - maintaining balance)
- **Growth** (learning from observation)

---

## Guiding Principles

| Principle | Meaning | Test |
|-----------|---------|------|
| **Pragmatical** | Practice is the criterion of truth | Does this solve a real problem? |
| **Iterative** | Useful at every step | Could we stop here and have value? |
| **Reuse** | Team of one leverages thousands | Does this already exist? |

---

## Architecture Overview

### Three-Layer Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: EXPLICIT GUIDANCE                                              │
│  "When X happens, do Y"                                                  │
│  Handles anticipated situations with precise rules                       │
│  ├── Persona preprompts (coder, lawyer, buddy)                          │
│  ├── Domain rules (Expo patterns, code standards)                       │
│  └── Hard blocks ("never push to main", "never use Realm")              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: HOMEOSTASIS ENGINE                                             │
│  "Stay in balance"                                                       │
│  Handles NOVEL situations through dimension balance-seeking             │
│  6 Universal Dimensions (same for all personas)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: GUARDRAILS                                                     │
│  "Don't go too far in any direction"                                    │
│  Catches runaway behavior (over-research, over-ask, going dark)         │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Six Homeostasis Dimensions

| Dimension | Question | Psychology Root |
|-----------|----------|-----------------|
| Knowledge Sufficiency | "Do I know enough to proceed?" | Competence (SDT) |
| Certainty Alignment | "Does my confidence match my action?" | Metacognition |
| Progress Momentum | "Am I moving forward?" | Goal Theory |
| Communication Health | "Am I appropriately connected?" | Relatedness (SDT) |
| Productive Engagement | "Am I contributing value?" | Purpose/Meaning |
| Knowledge Application | "Am I balancing learning with doing?" | Learning Theory |

**Key insight**: Instead of 12+ discrete subsystems (Curiosity Engine, Motivation Engine, etc.), behavior **emerges** from maintaining balance. "Curiosity" emerges when knowledge_sufficiency is LOW.

### Memory System (Graphiti + FalkorDB)

**Decision**: Graphiti temporal knowledge graph, not simple RAG or Mem0.

**Why Graphiti is essential**:
- Hard rules must be guaranteed (not similarity-dependent)
- Temporal validity ("was true then, not now")
- Procedure success tracking
- Memory promotion (episode → fact → procedure)
- Cross-agent pattern detection

**Memory Types**:
| Type | Purpose | Example |
|------|---------|---------|
| Episodic | Events with timestamps | "Debugging auth took 45min" |
| Semantic | Facts with confidence | "Prefer Clerk over JWT" |
| Procedural | Trigger → steps | "When animation flickers → inline styles" |

**Cognitive Models**:
| Model | Purpose |
|-------|---------|
| Self Model | Agent's strengths, weaknesses, capabilities |
| User Model | User's preferences, expectations, expertise |
| Domain Model | Domain rules, risk levels, precision requirements |
| Relationship Model | Trust level, interaction history |

### Memory Promotion Hierarchy

```
episode → observation → fact → rule → procedure → shared
   │           │          │       │        │          │
   │           │          │       │        │          └─ Cross-agent pattern
   │           │          │       │        └─ Trigger → steps
   │           │          │       └─ Strong fact (high confidence)
   │           │          └─ Extracted knowledge
   │           └─ Pattern noticed
   └─ Raw event
```

---

## Key Decisions Made

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subsystem approach | Homeostasis (6 dims) | Simpler than 12+ subsystems, enables emergence |
| Memory backend | Graphiti + FalkorDB | Temporal reasoning, graph relationships, no JVM |
| Three-layer model | Guidance → Homeostasis → Guardrails | Handles known + novel + extreme cases |
| Context assembly | Guaranteed + Semantic + Procedural | Hard rules always present |

### Technology Stack

| Layer | Technology |
|-------|------------|
| Graph DB | FalkorDB (Redis-based, Cypher queries) |
| Memory | Graphiti (temporal knowledge graph) |
| Backend | Convex (from ContextForge, 70% reuse) |
| Frontend | React 19 + TypeScript (from ContextForge) |
| LLM | Claude Sonnet 4 via OpenRouter |
| Embeddings | Voyage AI |
| Tools | MCP ecosystem (1000+ servers) |
| Observability | LangFuse |

### What We're NOT Building

- ❌ 62 discrete subsystems (homeostasis replaces them)
- ❌ Custom vector DB (use Graphiti/FalkorDB)
- ❌ Custom embedding model (use Voyage AI)
- ❌ Mem0 (replaced by Graphiti for temporal needs)
- ❌ Multi-agent coordination initially (single agent first)

---

## Psychology Alignment

Our architecture is grounded in established psychology research:

| Psychology Principle | Our Implementation |
|---------------------|-------------------|
| Self-Determination Theory (Autonomy, Competence, Relatedness) | Homeostasis dimensions |
| Goal Theory | progress_momentum dimension |
| Metacognition | certainty_alignment, Self Model |
| Memory Types (Episodic, Semantic, Procedural) | Graphiti node types |
| Trust/Relationship dynamics | Relationship Model |

**Simplifications made** (acceptable for MVP):
- Emotional Memory → merged into episodic + user model
- Working Memory → implicit in context window
- Big Five personality → not explicit (future consideration)

**Our innovation**: Homeostasis as unifying principle. Novel but grounded in biological homeostasis and psychological balance theories.

---

## Open Research Questions

| Topic | Priority | Status |
|-------|----------|--------|
| Adaptive Model Selection + System 1/System 2 | MEDIUM | Documented, needs design |
| Threshold Calibration from Observation | MEDIUM | Open |
| Assessment Reliability (LLM self-assessment) | MEDIUM | Open |
| Cross-Agent Pattern Detection | LOW | Documented in memory design |
| Persona Specialization | LOW | Open |

See [BRAINSTORM_QUEUE.md](docs/plans/BRAINSTORM_QUEUE.md) for full details.

---

## Project Status

**Current Phase**: Research Complete, Ready for Implementation

| Phase | Status |
|-------|--------|
| Psychology research | ✅ Complete (Modules 1-11) |
| Architecture decision (Homeostasis vs Subsystems) | ✅ Homeostasis selected |
| Memory system design | ✅ Graphiti + FalkorDB |
| Implementation roadmap | ✅ 10-week plan |
| Implementation | ⏳ Not started |

---

## Implementation Roadmap (10 Weeks)

| Phase | Weeks | Focus | Deliverable |
|-------|-------|-------|-------------|
| 1 | 1-2 | Foundation | ContextForge fork + FalkorDB + Graphiti setup |
| 2 | 3-4 | Memory System | All node types, ingestion, context assembly |
| 3 | 5-6 | Homeostasis Engine | 6 dimensions, assessment, guidance |
| 4 | 7 | MCP Tools | Tool execution, approval gates |
| 5 | 8-9 | Learning | Memory promotion, invalidation, cross-agent |
| 6 | 10 | Personas | Preprompts, thresholds, export/import |

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Hard rules in context | 100% | Always present regardless of task |
| Relevant fact retrieval | >80% | Semantic search accuracy |
| Dimension-appropriate behavior | >85% | Agent acts per homeostasis state |
| Tool execution success | >85% | MCP tool success rate |
| Memory promotion correctness | Pass | Episodes → facts → procedures |
| User satisfaction | >8/10 | "Better than ChatGPT" rating |

**If all metrics met → Thesis proven!**

---

## Documentation Structure

```
/galatea
├── PROJECT_OVERVIEW.md              # This document
├── docs/
│   ├── GUIDING_PRINCIPLES.md        # Core principles
│   ├── PSYCHOLOGICAL_ARCHITECTURE.md # Full architecture design
│   ├── FINAL_MINIMAL_ARCHITECTURE.md # Implementation roadmap
│   ├── OBSERVATION_PIPELINE.md      # How observations become memories
│   ├── REFERENCE_SCENARIOS.md       # Test scenarios
│   └── plans/
│       ├── BRAINSTORM_QUEUE.md      # Open questions
│       ├── 2026-02-02-homeostasis-architecture-design.md
│       └── 2026-02-02-memory-system-design.md
└── archive/
    └── 2024-original/               # Original psychology research
        ├── Modules 1-11.md
        ├── models-architecture.md
        └── memory-architecture.md
```

---

## Safety Note

> **Safety subsystems are being researched separately.** This architecture assumes safety systems will wrap the entire system as a pre/post filter. Deferred components include:
> - Safety Monitor
> - Crisis Detector
> - Reality Boundary Enforcer
> - Dependency Prevention

---

## Test Instantiations

We prove the thesis via two instantiations:

1. **"Programmer in the box"** - Expo/React Native specialist
   - Shadow learns from user's vibe coding
   - Picks up tasks, writes code, communicates via Discord
   - Learns team patterns, preferences, hard rules

2. **"Personal assistant"** - General helper
   - Same homeostasis dimensions, different thresholds
   - Different domain knowledge, communication style

Same core, different personas. If both work well → thesis proven.

---

*Last updated: 2026-02-02*
*Status: Research complete, implementation ready*
