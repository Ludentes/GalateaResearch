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

### The Four-Layer Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 0: ACTIVITY ROUTER                                                │
│  "What level of thinking does this need?"                               │
│  Classifies activity → Selects processing depth → Routes appropriately  │
│  ├── Level 0: Direct (no LLM) - tool calls, templates                   │
│  ├── Level 1: Pattern (Haiku) - procedure exists, simple tasks          │
│  ├── Level 2: Reason (Sonnet) - implement, review, answer               │
│  └── Level 3: Reflect (Sonnet + loop) - unknown, high-stakes            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
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
│  ├── Guidance: What to do when imbalanced                               │
│  └── May be skipped for Level 0-1 activities                            │
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
│  │                    LAYER 0: ACTIVITY ROUTER                             │ │
│  │  Classifies activity → Selects level & model → Routes to pipeline       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │ │
│  │  │  Level 0    │  │  Level 1    │  │  Level 2    │  │   Level 3    │  │ │
│  │  │  (Direct)   │  │  (Pattern)  │  │  (Reason)   │  │  (Reflect)   │  │ │
│  │  │   No LLM    │  │   Haiku     │  │   Sonnet    │  │  Reflexion   │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
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
│  │  (May be skipped for Level 0-1 activities)                              │ │
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
│  │    FalkorDB    │  │ TanStack Start │  │        MCP Servers             │ │
│  │  (graph store) │  │ + Drizzle ORM  │  │     (1000+ tools)              │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │   Voyage AI    │  │    LangFuse    │  │     LLM Models (Activity       │ │
│  │  (embeddings)  │  │ (observability)│  │     Router selects):           │ │
│  └────────────────┘  └────────────────┘  │  • Haiku (Level 0-1)           │ │
│                                          │  • Sonnet (Level 2-3)          │ │
│  ┌────────────────┐  ┌────────────────┐  └────────────────────────────────┘ │
│  │   Mosquitto    │  │  Better Auth   │                                     │
│  │  (MQTT broker) │  │     (auth)     │                                     │
│  └────────────────┘  └────────────────┘                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What We're Reusing (Maximum Leverage)

### From ContextForgeTS (~40% direct, ~30% adapted)

**Direct Port (copy with minimal changes):**
- ✅ Context assembly logic (`lib/context.ts`)
- ✅ Token counting (`lib/tokenizer.ts`)
- ✅ LangFuse observability (`lib/langfuse.ts`)
- ✅ Block positioning logic
- ✅ UI components (shadcn/ui)
- ✅ DnD components (@dnd-kit patterns)

**Adapted (pattern reuse, different implementation):**
- ✅ Server functions (Convex → TanStack Start server functions + Nitro API routes)
- ✅ Database schema (Convex → Drizzle ORM + PostgreSQL)
- ⚠️ Auth (Convex Auth → Better Auth) — deferred
- ✅ LLM integration (custom → AI SDK v6 multi-provider: ollama, openrouter, claude-code)
- ✅ Claude Code SDK integration (via ai-sdk-provider-claude-code)

**Not Reused (replaced):**
- ❌ Convex real-time subscriptions → polling/SSE
- ❌ Convex scheduled functions → external cron

**Time Saved: 4-6 weeks** (from patterns and component reuse)

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

### Phase 1: Foundation (Weeks 1-2) — COMPLETE

**Objective:** Create TanStack Start project, set up infrastructure

**Tasks:**
- [x] Create TanStack Start project (v1.158, Vite 7.3, Nitro 3.0.1-alpha.2)
- [x] Set up Drizzle ORM with PostgreSQL (4 tables: sessions, messages, personas, preprompts)
- [x] Define Phase 1 schema (sessions, messages, personas, preprompts + token columns)
- [ ] Set up Better Auth (password provider) — deferred, not needed for single-user dev
- [x] Set up FalkorDB locally (Docker Compose, port 16379, Browser on 13001)
- [x] Set up FalkorDB TypeScript client wrapper
- [x] Copy pure utilities from ContextForge (UI components, Tailwind theme, cn())
- [x] Basic chat UI with AI SDK v6 streaming
- [x] Multi-provider system (ollama, openrouter, claude-code) with runtime switching
- [x] Streaming via Nitro API route (`POST /api/chat`)
- [x] Token tracking (input/output/total per message)
- [x] Langfuse OTel observability (auto-enables with env vars)
- [x] 27/27 tests passing, 0 TS errors, 0 lint issues

