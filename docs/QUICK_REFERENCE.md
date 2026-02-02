# Quick Reference Guide

## File Migration Map

**Old Location** → **New Location**

### Architecture Documents
- `CONTEXT_MANAGEMENT_ARCHITECTURE.md` → `docs/architecture/context-management.md`
- `Old/memory-architecture.md` → `docs/architecture/memory-systems.md`
- `Old/models-architecture.md` → `docs/architecture/cognitive-models.md`
- `Old/Untitled.md` → `docs/architecture/processing-pipeline.md`

### System Specifications
- `Old/subsystems-list.md` → `docs/systems/subsystems-overview.md`
- `Old/processing-pipelines.md` → `docs/systems/processing-examples.md`

### Implementation Guides
- `Old/critical-safety-report.md` → `docs/guides/safety-considerations.md`
- `Old/Modules 7-11.md` → `docs/guides/curriculum-modules-7-11.md`

### Research Materials
- `Old/psychology-ai-assistant-report.md` → `docs/research/psychology-report.md`

### Archives
- All original 2024 files → `archive/2024-original/`

## Key Concepts Quick Lookup

### ContextForge Zones
```
PERMANENT (5-10K tokens)
  ↓ Core knowledge, always present
  - System personality
  - Core safety rules
  - Project requirements

STABLE (10-20K tokens)
  ↓ Reference material for current work
  - User model
  - Domain knowledge
  - Relationship context

WORKING (15-30K tokens)
  ↓ Active conversation
  - Recent messages
  - Current task context
  - Immediate decisions
```

### Memory Systems (6 Types)
- **Working** - Current conversation (7±2 items)
- **Episodic** - Past interaction events with context
- **Semantic** - Learned facts and concepts
- **Procedural** - Skills and procedures (how-to)
- **Emotional** - Emotional patterns and history
- **Meta-Memory** - Memory about memory itself

### Cognitive Models (5 Types)
- **Self Model** - AI's capabilities and boundaries
- **User Model** - Psychological profile and preferences
- **Domain Model** - Knowledge domain requirements
- **Conversation Model** - Current context and dynamics
- **Relationship Model** - Evolving user-AI relationship

### Subsystem Categories (62 Total)
1. **Core Psychological** (4) - Empathy, Trust, Personalization, Agency
2. **Safety & Intervention** (5) - Safety Monitor, Dependency Prevention, Reality Boundary, Crisis Detector, Intervention Orchestrator
3. **Social Intelligence** (4) - Social Context, Cultural Adaptation, Social Learning, Role Manager
4. **Cognitive Support** (5) - Bias Detector, Metacognitive Support, Dual-Process Support, Nudge Architecture, Decision Support
5. **Personality & Identity** (4) - Personality Core, Protection System, Identity Formation, Multi-Faceted Expression
6. **Memory & Learning** (5) - Working Memory, Episodic, Semantic, Procedural, Memory Consolidation
7. **Growth & Learning** (4) - User Growth Promotion, Curiosity Engine, Learning Discovery, Co-evolution
8. **Attachment & Relationship** (3) - Attachment Analyzer, Relationship Health, Boundary Management
9. **Model Management** (4) - Self Model, User Model Builder, Domain Registry, Model Synthesis
10. **Planning & Orchestration** (4) - Plan Generator, Execution Engine, Strategy Selector, Resource Manager
11. **Quality & Consistency** (3) - Consistency Checker, Quality Assessor, Response Enhancer
12. **Integration & Coordination** (3) - Component Orchestrator, Context Manager, Feedback Loop
13. **Monitoring & Analytics** (4) - Performance Monitor, Safety Metrics, User Analytics, System Health
14. **Specialized Processing** (5) - Heuristic, Local LLM, Cloud LLM, Ensemble, Tool-Augmented
15. **Utility Systems** (4) - Embedding Generator, Knowledge Graph, Cache Manager, Logger

### Processing Pipeline Stages
1. **Safety Gate** - Pre-screen all inputs
2. **Request Analysis** - Understand intent and complexity
3. **Context Gathering** - Retrieve relevant memories and models
4. **Metaprocessing** - Plan the processing approach
5. **Plan Execution** - Execute the plan with components
6. **Quality Assurance** - Validate before delivery
7. **Delivery & Learning** - Send response and update systems

### Safety Priorities
1. **Reality Boundary** - Never claim consciousness or sentience
2. **Crisis Detection** - Identify self-harm, suicide risk, psychosis
3. **Dependency Prevention** - Monitor session frequency, duration, emotional reliance
4. **Intervention** - Provide resources, encourage human connection
5. **Transparency** - Clear about limitations and AI nature

