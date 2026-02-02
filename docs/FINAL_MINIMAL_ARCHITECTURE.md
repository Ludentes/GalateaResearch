# Galatea: Final Minimal Architecture

**Date**: 2026-02-02
**Status**: Ready for Implementation
**Timeline**: 10 weeks to working core

---

## Foundation

### Guiding Principles
1. **Pragmatical** - Practice is the criterion of truth
2. **Iterative** - Useful at every step
3. **Reuse** - Team of one leverages thousands

### End Goal
**Prove: Psychological Architecture + LLM > Plain LLM**

Test via two instantiations:
- "Programmer in the box" (Expo/React Native specialist)
- "Personal assistant"

---

## What We're Building

### Core Architecture: Homeostasis-Based

After evaluating multiple approaches, we selected **homeostasis-based architecture** over 12+ discrete subsystems:

| Approach | Verdict |
|----------|---------|
| 12 Subsystems | Too complex, subsystems compete for context |
| Preprompts Only | Too brittle, no emergence |
| **Homeostasis-Based** | ✓ Balance of structure and emergence |

**Key insight**: Instead of separate Curiosity/Motivation/Initiative engines, behavior **emerges** from maintaining balance across 6 dimensions.

### The Three-Layer Model

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
│  ├── 6 Universal Dimensions (same for all personas)                     │
│  ├── Assessment: LOW / HEALTHY / HIGH per dimension                     │
│  └── Guidance: What to do when imbalanced                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: GUARDRAILS                                                     │
│  "Don't go too far in any direction"                                    │
│  Catches runaway behavior (over-research, over-ask, going dark)         │
│  Built into dimension HIGH states                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Six Homeostasis Dimensions

| # | Dimension | Question | When LOW | When HIGH |
|---|-----------|----------|----------|-----------|
| 1 | Knowledge Sufficiency | "Do I know enough?" | Research/ask | N/A |
| 2 | Certainty Alignment | "Does confidence match action?" | Ask before acting | Try instead of asking |
| 3 | Progress Momentum | "Am I moving forward?" | Diagnose/escalate | Slow down, verify |
| 4 | Communication Health | "Am I connected?" | Update team | Batch messages |
| 5 | Productive Engagement | "Am I contributing?" | Find work | Prioritize/delegate |
| 6 | Knowledge Application | "Learning vs doing?" | Pause to understand | Time to apply |

**Psychological grounding**: Each dimension maps to established psychological needs (Self-Determination Theory, Goal Theory, Metacognition research).

### Memory System: Graphiti + FalkorDB

**Decision**: Graphiti with FalkorDB backend (not Mem0, not basic RAG)

**Why Graphiti is essential**:
| Requirement | RAG | Mem0 | Graphiti |
|-------------|-----|------|----------|
| Hard rules guarantee | ❌ | ❌ | ✅ |
| Temporal validity | ❌ | ⚠️ | ✅ |
| Usage tracking | ❌ | ❌ | ✅ |
| Promotion/learning | ❌ | ❌ | ✅ |
| Cross-agent patterns | ❌ | ⚠️ | ✅ |

**Memory types**:
- **Episodic**: Events with timestamps ("Debugging auth took 45min")
- **Semantic**: Facts with confidence ("Prefer Clerk over JWT")
- **Procedural**: Trigger → steps ("When animation flickers → use inline styles")

**Cognitive models**:
- **Self Model**: Strengths, weaknesses, recent misses
- **User Model**: Preferences, expectations, expertise
- **Domain Model**: Rules, risk levels, precision requirements
- **Relationship Model**: Trust level, interaction history

See [2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md) for full design.

### The Observation Pipeline (4 Layers)

```
RAW ACTIVITY → ENRICHMENT → DIALOGUE → MEMORY FORMATION
(OS-level)    (guess intent) (validate) (store in Graphiti)
```