**Deliverable:** Working Galatea instance with database + graph ready

**Success Metric:** Can store/retrieve from PostgreSQL and FalkorDB — **MET**

**Progress:** See [2026-02-04-phase1-progress.md](./plans/2026-02-04-phase1-progress.md)

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

### Phase 3: Homeostasis Engine + Activity Router (Weeks 5-6)

**Objective:** Implement 6-dimension homeostasis with guidance AND activity-level routing

**Tasks:**
- [ ] Create HomeostasisEngine class
- [ ] Implement assessment logic (hybrid: computed + LLM)
- [ ] Define guidance text for all dimension states
- [ ] **NEW:** Create ActivityRouter class
- [ ] **NEW:** Implement activity classification (Level 0-3)
- [ ] **NEW:** Implement model selection logic
- [ ] **NEW:** Implement Level 3 Reflexion loop
- [ ] Integrate with context builder
- [ ] Add homeostasis state to prompt construction
- [ ] Add homeostasis/routing visualization to UI
- [ ] Test with reference scenarios

**Deliverable:** Agent behavior driven by dimension balance AND appropriate processing depth

**Success Metric:** Agent asks when knowledge LOW, proceeds when HEALTHY; uses Haiku for simple tasks, Sonnet for complex

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

class ActivityRouter {
  classify(task: Task, procedure: Procedure | null, homeostasis: HomeostasisState): {
    level: 0 | 1 | 2 | 3;
    model: 'none' | 'haiku' | 'sonnet';
    reason: string;
  };