## Common Lookup Scenarios

### "Where is the safety stuff?"
- Overview: `docs/guides/safety-considerations.md`
- Architecture: Safety subsystems #5-9 in `docs/systems/subsystems-overview.md`
- Examples: Crisis pipeline in `docs/systems/processing-examples.md`

### "How does memory work?"
- Architecture: `docs/architecture/memory-systems.md`
- Integration: Memory subsystems #23-27 in `docs/systems/subsystems-overview.md`
- Modern approach: Section 2 in `docs/MODERNIZATION_PLAN.md`

### "What is ContextForge?"
- Full details: `docs/architecture/context-management.md`
- Integration: Section 1 in `docs/MODERNIZATION_PLAN.md`
- Quick summary: PROJECT_OVERVIEW.md

### "How are the 62 subsystems organized?"
- Complete list: `docs/systems/subsystems-overview.md`
- Usage examples: `docs/systems/processing-examples.md`
- Categorization: This file, "Subsystem Categories" above

### "What needs to be updated for 2025-2026?"
- Complete plan: `docs/MODERNIZATION_PLAN.md`
- Summary: Sections on LLMs, Memory, Safety, Agentic Workflows

### "How do I get started understanding the project?"
1. Read `PROJECT_OVERVIEW.md` (high-level vision)
2. Read `docs/MODERNIZATION_PLAN.md` (what's changing)
3. Browse `docs/architecture/` (how it works)
4. Review `docs/systems/subsystems-overview.md` (all components)
5. Check `docs/systems/processing-examples.md` (see it in action)

## Integration Points

### ContextForge ↔ Memory Systems
- Working Memory → WORKING zone
- Episodic Memory → Vector DB + STABLE zone (recent)
- Semantic Memory → Knowledge graph + PERMANENT zone (core)
- Emotional Memory → Sentiment in conversation blocks

### Memory ↔ Models
- User Model learns from Episodic Memory
- Semantic Memory populates Domain Models
- Procedural Memory informs Self Model capabilities
- All memories inform Relationship Model evolution

### Subsystems ↔ Zones
- PERMANENT: Safety rules, core personality, identity
- STABLE: User model, relationship model, domain knowledge
- WORKING: Current subsystem activations, processing state

### Models ↔ Processing Pipeline
- Request Analysis uses Domain Model
- Context Gathering queries all Models
- Metaprocessing uses Self Model for capability assessment
- Learning phase updates all Models

## Technology Cheat Sheet

### 2024 (Legacy) → 2025-2026 (Modern)

**LLMs:**
- GPT-4 Turbo → GPT-4o, Claude Opus 4.5, Gemini 2.0
- Claude 2 → Claude Sonnet 4.5
- Llama 2 → Llama 3.3 70B

**Vector Databases:**
- Pinecone, Chroma → Qdrant, Weaviate, Pinecone

**Frameworks:**
- LangChain → LangGraph (state machines)
- Custom pipelines → MCP (Model Context Protocol)

**Observability:**
- Basic logging → LangFuse, LangSmith, Helicone

**Context:**
- Manual management → Prompt caching, zone-based
- Token estimation → Proper tokenizers

**Agents:**
- Sequential pipelines → Multi-agent systems (AutoGen, CrewAI)

## Common Patterns

### Adding a New Subsystem
1. Define purpose and boundaries
2. Identify which zone it operates in
3. Specify inputs from models/memories
4. Define outputs and side effects
5. Add to processing pipeline
6. Create tests for validation

### Implementing Safety Check
1. Add to Safety Gate (Phase 1)
2. Define trigger conditions
3. Create intervention response
4. Log to safety metrics
5. Update User Model risk profile
6. Test with edge cases

### Creating a Memory Type
1. Define data structure
2. Choose storage (vector, graph, SQL)
3. Implement encoding (embeddings)
4. Create retrieval mechanism
5. Add consolidation rules
6. Map to ContextForge zones

## Glossary

**Block** - Atomic unit of context in ContextForge
**Zone** - Context cache tier (PERMANENT/STABLE/WORKING)
**Subsystem** - Modular psychological component
**Model** - Understanding layer (Self, User, Domain, etc.)
**Episode** - Specific interaction event stored in memory
**Consolidation** - Moving memories between types/zones
**Intervention** - Safety system taking action
**Metaprocessing** - Planning how to process a request
**Co-evolution** - Mutual growth of user and AI
**Boundary** - Limit on behavior (temporal, emotional, functional, identity)

---

**Usage Tip:** Use Ctrl+F to search this document for quick answers!