See [OBSERVATION_PIPELINE.md](OBSERVATION_PIPELINE.md) for full details.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GALATEA AGENT                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    LAYER 1: EXPLICIT GUIDANCE                           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────────────┐  │ │
│  │  │   Persona   │  │   Domain    │  │         Hard Blocks            │  │ │
│  │  │  Preprompts │  │   Rules     │  │  (never push to main...)       │  │ │
│  │  └─────────────┘  └─────────────┘  └────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   LAYER 2: HOMEOSTASIS ENGINE                           │ │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                 │ │
│  │  │  Knowledge    │ │   Certainty   │ │   Progress    │                 │ │
│  │  │  Sufficiency  │ │   Alignment   │ │   Momentum    │                 │ │
│  │  └───────────────┘ └───────────────┘ └───────────────┘                 │ │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                 │ │
│  │  │ Communication │ │  Productive   │ │   Knowledge   │                 │ │
│  │  │    Health     │ │  Engagement   │ │  Application  │                 │ │
│  │  └───────────────┘ └───────────────┘ └───────────────┘                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      MEMORY LAYER (GRAPHITI)                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────────────┐  │ │
│  │  │   Episodic   │ │   Semantic   │ │         Procedural             │  │ │
│  │  │   (events)   │ │   (facts)    │ │     (trigger → steps)          │  │ │
│  │  └──────────────┘ └──────────────┘ └────────────────────────────────┘  │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │  Self Model  │ │  User Model  │ │ Domain Model │ │ Relationship │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       EXECUTION LAYER                                   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────────────┐  │ │
│  │  │   Context    │ │    Tool      │ │           LLM                  │  │ │
│  │  │   Builder    │ │   Executor   │ │        Generation              │  │ │
│  │  │              │ │   (MCP)      │ │     (Claude Sonnet)            │  │ │
│  │  └──────────────┘ └──────────────┘ └────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE                                       │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │    FalkorDB    │  │     Convex     │  │        MCP Servers             │ │
│  │  (graph store) │  │   (backend)    │  │     (1000+ tools)              │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │   Voyage AI    │  │    LangFuse    │  │      Claude Sonnet 4           │ │
│  │  (embeddings)  │  │ (observability)│  │       (via OpenRouter)         │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What We're Reusing (Maximum Leverage)

### From ContextForgeTS (~75% reuse)

**Backend:**
- ✅ Convex with existing tables (sessions, blocks, templates, projects, workflows)
- ✅ Three-zone system (PERMANENT, STABLE, WORKING)
- ✅ Context assembly logic
- ✅ LLM integrations (Ollama, OpenRouter, Claude Code)
- ✅ Token tracking and budgets
- ✅ LangFuse observability

**Frontend:**
- ✅ React 19 + TypeScript
- ✅ UI components (shadcn/ui)
- ✅ Drag-and-drop
- ✅ Real-time updates
- ✅ Streaming display

**Time Saved: 6-10 weeks**

### From Ecosystem (~95% of tools)

**MCP Servers (1,000+):**
- ✅ Filesystem, GitHub, Brave Search, PostgreSQL
- ✅ Puppeteer, Slack, Google Drive
- ✅ Community servers (Docker, K8s, Notion, etc.)

**Claude Code Skills (20+):**
- ✅ Commit, review-pr, debug, docs
- ✅ Portable to preprompts

**Tools Available: 1,000+ immediately**

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Objective:** Fork ContextForge, set up Graphiti + FalkorDB

**Tasks:**
- [ ] Fork ContextForgeTS repository
- [ ] Rename project to Galatea
- [ ] Set up FalkorDB locally (Docker)
- [ ] Install Graphiti, configure with Claude
- [ ] Create TypeScript wrapper for Graphiti
- [ ] Test basic graph operations
- [ ] Update branding, README

**Deliverable:** Working Galatea instance with graph database ready

**Success Metric:** Can store and retrieve nodes/edges from FalkorDB

---

### Phase 2: Memory System (Weeks 3-4)

**Objective:** Implement full memory layer with all types

**Tasks:**
- [ ] Implement all node types (episodic, semantic, procedural, models)
- [ ] Implement edge types (provenance, structural, relationship)
- [ ] Build Memory Router (classification)
- [ ] Build Memory Gatekeeper (filter general knowledge)
- [ ] Implement ingestion pipeline
- [ ] Implement context assembly (query → prompt)
- [ ] Add memory panel to UI

**Deliverable:** Agent stores and retrieves typed memories

**Success Metric:** Context includes relevant hard rules, facts, procedures

**Key Schema:**
```typescript
type NodeType =
  | 'episodic' | 'observation'
  | 'semantic:fact' | 'semantic:preference' | 'semantic:policy' | 'semantic:hard_rule'
  | 'procedural'
  | 'model:self' | 'model:user' | 'model:domain' | 'model:relationship';

type EdgeType =
  | 'CONTRIBUTED_TO' | 'PROMOTED_TO' | 'SUPERSEDES' | 'PROVES' | 'CONTRADICTS'
  | 'HAS_RULE' | 'HAS_PREFERENCE' | 'HAS_PROCEDURE'
  | 'PREFERS' | 'USES' | 'EXPECTS';
```