  route(classification: Classification, task: Task): Promise<Result>;
}
```

---

### Phase 4: MCP Tool Integration (Week 7)

**Objective:** Add MCP tool execution with approval gates

**Tasks:**
- [ ] Install Vercel AI SDK with MCP support
- [ ] Create tool execution tracking in Drizzle
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
- [ ] Create preprompts table in Drizzle
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

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | React 19 + TanStack Router v1.158 | Phase 1 DONE |
| **Backend** | TanStack Start v1.158 (Nitro 3.0.1-alpha.2, h3 v2) | Phase 1 DONE |
| **Database** | Drizzle ORM + PostgreSQL 17 (port 15432) | Phase 1 DONE |
| **Auth** | Better Auth | Deferred (single-user dev) |
| **LLM** | AI SDK v6 (`ai@6.0.69`) — multi-provider | Phase 1 DONE |
| | • ollama (default: llama3.2, local) | |
| | • openrouter (default: z-ai/glm-4.5-air:free) | |
| | • claude-code (Agent SDK, default: sonnet) | |
| **Streaming** | Nitro API route + client ReadableStream | Phase 1 DONE |
| **Graph DB** | FalkorDB (port 16379, Browser on 13001) | Phase 1 DONE |
| **Memory** | Graphiti | Phase 2 |
| **Events** | MQTT (Mosquitto, port 11883/19001) | Infrastructure ready |
| **Tools** | MCP (1000+ servers) | Phase 4 |
| **Embeddings** | Voyage AI | Phase 2+ |
| **Observability** | Langfuse (OTel via `@langfuse/otel`) | Phase 1 DONE |
| **Static Content** | MD files (Obsidian-friendly) | New |

**Code Reuse from ContextForge: ~40% direct + ~30% adapted**
**Time to Working Core: 10 weeks**

See [system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md) for full technical details.

---

## Code Structure (TanStack Start)

```
galatea/
├── app/                            # Frontend (React 19, TanStack Router)
│   ├── routes/
│   │   ├── __root.tsx              # Root layout (Tailwind, 404 page)
│   │   ├── index.tsx               # Home — session creation
│   │   └── chat/$sessionId.tsx     # Chat UI (streaming, provider switcher)
│   │   # Future:
│   │   # ├── memories/index.tsx    # Memory browser
│   │   # └── settings/index.tsx    # Configuration
│   │
│   ├── components/
│   │   ├── chat/                   # MessageList, ChatInput
│   │   # ├── memory/              # Memory browser (TanStack Table)
│   │   # ├── homeostasis/         # State panel
│   │   └── ui/                     # shadcn/ui (button, input, label, toast, etc.)
│   │
│   ├── lib/utils.ts                # cn() utility
│   └── styles/app.css              # Tailwind 4 theme (oklch colors, dark mode)
│
├── server/                         # Backend (Nitro 3.0.1-alpha.2)
│   ├── routes/                     # Nitro file-based API routes
│   │   └── api/
│   │       └── chat.post.ts        # POST /api/chat (streaming)
│   │   # Future:
│   │   # ├── observations.post.ts  # POST /api/observations
│   │   # └── dialogue.post.ts      # POST /api/dialogue
│   │
│   ├── plugins/
│   │   └── langfuse.ts             # Langfuse OTel tracing (auto-enables)
│   │
│   ├── providers/                  # Multi-provider LLM system
│   │   ├── index.ts                # getModel(provider?, model?) factory
│   │   ├── config.ts               # getLLMConfig(), DEFAULT_MODELS, VALID_PROVIDERS
│   │   ├── ollama.ts               # ollama-ai-provider wrapper
│   │   ├── openrouter.ts           # @openrouter/ai-sdk-provider wrapper
│   │   └── claude-code.ts          # ai-sdk-provider-claude-code wrapper
│   │
│   ├── functions/                  # Server functions + logic
│   │   ├── chat.ts                 # TanStack Start server function (non-streaming)
│   │   └── chat.logic.ts           # sendMessageLogic, streamMessageLogic, createSessionLogic
│   │   # Future:
│   │   # ├── memories.ts           # Memory CRUD
│   │   # ├── homeostasis.ts        # State updates
│   │   # └── personas.ts           # Persona management
│   │
│   │   # Future:
│   │   # ├── engine/               # Core Galatea logic
│   │   # │   ├── activity-router.ts
│   │   # │   ├── homeostasis-engine.ts
│   │   # │   ├── context-builder.ts
│   │   # │   └── reflexion.ts
│   │
│   ├── integrations/
│   │   └── falkordb.ts             # FalkorDB client (getFalkorDB, getGraph, closeFalkorDB)
│   │   # Future:
│   │   # ├── graphiti.ts           # Graphiti client
│   │   # ├── mqtt.ts               # MQTT subscriber
│   │   # └── mcp.ts                # MCP tool executor
│   │
│   └── db/
│       ├── schema.ts               # Drizzle schema (sessions, messages, personas, preprompts)
│       ├── index.ts                # DB client (postgres.js driver)
│       ├── seed.ts                 # Idempotent seed (2 personas, 2 preprompts)
│       └── migrations/
│
├── galatea-knowledge/              # MD files (Obsidian-friendly)
│   ├── personas/                   # Agent specs
│   ├── rules/                      # Hard rules
│   ├── domain/                     # Domain knowledge
│   └── procedures/                 # Step-by-step guides
│
├── docs/                           # Documentation
│   ├── plans/                      # Implementation plans + progress
│   └── FINAL_MINIMAL_ARCHITECTURE.md
│
├── docker-compose.yml              # PostgreSQL, FalkorDB, Mosquitto
├── vite.config.ts                  # TanStack Start + Nitro + Tailwind
├── drizzle.config.ts               # Drizzle Kit config
├── vitest.config.ts                # Vitest 4 config
└── biome.json                      # Biome 2.3.14 (double quotes, no semicolons)
```

See [system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md) for detailed code examples.

---

## Configuration Files Needed

### .env.local
```bash
# Database
DATABASE_URL=postgres://galatea:galatea@localhost:15432/galatea

# Auth (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=change-me-in-env-local

# LLM Provider (ollama | openrouter | claude-code)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
# OPENROUTER_API_KEY=sk-or-...
# ANTHROPIC_API_KEY=sk-ant-...

# Graph Memory
FALKORDB_URL=redis://localhost:16379

# Embeddings (optional for Phase 1)
# VOYAGE_AI_API_KEY=pa-...

# Events
MQTT_BROKER_URL=mqtt://localhost:11883

# Observability — Langfuse (set both keys to enable tracing)
# LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_BASE_URL=http://localhost:3000  # for self-hosted, omit for cloud

# Content
KNOWLEDGE_PATH=./galatea-knowledge
```

### docker-compose.yml
```yaml
services:
  postgres:
    image: postgres:17
    ports:
      - "15432:5432"           # Remapped to avoid Langfuse conflict
    environment:
      POSTGRES_DB: galatea
      POSTGRES_USER: galatea
      POSTGRES_PASSWORD: galatea
    volumes:
      - postgres_data:/var/lib/postgresql/data

  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "16379:6379"           # Remapped to avoid conflicts
      - "13001:3000"           # FalkorDB Browser UI
    volumes:
      - falkordb_data:/data

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "11883:1883"           # Remapped to avoid conflicts
      - "19001:9001"           # WebSockets
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  postgres_data:
  falkordb_data:
