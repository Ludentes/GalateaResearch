# Galatea: Psychologically-Informed AI Assistant

> Building an AI assistant that enhances human capabilities while maintaining healthy boundaries and promoting growth.

## Quick Start

**New here?** Start with these documents:

1. **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Vision, architecture, and current status
2. **[docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md)** - How we're updating 2024 materials for 2025-2026
3. **[docs/README.md](docs/README.md)** - Complete documentation index

## What is Galatea?

An AI assistant with 62 psychological subsystems designed to:
- ✅ Maintain safety through reality boundaries and crisis detection
- ✅ Prevent unhealthy dependency while building healthy relationships
- ✅ Promote user growth and autonomy rather than reliance
- ✅ Use curiosity-driven exploration within safe boundaries
- ✅ Manage context intelligently with ContextForge architecture

## Project Structure

```
galatea/
├── README.md                  ← You are here
├── PROJECT_OVERVIEW.md        ← Start here for full context
│
├── docs/                      ← All documentation
│   ├── README.md              ← Documentation index
│   ├── MODERNIZATION_PLAN.md  ← Legacy → Modern tech mapping
│   │
│   ├── architecture/          ← Core system designs
│   │   ├── context-management.md
│   │   ├── memory-systems.md
│   │   ├── cognitive-models.md
│   │   └── processing-pipeline.md
│   │
│   ├── systems/               ← Component specifications
│   │   ├── subsystems-overview.md (62 subsystems)
│   │   └── processing-examples.md
│   │
│   ├── guides/                ← Implementation guides
│   │   ├── safety-considerations.md
│   │   └── curriculum-modules-7-11.md
│   │
│   └── research/              ← Background research
│       └── psychology-report.md
│
├── archive/                   ← Original 2024 materials
│   └── 2024-original/
│
└── .claude/                   ← Claude Code configuration
    └── skills/
```

## Core Architecture

**Three Layers:**
1. **Context & Memory** - ContextForge zones + 6 memory types
2. **Psychological Subsystems** - 62 modular components
3. **LLM Foundation** - Claude Opus/Sonnet 4.5 + alternatives

**Key Innovation:** Zone-based context management (PERMANENT/STABLE/WORKING) integrated with psychological subsystems for intelligent token budget usage.

## Current Status

🔄 **Phase:** Organization & Modernization
- ✅ Materials organized from 2024 → 2025-2026 structure
- ✅ ContextForge architecture documented
- ✅ Modernization plan created
- ⏭️ **Next:** Brainstorming session for architectural decisions

## Key Documents

### Essential Reading
- **PROJECT_OVERVIEW.md** - Complete vision and architecture
- **docs/MODERNIZATION_PLAN.md** - Technology updates needed
- **docs/architecture/context-management.md** - ContextForge system

### Deep Dives
- **docs/systems/subsystems-overview.md** - All 62 psychological components
- **docs/guides/safety-considerations.md** - Real-world safety cases
- **docs/research/psychology-report.md** - Implementation research

## Technology Stack (Planned)

- **LLMs:** Claude Opus 4.5, Sonnet 4.5, GPT-4o, Gemini 2.0 Flash
- **Memory:** Vector DB (Pinecone/Qdrant) + Graph DB (Neo4j)
- **Framework:** LangGraph for agent orchestration
- **Observability:** LangFuse for tracing and analytics
- **Hosting:** TBD (cloud vs local vs hybrid)

## Design Philosophy

### What Makes Galatea Different

**Traditional AI:** Maximize helpfulness → Risk dependency
**Galatea:** Balanced growth → Promote autonomy

Key principles:
- Safety integrated at core (not bolted on)
- Dependency prevention is a feature
- User growth > User satisfaction
- Transparent about limitations
- Enforces healthy boundaries

### Real-World Safety Concerns Addressed

Based on documented cases:
- ✅ Reality distortion (believing AI is conscious)
- ✅ Dependency formation (replacing human connections)
- ✅ Crisis escalation (vulnerable users without help)
- ✅ Social isolation (excessive AI interaction)

## Development Roadmap

**Immediate (Weeks 1-2):**
- [ ] Brainstorming session for architectural decisions
- [ ] Finalize technology choices
- [ ] Design integration strategy

**Near-term (Weeks 3-8):**
- [ ] Implement ContextForge core
- [ ] Set up vector database for memory
- [ ] Build safety subsystems

**Mid-term (Weeks 9-16):**
- [ ] Implement critical subsystems (30 of 62)
- [ ] Integration testing
- [ ] Personality system

**Long-term (Weeks 17-24):**
- [ ] Complete remaining subsystems
- [ ] MVP testing with users
- [ ] Refinement and optimization

## Questions for Brainstorming

1. Monolithic vs microservices architecture?
2. Cloud vs local vs hybrid hosting?
3. Single LLM vs specialized models?
4. Privacy-first vs feature-first?
5. MVP scope - which subsystems are critical?
6. Target user for initial release?
7. Cost model and budget per user?
8. Real-time streaming vs request-response?

## Contributing

(Guidelines coming soon)

## License

(TBD)

---

**Last Updated:** 2026-02-01
**Status:** Pre-development (organization phase)
**Version:** 0.1.0 (documentation only)