---

### Phase 3: Homeostasis Engine (Weeks 5-6)

**Objective:** Implement 6-dimension homeostasis with guidance

**Tasks:**
- [ ] Create HomeostasisEngine class
- [ ] Implement assessment logic (hybrid: computed + LLM)
- [ ] Define guidance text for all dimension states
- [ ] Integrate with context builder
- [ ] Add homeostasis state to prompt construction
- [ ] Add homeostasis visualization to UI
- [ ] Test with reference scenarios

**Deliverable:** Agent behavior driven by dimension balance

**Success Metric:** Agent asks when knowledge LOW, proceeds when HEALTHY

**Core Implementation:**
```typescript
class HomeostasisEngine {
  dimensions = [
    'knowledge_sufficiency',
    'certainty_alignment',
    'progress_momentum',
    'communication_health',
    'productive_engagement',
    'knowledge_application'
  ];

  assess(context: AgentContext): Record<string, 'LOW' | 'HEALTHY' | 'HIGH'>;
  getGuidance(states: Record<string, string>): string;
  buildContext(task: string, agent: Agent): AssembledContext;
}
```

---

### Phase 4: MCP Tool Integration (Week 7)

**Objective:** Add MCP tool execution with approval gates

**Tasks:**
- [ ] Install Vercel AI SDK with MCP support
- [ ] Create tool execution tracking in Convex
- [ ] Implement MCP client initialization
- [ ] Add tool listing and execution
- [ ] Add approval gates for destructive tools
- [ ] Record tool usage in procedural memory
- [ ] Add tool history to UI

**Deliverable:** Agent can execute filesystem, GitHub, search tools

**Success Metric:** Tool success rate > 85%, procedure success_rate tracks

**Initial MCP Servers:**
- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-github`
- `@modelcontextprotocol/server-brave-search`

---

### Phase 5: Memory Promotion & Learning (Weeks 8-9)

**Objective:** Implement memory promotion pipeline

**Tasks:**
- [ ] Implement promotion rules engine
- [ ] Build consolidation process (episode → observation → fact)
- [ ] Implement non-lossy invalidation (supersede, don't delete)
- [ ] Handle edge cases (circular promotion, conflicts, cascade)
- [ ] Implement cross-agent pattern detection
- [ ] Add procedure success tracking
- [ ] Test with shadow learning scenario

**Deliverable:** Memories promote and update based on evidence

**Success Metric:** Procedures accumulate, success rates update

**Promotion Hierarchy:**
```
episode → observation → fact → rule → procedure → shared
```

---

### Phase 6: Personas & Instantiation (Week 10)

**Objective:** Same core, different personalities + export/import

**Tasks:**
- [ ] Create preprompts table in Convex
- [ ] Write core identity preprompt
- [ ] Write programmer persona (Expo specialist)
- [ ] Write assistant persona
- [ ] Implement threshold configuration per persona
- [ ] Add personality selector to UI
- [ ] Implement persona export (privacy-filtered)
- [ ] Implement persona import (with provenance)
- [ ] Test both instantiations

**Deliverable:** Can instantiate as Programmer OR Assistant; can export/share

**Success Metric:** Same core behaves differently based on persona

**Persona Config:**
```yaml
identity:
  name: "Expo Developer Agent"
  role: "Mobile developer"
  domain: "Expo / React Native"

thresholds:
  certainty_alignment:
    ask_threshold: "architecture/preference questions"
  communication_health:
    update_interval: "~2 hours during active work"

hard_blocks:
  - "push directly to main"
  - "use Realm database"