```

### package.json (key dependencies — as of Phase 1 completion)
```json
{
  "dependencies": {
    "@tanstack/react-start": "^1.158.0",
    "@tanstack/react-query": "^5.x",
    "@tanstack/react-router": "^1.158.0",
    "drizzle-orm": "^0.44.0",
    "postgres": "^3.4.0",
    "ai": "^6.0.69",
    "ollama-ai-provider": "^2.x",
    "@openrouter/ai-sdk-provider": "^0.x",
    "ai-sdk-provider-claude-code": "^0.x",
    "falkordb": "^0.x",
    "langfuse": "^3.x",
    "@langfuse/otel": "^1.x",
    "@opentelemetry/sdk-node": "^0.x"
  }
}
```
Note: `@ai-sdk/anthropic` removed in favor of multi-provider system. Better Auth deferred.

---

## What We're NOT Building

❌ 12+ discrete subsystems (homeostasis replaces them)
❌ Custom vector DB (use Graphiti/FalkorDB)
❌ Custom embedding model (use Voyage AI)
❌ Custom LLM (use Claude models via API)
❌ Complex UI from scratch (reuse ContextForge patterns)
❌ Mem0 (replaced by Graphiti)
❌ Convex (replaced by TanStack Start + Drizzle)
❌ Real-time sync framework (not needed for request/response + streaming)
❌ Multi-agent coordination initially (single agent first)

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
- PostgreSQL: $0 (self-hosted Docker)
- FalkorDB: $0 (self-hosted Docker)
- Ollama: $0 (local inference)
- OpenRouter: ~$0-50 (usage-based, free tier models available like z-ai/glm-4.5-air:free)
- Anthropic API: ~$20-100 (for claude-code provider, usage-based)
- Voyage AI: ~$10-20 (embedding costs, Phase 2+)
- Langfuse: $0 (self-hosted or free tier)
**Total: ~$30-170/month** (can be $0 with ollama + free OpenRouter models)

---

## Related Documents

### Architecture
- **[PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)** - Full architecture design
- **[plans/2026-02-03-system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md)** - TanStack Start implementation

### Design Decisions
- **[plans/2026-02-04-postgresql-everywhere.md](./plans/2026-02-04-postgresql-everywhere.md)** - PostgreSQL everywhere (drop SQLite)
- **[plans/2026-02-03-tech-stack-evaluation.md](./plans/2026-02-03-tech-stack-evaluation.md)** - Stack decision (TanStack vs Convex)
- **[plans/2026-02-03-activity-routing-design.md](./plans/2026-02-03-activity-routing-design.md)** - Activity routing & model selection
- **[plans/2026-02-02-homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md)** - Homeostasis decision
- **[plans/2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md)** - Memory system design
- **[plans/2026-02-03-md-files-input-layer.md](./plans/2026-02-03-md-files-input-layer.md)** - MD files for static content

### Migration & Reuse
- **[plans/2026-02-03-contextforge-migration.md](./plans/2026-02-03-contextforge-migration.md)** - ContextForge migration analysis
- **[plans/2026-02-03-tanstack-ecosystem.md](./plans/2026-02-03-tanstack-ecosystem.md)** - TanStack capabilities

### Testing & Planning
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

*Architecture updated: 2026-02-04*
*Key changes:*
- *Database: PostgreSQL everywhere, drop SQLite (see plans/2026-02-04-postgresql-everywhere.md)*
- *Stack: TanStack Start v1.158 + Drizzle ORM (replaces Convex)*
- *LLM: Multi-provider system — ollama (local), openrouter, claude-code (Agent SDK)*
- *Streaming: Nitro API routes (not TanStack Start server functions)*
- *Observability: Langfuse via OTel + AI SDK experimental_telemetry*
- *Events: MQTT for Home Assistant/Frigate integration*
- *Content: MD files as input layer (Obsidian-friendly)*
- *Phase 1: COMPLETE — 27/27 tests, 3 providers verified streaming*
*Next: Phase 2 — Memory System (Graphiti + FalkorDB)*
