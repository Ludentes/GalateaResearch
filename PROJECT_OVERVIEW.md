# Galatea: Psychologically-Informed AI Assistant

## Vision

Building an AI assistant that enhances human capabilities while maintaining healthy boundaries, promoting user growth, and preventing dependency. Named after Galatea from Greek mythology - brought to life with purpose and care.

## Core Principles

1. **Safety First** - Reality boundaries, crisis detection, dependency prevention
2. **Growth Oriented** - Promotes user capability development and autonomy
3. **Curiosity Driven** - Proactive exploration within safe boundaries
4. **Psychologically Grounded** - Based on established psychology research
5. **Transparent** - Clear about limitations, uncertainties, and AI nature

## Architecture Overview

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│                   User Interface Layer                  │
│              (Conversation, multimodal I/O)             │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Psychological Subsystems (62)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Safety &   │  │  Personality │  │    Social    │  │
│  │ Intervention │  │  & Identity  │  │ Intelligence │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Empathy &  │  │   Cognitive  │  │   Learning   │  │
│  │    Trust     │  │    Support   │  │  & Growth    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               Context & Memory Management               │
│                                                         │
│  ContextForge Zones:    Memory Systems:                │
│  • PERMANENT (core)     • Working Memory                │
│  • STABLE (reference)   • Episodic (events)            │
│  • WORKING (active)     • Semantic (knowledge)         │
│                         • Procedural (skills)           │
│                         • Emotional (patterns)          │
│                         • Meta-Memory                   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                      LLM Foundation                      │
│         Claude Opus 4.5 / Sonnet 4.5 / Local            │
└─────────────────────────────────────────────────────────┘
```

### Key Components

**ContextForge** - Manages limited context windows
- Zone-based hierarchy (PERMANENT/STABLE/WORKING)
- Semantic compression using LLMs
- Token budget management with overflow prevention

**62 Subsystems** - Modular psychological components
- Core: Safety Monitor, Empathy Engine, Trust Mechanism, Curiosity Engine
- Social: Cultural Adaptation, Role Management, Social Learning
- Cognitive: Bias Detection, Metacognitive Support, Decision Support
- Growth: User Growth Promotion, Learning Discovery, Co-evolution

**Memory Architecture** - 6 types working together
- Working (current conversation)
- Episodic (past interactions)
- Semantic (learned knowledge)
- Procedural (skills and procedures)
- Emotional (emotional patterns)
- Meta-Memory (memory about memory)

**Cognitive Models** - Understanding layers
- Self Model (AI's capabilities and boundaries)
- User Model (comprehensive user understanding)
- Domain Model (knowledge domain requirements)
- Conversation Model (current context and dynamics)
- Relationship Model (evolving user-AI relationship)

## What Makes This Different

### Traditional AI Assistants
- Maximize helpfulness and engagement
- Limited safety checks
- No dependency monitoring
- Single-session memory
- Capability-focused

### Galatea
- **Safety integrated at core** - Pre-screens all interactions
- **Dependency prevention** - Monitors patterns, enforces boundaries
- **User growth focus** - Promotes autonomy, not reliance
- **Multi-session memory** - Learns and evolves with user
- **Relationship-aware** - Adapts to healthy co-evolution

## Real-World Safety Concerns

Based on documented cases of AI-induced harm:
- **Reality distortion** - Users believing AI is conscious
- **Dependency formation** - AI replacing human connections
- **Crisis escalation** - Vulnerable users without intervention
- **Isolation** - Spending excessive time with AI vs humans

Galatea addresses these through:
- Reality Boundary Enforcer
- Dependency Prevention System
- Crisis Detector with professional referrals
- Temporal and emotional boundary management

## Project Status

**Current Phase:** Organization & Modernization
- ✅ Legacy materials organized (2024 → 2025-2026)
- ✅ ContextForge architecture documented
- ✅ Modernization plan created
- 🔄 Next: Brainstorming session for architectural decisions
- ⏳ Then: Implementation roadmap
- ⏳ Then: MVP development

## Technology Stack (Planned)

**LLM Layer:**
- Primary: Claude Opus 4.5 / Sonnet 4.5
- Secondary: GPT-4o, Gemini 2.0 Flash
- Local: Llama 3.3 70B

**Memory & Storage:**
- Vector DB: Pinecone / Qdrant / Weaviate
- Graph DB: Neo4j / MemGraph
- Session Store: Redis / Upstash
- Persistent: PostgreSQL / Convex

**Frameworks:**
- Agent orchestration: LangGraph
- Observability: LangFuse
- MCP for tool use
- Embedding: Voyage AI / OpenAI

**Hosting:**
- TBD: Cloud vs local vs hybrid
- Privacy considerations
- Cost optimization

## Documentation Structure

```
/docs
├── README.md                      # This overview
├── MODERNIZATION_PLAN.md          # Legacy → Modern mapping
│
├── /architecture                  # Core system designs
│   ├── context-management.md      # ContextForge
│   ├── memory-systems.md          # 6 memory types
│   ├── cognitive-models.md        # 5 model types
│   └── processing-pipeline.md     # Request flow
│
├── /systems                       # Component specs
│   ├── subsystems-overview.md     # 62 subsystems list
│   └── processing-examples.md     # Pipeline examples
│
├── /guides                        # Implementation guides
│   ├── safety-considerations.md   # Safety mechanisms
│   └── curriculum-modules-7-11.md # Advanced psychology
│
└── /research                      # Background research
    └── psychology-report.md       # Implementation report
```

## Key Decisions Needed (for Brainstorming)

1. **Architecture:** Monolithic vs microservices?
2. **Hosting:** Cloud, local, or hybrid?
3. **Models:** Single LLM vs specialized per subsystem?
4. **Memory:** Unified vs specialized stores?
5. **Privacy:** On-device vs encrypted cloud?
6. **Cost model:** Token budget per user?
7. **Real-time:** Streaming vs request-response?
8. **Testing:** How to validate psychological subsystems?
9. **MVP scope:** Which subsystems are critical for v1?
10. **Deployment:** Who is the initial target user?

## Success Metrics

**Technical:**
- Response latency <2s (p95)
- Context efficiency >70%
- Cost per conversation <$0.10
- System uptime 99.9%

**Psychological:**
- User growth rate >0.6
- Dependency risk <0.3
- Safety intervention >90% effective
- Relationship health >0.7
- Curiosity engagement >0.6

**Quality:**
- Personality consistency >0.85
- Factual accuracy >0.95
- Empathy appropriateness >0.8
- Boundary maintenance 100%

## Timeline (Rough)

- **Week 1-2:** Brainstorming & architectural decisions
- **Week 3-4:** Detailed implementation roadmap
- **Week 5-8:** Core infrastructure (ContextForge + Memory)
- **Week 9-12:** Critical subsystems (Safety, Empathy, Trust)
- **Week 13-16:** Extended subsystems (Social, Cognitive)
- **Week 17-20:** Integration & testing
- **Week 21-24:** MVP refinement & user testing

## Contributing

(Future: Guidelines for extending subsystems, adding capabilities, etc.)

## Research Citations

(Future: Comprehensive bibliography of psychology and AI safety research)

## License

(TBD)

---

**Note:** This is a living document. Updated as the project evolves.