```

---

## Success Metrics (Testing the Thesis)

### Phase 2 (Memory)
- ✅ Hard rules ALWAYS appear in context (100%)
- ✅ Semantic search retrieves relevant facts (> 80% relevance)
- ✅ Procedures match appropriate triggers
- **Metric:** Context assembly includes correct memories

### Phase 3 (Homeostasis)
- ✅ Agent asks when knowledge_sufficiency LOW
- ✅ Agent proceeds when certainty_alignment HEALTHY
- ✅ Agent escalates when progress_momentum STALLING
- ✅ Agent updates team when communication_health LOW
- **Metric:** Dimension-appropriate behavior in > 85% of cases

### Phase 4 (Tools)
- ✅ Agent successfully executes tools
- ✅ Tool results inform responses
- ✅ Approval gates prevent unauthorized actions
- **Metric:** Tool success rate > 85%

### Phase 5 (Learning)
- ✅ Episodes promote to facts (2+ similar episodes)
- ✅ Procedure success_rate updates after use
- ✅ Superseded knowledge marked, not deleted
- **Metric:** Memory promotion occurs correctly

### Phase 6 (Instantiation)
- ✅ Programmer and Assistant behave distinctly
- ✅ Both share same homeostasis dimensions
- ✅ Export includes semantic + procedural, excludes episodic
- **Metric:** User rates both as "more helpful than ChatGPT"

**If all metrics met → Thesis proven!**

---

## Technical Stack Summary

| Layer | Technology | Reuse | Add |
|-------|-----------|-------|-----|
| **Frontend** | React 19 + TypeScript | 75% | Memory/homeostasis UI |
| **Backend** | Convex | 70% | Memory tables, homeostasis |
| **LLM** | Claude Sonnet 4 (via OpenRouter) | 100% | Homeostasis assessment |
| **Graph DB** | FalkorDB | 0% | Full integration |
| **Memory** | Graphiti | 0% | Full integration |
| **Tools** | MCP (1000+ servers) | 100% | Execution logic |
| **Embeddings** | Voyage AI | 0% | Integration |
| **Observability** | LangFuse | 90% | Homeostasis traces |

**Overall Reuse: 70%**
**Time to Working Core: 10 weeks**

---

## Code Structure (New Files)

```
galatea/
├── convex/
│   ├── schema.ts                 # ✏️ ADD: memory, homeostasis tables
│   ├── memories.ts               # 🆕 Memory CRUD via Graphiti
│   ├── homeostasis.ts            # 🆕 Dimension assessment
│   ├── preprompts.ts             # 🆕 Personality/persona management
│   ├── mcp.ts                    # 🆕 MCP tool execution
│   └── lib/
│       ├── graphiti.ts           # 🆕 Graphiti client wrapper
│       ├── falkordb.ts           # 🆕 FalkorDB connection
│       └── context-builder.ts    # 🆕 Prompt construction
│
├── src/
│   ├── lib/
│   │   ├── homeostasis/
│   │   │   ├── engine.ts         # 🆕 HomeostasisEngine class
│   │   │   ├── dimensions.ts     # 🆕 Dimension definitions
│   │   │   └── guidance.ts       # 🆕 Guidance text per state
│   │   ├── memory/
│   │   │   ├── types.ts          # 🆕 Node/edge type definitions
│   │   │   ├── ingestion.ts      # 🆕 Memory ingestion pipeline
│   │   │   ├── retrieval.ts      # 🆕 Query formulation, context assembly
│   │   │   └── promotion.ts      # 🆕 Promotion rules engine
│   │   └── context/
│   │       └── builder.ts        # 🆕 Full context assembly
│   │
│   ├── components/
│   │   ├── memory/
│   │   │   ├── MemoryPanel.tsx   # 🆕 Memory visualization
│   │   │   └── GraphView.tsx     # 🆕 Knowledge graph display
│   │   ├── homeostasis/
│   │   │   ├── StatePanel.tsx    # 🆕 Dimension states display
│   │   │   └── GuidanceView.tsx  # 🆕 Current guidance
│   │   └── persona/
│   │       ├── PersonaSelector.tsx # 🆕 Choose persona
│   │       └── ThresholdConfig.tsx # 🆕 Tune thresholds
│   │
│   └── hooks/
│       ├── useHomeostasis.ts     # 🆕 Homeostasis state hook
│       └── useMemory.ts          # 🆕 Memory query hook
│
└── docs/
    ├── PSYCHOLOGICAL_ARCHITECTURE.md  # ✅ Design doc
    ├── FINAL_MINIMAL_ARCHITECTURE.md  # ✅ This document
    ├── OBSERVATION_PIPELINE.md        # ✅ Observation design
    └── plans/
        ├── 2026-02-02-homeostasis-architecture-design.md  # ✅ Decision
        └── 2026-02-02-memory-system-design.md             # ✅ Memory design
```

---

## Configuration Files Needed

### .env.local
```bash
# Existing from ContextForge
VITE_CONVEX_URL=<auto-generated>
OLLAMA_URL=http://localhost:11434
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...

