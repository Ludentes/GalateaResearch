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
- ⚠️ Server functions (Convex → TanStack Start)
- ⚠️ Database schema (Convex → Drizzle ORM)
- ⚠️ Auth (Convex Auth → Better Auth)
- ⚠️ LLM hooks (custom → Vercel AI SDK `useChat`)
- ⚠️ Claude Code SDK integration (port patterns)

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

### Phase 1: Foundation (Weeks 1-2)

**Objective:** Create TanStack Start project, set up infrastructure

**Tasks:**
- [ ] Create TanStack Start project (`npx create-tanstack-app`)
- [ ] Set up Drizzle ORM with SQLite (local dev)
- [ ] Define full schema (all tables from architecture)
- [ ] Set up Better Auth (password provider)
- [ ] Set up FalkorDB locally (Docker)
- [ ] Set up Graphiti, create TypeScript wrapper
- [ ] Copy pure utilities from ContextForge
- [ ] Basic chat UI with Vercel AI SDK streaming

**Deliverable:** Working Galatea instance with database + graph ready

**Success Metric:** Can store/retrieve from SQLite and FalkorDB

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

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | React 19 + TanStack Router | From ContextForge patterns |
| **Backend** | TanStack Start (server functions) | New (replaces Convex) |
| **Database** | Drizzle ORM + SQLite/PostgreSQL | New (replaces Convex DB) |
| **Auth** | Better Auth | New (replaces Convex Auth) |
| **LLM** | Claude Code SDK (dev) + Vercel AI SDK | Adapted |
| | • Haiku (Level 0-1: simple tasks) | |
| | • Sonnet (Level 2-3: reasoning) | |
| **Graph DB** | FalkorDB | New |
| **Memory** | Graphiti | New |
| **Events** | MQTT (Mosquitto) for HA/Frigate | New |
| **Tools** | MCP (1000+ servers) | Ecosystem |
| **Embeddings** | Voyage AI | New |
| **Observability** | LangFuse | From ContextForge |
| **Static Content** | MD files (Obsidian-friendly) | New |

**Code Reuse from ContextForge: ~40% direct + ~30% adapted**
**Time to Working Core: 10 weeks**

See [system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md) for full technical details.

---

## Code Structure (TanStack Start)

```
galatea/
├── app/
│   ├── routes/
│   │   ├── __root.tsx              # Root layout
│   │   ├── index.tsx               # Dashboard
│   │   ├── chat/$sessionId.tsx     # Chat interface
│   │   ├── memories/index.tsx      # Memory browser
│   │   └── settings/index.tsx      # Configuration
│   │
│   ├── api/                        # API routes
│   │   ├── observations.ts         # POST /api/observations
│   │   ├── dialogue.ts             # POST /api/dialogue
│   │   └── chat.ts                 # POST /api/chat (streaming)
│   │
│   └── components/
│       ├── chat/                   # Chat UI components
│       ├── memory/                 # Memory browser (TanStack Table)
│       ├── homeostasis/            # State panel
│       └── ui/                     # shadcn/ui components
│
├── server/
│   ├── functions/                  # Server functions
│   │   ├── chat.ts                 # Chat completion (Level 0-3)
│   │   ├── memories.ts             # Memory CRUD
│   │   ├── sessions.ts             # Session management
│   │   ├── homeostasis.ts          # State updates
│   │   ├── learning.ts             # Memory promotion
│   │   └── personas.ts             # Persona management
│   │
│   ├── engine/                     # Core Galatea logic
│   │   ├── activity-router.ts      # Level 0-3 classification
│   │   ├── homeostasis-engine.ts   # 6 dimensions + guidance
│   │   ├── context-builder.ts      # Full context assembly
│   │   ├── reflexion.ts            # Level 3 Draft→Critique→Revise
│   │   ├── guardrails.ts           # Over-research, going dark
│   │   └── observation-pipeline.ts # Capture→Enrich→Validate→Store
│   │
│   ├── integrations/
│   │   ├── graphiti.ts             # Graphiti client
│   │   ├── mqtt.ts                 # MQTT subscriber (HA/Frigate)
│   │   ├── llm.ts                  # Claude Code SDK + Vercel AI SDK
│   │   └── mcp.ts                  # MCP tool executor
│   │
│   ├── sync/
│   │   └── md-sync.ts              # MD files → DB/Graphiti sync
│   │
│   └── db/
│       ├── schema.ts               # Drizzle schema (all tables)
│       ├── migrations/
│       └── index.ts                # DB client
│
├── galatea-knowledge/              # MD files (Obsidian-friendly)
│   ├── personas/                   # Agent specs
│   ├── rules/                      # Hard rules
│   ├── domain/                     # Domain knowledge
│   └── procedures/                 # Step-by-step guides
│
└── docs/                           # Documentation
```

See [system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md) for detailed code examples.

---

## Configuration Files Needed

### .env.local
```bash
# Database
DATABASE_URL=file:./galatea.db       # SQLite for local dev
# DATABASE_URL=postgres://...         # PostgreSQL for production

# Auth
BETTER_AUTH_SECRET=<random-secret>

# LLM
ANTHROPIC_API_KEY=sk-ant-...         # For Vercel AI SDK (production)
OLLAMA_URL=http://localhost:11434    # For local Ollama

# Graph Memory
FALKORDB_URL=redis://localhost:6379
VOYAGE_AI_API_KEY=pa-...

# Events
MQTT_BROKER=mqtt://localhost:1883

# Observability
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...

# Content
KNOWLEDGE_PATH=./galatea-knowledge   # MD files location
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  falkordb_data:
```

### package.json (key dependencies)
```json
{
  "dependencies": {
    "@tanstack/react-start": "^1.0.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/react-table": "^8.0.0",
    "@tanstack/react-form": "^1.0.0",
    "drizzle-orm": "^0.30.0",
    "better-sqlite3": "^11.0.0",
    "ai": "^4.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "mqtt": "^5.0.0",
    "better-auth": "^1.0.0"
  }
}
```

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
- Convex: $0 (free tier sufficient for MVP)
- OpenRouter: ~$50-100 (usage-based)
- FalkorDB: $0 (self-hosted Docker)
- Voyage AI: ~$10-20 (embedding costs)
- LangFuse: $0 (self-hosted or free tier)
**Total: ~$60-120/month**

---

## Related Documents

### Architecture
- **[PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)** - Full architecture design
- **[plans/2026-02-03-system-architecture-tanstack.md](./plans/2026-02-03-system-architecture-tanstack.md)** - TanStack Start implementation

### Design Decisions
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

*Architecture updated: 2026-02-03*
*Key changes:*
- *Stack: TanStack Start + Drizzle (replaces Convex)*
- *Events: MQTT for Home Assistant/Frigate integration*
- *Content: MD files as input layer (Obsidian-friendly)*
- *Previous: Activity Router, Homeostasis, Graphiti memory*
*Next: Create TanStack Start project and begin Phase 1*