# New for Galatea
FALKORDB_URL=redis://localhost:6379
VOYAGE_AI_API_KEY=pa-...
```

### docker-compose.yml (for FalkorDB)
```yaml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data

volumes:
  falkordb_data:
```

### package.json additions
```json
{
  "dependencies": {
    "ai": "^6.0.39",                    // Vercel AI SDK (MCP support)
    "falkordb": "^5.0.0",               // FalkorDB client
    "graphiti-core": "^0.5.0",          // Graphiti (via REST wrapper)
    "voyage-ai": "^1.0.0"               // Voyage embeddings
  }
}
```

---

## What We're NOT Building

❌ 12+ discrete subsystems (homeostasis replaces them)
❌ Custom vector DB (use Graphiti/FalkorDB)
❌ Custom embedding model (use Voyage AI)
❌ Custom LLM (use Claude Sonnet)
❌ Complex UI from scratch (extend ContextForge)
❌ Mem0 (replaced by Graphiti)
❌ Multi-agent coordination initially (single agent first, then cross-agent)

---

## Risk Mitigation

### Risk 1: Graphiti TypeScript integration
**Mitigation:** Use REST API wrapper, contribute TypeScript bindings if needed

### Risk 2: FalkorDB learning curve
**Mitigation:** Start with basic Cypher queries, add complexity iteratively

### Risk 3: Homeostasis assessment reliability
**Mitigation:** Hybrid approach (computed metrics + LLM assessment), test with scenarios

### Risk 4: Memory promotion edge cases
**Mitigation:** Simple rules first, handle circular/conflicts with basic strategies

### Risk 5: Context size limits
**Mitigation:** Token budget management, guaranteed sections, truncation by priority

---

## Cost Estimates

### Development Time
- Phase 1: Foundation (15 hours)
- Phase 2: Memory System (25 hours)
- Phase 3: Homeostasis (20 hours)
- Phase 4: Tools (15 hours)
- Phase 5: Learning (20 hours)
- Phase 6: Personas (15 hours)
**Total: ~110 hours over 10 weeks**

### Infrastructure Costs (Monthly)
- Convex: $0 (free tier sufficient for MVP)
- OpenRouter: ~$50-100 (usage-based)
- FalkorDB: $0 (self-hosted Docker)
- Voyage AI: ~$10-20 (embedding costs)
- LangFuse: $0 (self-hosted or free tier)
**Total: ~$60-120/month**

---

## Related Documents

- **[PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)** - Full architecture design
- **[plans/2026-02-02-homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md)** - Homeostasis decision
- **[plans/2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md)** - Memory system design
- **[OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)** - Observation pipeline design
- **[REFERENCE_SCENARIOS.md](./REFERENCE_SCENARIOS.md)** - Test scenarios
- **[plans/BRAINSTORM_QUEUE.md](./plans/BRAINSTORM_QUEUE.md)** - Open questions

---

## Success Definition

**Galatea succeeds if:**

1. ✅ **Memory Works**: Context assembly includes hard rules (100%), relevant facts (>80%)
2. ✅ **Homeostasis Works**: Dimension-appropriate behavior (>85% accuracy)
3. ✅ **Learning Works**: Memories promote, procedures track success
4. ✅ **Tools Work**: MCP tool execution (>85% success rate)
5. ✅ **Personality Works**: Same core, different personas behave distinctly
6. ✅ **Better Than Plain LLM**: Users rate Galatea > ChatGPT (8+/10)

**If all 6 → Thesis proven! Psychological architecture > Plain LLM**

---

## Conclusion

We have:
- ✅ Clear architecture (Homeostasis + Memory + Models)
- ✅ Maximum reuse (70% from ContextForge, 95% tools from ecosystem)
- ✅ 10-week timeline (pragmatic, iterative)
- ✅ Success metrics (practice is the criterion)
- ✅ Risk mitigation (stay lean, pivot if needed)

**This aligns perfectly with our guiding principles:**
1. **Pragmatical** ✅ - Solves real problem (better than ChatGPT)
2. **Iterative** ✅ - Useful at every phase
3. **Reuse** ✅ - Leverages ContextForge + Graphiti + MCP ecosystem

**Ready to start building?**

---

*Architecture updated: 2026-02-02*
*Key changes: Homeostasis replaces 12 subsystems, Graphiti replaces Mem0*
*Next: Fork ContextForgeTS and begin Phase 1*
