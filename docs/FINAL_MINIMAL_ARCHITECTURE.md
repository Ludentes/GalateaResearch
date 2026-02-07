# Galatea: Final Minimal Architecture

**Date**: 2026-02-07 (Updated)
**Status**: Phase 2 COMPLETE (extraction quality under review), Phase 3 Ready to Start
**Timeline**: 11 weeks to working core (Phases 1-2 done in 3 weeks)

**Latest Update (2026-02-07)**:
- ⚠️ **Extraction Quality Discovery** — Benchmarking revealed Graphiti and Mem0 both achieve only 18-21% fact recall on our golden dataset. This does NOT block Phase 3, but changes the memory extraction strategy:
  - Extraction is now separated from storage (extraction ≠ memory system)
  - Adopting unified extraction: pattern-based heuristics (fast path) + pluggable LLM fallback
  - Raw data preservation principle: save originals, improve extraction iteratively
  - See [memory-lifecycle.md](./plans/2026-02-07-memory-lifecycle.md) for complete lifecycle design
  - See [unified-memory-extraction-design.md](./plans/2026-02-06-unified-memory-extraction-design.md) for extraction approach

**Previous Update (2026-02-06)**:
- ✅ **Phase 2 COMPLETE** — Memory system operational with Graphiti + FalkorDB
  - Single-graph architecture enables cross-session search
  - Context assembly enriches every LLM call (<100ms latency)
  - Memory Browser UI for visualization
  - Gatekeeper filtering (pattern-based, zero cost)
  - 102/104 tests passing (98%)
  - See [2026-02-06-phase2-progress.md](./plans/2026-02-06-phase2-progress.md)
- Adopted OpenTelemetry (OTEL) as unified observation pipeline backbone
- Added explicit **Phase 4: Observation Pipeline** to roadmap (Week 7)
- Renumbered subsequent phases (MCP Tools → Phase 5, Learning → Phase 6, Personas → Phase 7)
- See [observation-pipeline/](./observation-pipeline/) for implementation details

---

## Foundation

### Guiding Principles
1. **Pragmatical** - Practice is the criterion of truth
2. **Iterative** - Useful at every step
3. **Reuse** - Team of one leverages thousands
4. **Raw Data First** - Save original data; improve extraction later. Basic heuristics that preserve source data beat sophisticated extraction that can't be reprocessed

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

### Memory System: Extraction + Storage (Separated)

**Key Insight (2026-02-07):** Benchmarking revealed that both Graphiti and Mem0 achieve only 18-21% fact recall on our golden dataset. The memory system is now understood as two distinct layers:

1. **Extraction Layer** — How we turn conversations/observations into structured memories
2. **Storage Layer** — How we persist, query, and manage those memories over time

**Extraction approach** (replacing monolithic Graphiti extraction):

| Method | When | Latency | Cost |
|--------|------|---------|------|
| Pattern-based heuristics | ~70% of messages (preferences, rules, tech mentions) | <1ms | $0 |
| Pluggable LLM fallback | ~30% of messages (complex, ambiguous) | 200-500ms | $0 (Ollama) |

The LLM fallback uses a pluggable `MemoryExtractor` interface — implementations include Ollama (default), Mem0, Graphiti, and Claude. This allows swapping extraction backends without changing the pipeline. See [pluggable-extraction-interface.md](./plans/2026-02-06-pluggable-extraction-interface.md).

**Storage** remains PostgreSQL (facts table) + FalkorDB (graph relationships). Graphiti continues to provide graph storage and querying — the change is that extraction is no longer delegated to Graphiti alone.

**Raw data preservation**: Every extracted memory links back to its source data (`source_id`, `extraction_version`, `raw_user_message`). When extraction improves, we can batch-reprocess from raw data. See the Raw Data First principle above.

**Memory types** (from [PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)):
- **Episodic**: Events with timestamps, outcomes, emotional valence ("Debugging auth took 45min, frustrated→relieved")
- **Semantic**: Facts with confidence + temporal validity ("Prefer Clerk over JWT", valid_from, valid_until)
- **Procedural**: Trigger → steps with success tracking ("When animation flickers → use inline styles", success_rate: 0.85)

**Cognitive models**:
- **Self Model**: Strengths, weaknesses, recent misses
- **User Model**: Preferences, expectations, expertise
- **Domain Model**: Rules, risk levels, precision requirements
- **Relationship Model**: Trust level, interaction history

**Memory lifecycle**: Creation → Storage → Retrieval → Editing/Supersession → Promotion. Memories are never deleted, only superseded. See [memory-lifecycle.md](./plans/2026-02-07-memory-lifecycle.md) for complete lifecycle design including promotion pipeline, priority budget retrieval, and quality metrics.

See [2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md) for original design.

### The Observation Pipeline (OTEL-First)

**2026-02-06 Update**: Adopted **OpenTelemetry (OTEL) as unified backbone** for observation pipeline.

```
ACTIVITY SOURCES → OTEL COLLECTOR → GALATEA API → ENRICHMENT → DIALOGUE → MEMORY
(Claude Code,      (Filter,         (Ingest)      (Guess      (Validate) (Extraction
 VSCode,            Transform,                      intent)               + Storage)
 Browser,           Batch)
 Home Assistant)
```

**Why OTEL?**
- Claude Code has native OTEL support (hooks)
- Single unified interface for all sources
- Infrastructure-level MQTT→OTEL bridging (Home Assistant/Frigate)
- Ecosystem integration (Langfuse, Jaeger)

**Primary Sources** (High Priority):
1. **Claude Code** - User prompts, tool usage (how you code)
2. **Browser** - Sites visited, searches (what you research)
3. **VSCode** - Files opened/edited (what you work on)

**Secondary Sources**:
4. Linux Activity - App launches, window focus
5. Home Assistant - Presence, smart home context
6. Frigate NVR - Person detections

See [OBSERVATION_PIPELINE.md](OBSERVATION_PIPELINE.md) and [observation-pipeline/](./observation-pipeline/) for full details.

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
│  │                MEMORY LAYER (Extraction + Storage)                     │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  EXTRACTION: Pattern heuristics (70%) + Pluggable LLM (30%)   │  │ │
│  │  │  Gatekeeper → Pattern Match → LLM Fallback → Dedup/Merge      │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
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
│  │   Mosquitto    │  │    Ollama      │                                     │
│  │  (MQTT broker) │  │  (extraction   │  ┌────────────────────────────────┐ │
│  └────────────────┘  │   LLM fallback)│  │  Auth (TBD, deferred)         │ │
│                      └────────────────┘  └────────────────────────────────┘ │
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
- ❌ Auth (Convex Auth → Better Auth) — **not implemented**, deferred indefinitely. Single-user local dev; no auth needed until multi-user or remote access.
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
- [ ] ~~Set up Better Auth (password provider)~~ — **deferred indefinitely**. Not installed, not needed for single-user local dev. Revisit when multi-user or remote access is required.
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

### Phase 2: Memory System (Weeks 3-4) — COMPLETE (Extraction Under Review)

**Objective:** Implement full memory layer with all types

**Phase 2a (COMPLETE):** Infrastructure + Graphiti integration
- [x] Build Memory Gatekeeper (filter general knowledge) — Pattern-based, no LLM calls
- [x] Implement ingestion pipeline — Fire-and-forget with graceful degradation
- [x] Implement context assembly (query → prompt) — 6-step pipeline, <100ms
- [x] Add memory panel to UI — Memory Browser with Facts + Episodes tabs
- [x] Single-graph architecture with `group_id` properties
- [x] 102/104 tests passing (98%)

**Phase 2b (PLANNED):** Extraction quality overhaul
- ⚠️ **Discovery**: Benchmarking showed Graphiti and Mem0 achieve only 18-21% fact recall
- [ ] Implement unified extraction (pattern heuristics + pluggable LLM fallback)
- [ ] Add gatekeeper decision logging (`gatekeeper_log` table)
- [ ] Add `extraction_version` and `source_id` to all memories (raw data preservation)
- [ ] Implement `MemoryExtractor` interface with Ollama backend
- [ ] Add temporal validity (`valid_from`, `valid_until`, `superseded_by`) to facts
- [ ] Add non-lossy supersession (never delete, always supersede)
- [ ] Validate against golden dataset (target: >60% fact recall)
- See [memory-lifecycle.md](./plans/2026-02-07-memory-lifecycle.md) for full Phase 2b design

**Deliverable:** ✅ Agent stores and retrieves typed memories (2a); Agent extracts memories with measurable quality (2b)

**Success Metric:** Context includes relevant hard rules (100%), facts (>80% relevance), extraction recall >60% on golden dataset

**Progress:** See [2026-02-06-phase2-progress.md](./plans/2026-02-06-phase2-progress.md)

**Key Architectural Decisions:**
- **Extraction ≠ Storage**: Extraction layer (how we turn text into memories) is separated from storage layer (how we persist and query them)
- **Single-graph architecture**: Migrated from multi-graph (one per session) to single `galatea_memory` graph with `group_id` properties
- **Pattern-based gatekeeper**: No LLM calls, zero cost, <1ms latency — handles ~70% of messages
- **Pluggable LLM fallback**: `MemoryExtractor` interface with Ollama/Mem0/Graphiti/Claude implementations
- **Raw data preservation**: Every memory links to source data; reprocessable when extraction improves
- **Cognitive models infrastructure**: Ready but not yet integrated (Phase 3)

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

### Phase 3: Homeostasis Engine + Activity Router (Weeks 5-6) — PLANNED

**Objective:** Implement 6-dimension homeostasis with guidance AND activity-level routing

**Status:** ✅ Implementation plan complete ([2026-02-06-phase3-implementation-plan.md](./plans/2026-02-06-phase3-implementation-plan.md))

**Tasks:**
- [ ] Create HomeostasisEngine class (6-dimension assessment + guidance)
- [ ] Implement assessment logic (hybrid: computed + LLM)
- [ ] Define guidance text for all dimension states
- [ ] Create ActivityRouter class (Level 0-3 classification)
- [ ] Implement activity classification (no-LLM pattern-based)
- [ ] Implement model selection logic (none/haiku/sonnet)
- [ ] Implement Level 3 Reflexion loop (Draft → Critique → Revise)
- [ ] Integrate cognitive models into context assembly
- [ ] Add homeostasis state to prompt construction
- [ ] Add homeostasis/routing visualization to UI
- [ ] Test with reference scenarios (Traces 2, 4, 6, 7, 8)

**Implementation Stages:**
- **Stage A**: Homeostasis Engine (Days 1-3, 18 hours)
- **Stage B**: Activity Router (Days 3-5, 16 hours)
- **Stage C**: Reflexion Loop (Days 5-6, 14 hours)
- **Stage D**: Cognitive Models Integration (Days 6-7, 10 hours)
- **Stage E**: End-to-End Integration (Days 7-9, 16 hours)
- **Stage F**: UI Visualization (Days 9-10, 11 hours)
- **Stage G**: Reference Scenario Testing (Days 10-11, 10 hours)
- **Stage H**: Documentation (Days 11-12, 7 hours)

**Deliverable:** Agent behavior driven by dimension balance AND appropriate processing depth

**Success Metrics:**
- Homeostasis accuracy: >85% (reference scenarios)
- Activity routing accuracy: >80% (manual review)
- Level 0-1 activities: >60% (cost optimization)
- Cost reduction vs always-Sonnet: >50%
- Test coverage: >90%

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

### Phase 4: Observation Pipeline (OTEL) (Week 7)

**Objective:** Implement OTEL-based observation pipeline for shadow learning

**Decision**: OpenTelemetry (OTEL) as unified backbone (see [observation-pipeline/](./observation-pipeline/))

**Tasks:**
- [ ] Deploy OTEL Collector (Docker Compose)
- [ ] Configure OTEL Collector (receivers, processors, exporters)
- [ ] Implement `/api/observation/ingest` endpoint
- [ ] Create Claude Code OTEL hooks (~/.claude/hooks/)
- [ ] Build Browser extension (Chrome/Firefox) → OTEL
- [ ] **Optional:** Build VSCode extension → OTEL
- [ ] **Optional:** Setup MQTT→OTEL bridge (Home Assistant/Frigate)
- [ ] Implement enrichment layer (group events, guess intent)
- [ ] Add activity session tracking
- [ ] Test end-to-end: source → collector → API → storage

**Deliverable:** System observes user activity from Claude Code and Browser

**Success Metric:** Can capture and store user prompts, file edits, browser activity

**Priority Sources:**
1. **Claude Code** (hooks) - How you code
2. **Browser** (extension) - What you research
3. **VSCode** (extension) - What you work on (optional for Phase 4)

**Infrastructure:**
```yaml
# docker-compose.yml
otel-collector:
  image: otel/opentelemetry-collector-contrib:latest
  ports:
    - "4317:4317"  # OTLP gRPC
    - "4318:4318"  # OTLP HTTP
```

**Documentation**: [observation-pipeline/](./observation-pipeline/), [OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)

---

### Phase 5: MCP Tool Integration (Week 8)

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

### Phase 6: Memory Promotion & Learning (Weeks 9-10)

**Objective:** Implement memory promotion pipeline (uses observations from Phase 4)

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

### Phase 7: Personas & Instantiation (Week 11)

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

### Phase 4 (Observation Pipeline)
- ✅ Claude Code prompts captured via OTEL hooks
- ✅ Browser activity captured via extension
- ✅ Events flow through OTEL Collector to Galatea API
- ✅ Activity sessions grouped correctly
- **Metric:** > 95% of user activity captured accurately

### Phase 5 (Tools)
- ✅ Agent successfully executes tools
- ✅ Tool results inform responses
- ✅ Approval gates prevent unauthorized actions
- **Metric:** Tool success rate > 85%

### Phase 6 (Learning)
- ✅ Episodes promote to facts (2+ similar episodes)
- ✅ Procedure success_rate updates after use
- ✅ Superseded knowledge marked, not deleted
- ✅ Observations from Phase 4 feed memory formation
- **Metric:** Memory promotion occurs correctly

### Phase 7 (Instantiation)
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
| **Auth** | None (was Better Auth) | **Not implemented** — deferred indefinitely, not needed for single-user local dev |
| **LLM** | AI SDK v6 (`ai@6.0.69`) — multi-provider | Phase 1 DONE |
| | • ollama (default: llama3.2, local) | |
| | • openrouter (default: z-ai/glm-4.5-air:free) | |
| | • claude-code (Agent SDK, default: sonnet) | |
| **Streaming** | Nitro API route + client ReadableStream | Phase 1 DONE |
| **Graph DB** | FalkorDB (port 16379, Browser on 13001) | Phase 1 DONE |
| **Memory Extraction** | Pattern heuristics + Pluggable LLM (Ollama default) | Phase 2b |
| **Memory Storage** | PostgreSQL (facts) + FalkorDB (graph relationships) | Phase 2a DONE |
| **Observation** | OpenTelemetry Collector (ports 4317/4318) | Phase 4 |
| **Events** | MQTT (Mosquitto, port 11883/19001) → OTEL bridge | Phase 4 (optional) |
| **Tools** | MCP (1000+ servers) | Phase 5 |
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
Note: `@ai-sdk/anthropic` removed in favor of multi-provider system. `better-auth` was never installed — auth deferred indefinitely (single-user local dev).

---

## What We're NOT Building

❌ 12+ discrete subsystems (homeostasis replaces them)
❌ Custom vector DB (use FalkorDB for graph, PostgreSQL for structured)
❌ Custom embedding model (use Voyage AI)
❌ Custom LLM (use Claude models via API)
❌ Complex UI from scratch (reuse ContextForge patterns)
❌ Monolithic memory extraction (use pluggable extractors behind common interface)
❌ Convex (replaced by TanStack Start + Drizzle)
❌ Real-time sync framework (not needed for request/response + streaming)
❌ Multi-agent coordination initially (single agent first)
❌ Perfect extraction from day 1 (raw data preservation allows iterative improvement)

---

## Risk Mitigation

### Risk 1: Memory extraction quality
**Status:** REALIZED — Graphiti and Mem0 benchmarked at 18-21% fact recall
**Mitigation:** Separated extraction from storage. Pattern-based heuristics for common cases ($0, <1ms), pluggable LLM fallback for complex cases. Raw data preservation enables reprocessing when extraction improves. See [unified-memory-extraction-design.md](./plans/2026-02-06-unified-memory-extraction-design.md).

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

### Memory System (2026-02-07)
- **[plans/2026-02-07-memory-lifecycle.md](./plans/2026-02-07-memory-lifecycle.md)** - Complete memory lifecycle (creation → storage → retrieval → editing → promotion)
- **[plans/2026-02-06-unified-memory-extraction-design.md](./plans/2026-02-06-unified-memory-extraction-design.md)** - Unified extraction approach (pattern + LLM)
- **[plans/2026-02-06-unified-memory-extraction-implementation.md](./plans/2026-02-06-unified-memory-extraction-implementation.md)** - 4-phase extraction implementation plan
- **[plans/2026-02-06-pluggable-extraction-interface.md](./plans/2026-02-06-pluggable-extraction-interface.md)** - MemoryExtractor interface & orchestrator
- **[MEMORY_SYSTEM_COMPARISON.md](./MEMORY_SYSTEM_COMPARISON.md)** - Mem0 vs Graphiti benchmark results

### Testing & Planning
- **[OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)** - Observation pipeline design
- **[REFERENCE_SCENARIOS.md](./REFERENCE_SCENARIOS.md)** - Test scenarios (including memory lifecycle traces, golden dataset edge cases)
- **[USER_STORIES.md](./USER_STORIES.md)** - User stories (including Epic 9: Memory Lifecycle)
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
3. **Reuse** ✅ - Leverages ContextForge + pluggable extractors + MCP ecosystem
4. **Raw Data First** ✅ - Save originals, improve extraction iteratively

---

*Architecture updated: 2026-02-07*
*Key changes (2026-02-07):*
- *Memory extraction separated from storage — Graphiti/Mem0 benchmarked at 18-21% recall*
- *Adopted unified extraction: pattern heuristics + pluggable LLM fallback (MemoryExtractor interface)*
- *Added Raw Data First principle — save originals, reprocess when extraction improves*
- *Phase 2 split into 2a (complete) and 2b (extraction quality overhaul)*
- *Complete memory lifecycle documented (creation → storage → retrieval → editing → promotion)*
- *Reference scenarios expanded: memory lifecycle traces, golden dataset edge cases*
- *Added Ollama to infrastructure (extraction LLM fallback, $0 cost)*

*Previous changes (2026-02-04):*
- *Database: PostgreSQL everywhere, drop SQLite*
- *Stack: TanStack Start v1.158 + Drizzle ORM (replaces Convex)*
- *LLM: Multi-provider system — ollama (local), openrouter, claude-code (Agent SDK)*
- *Phase 1: COMPLETE — 27/27 tests, 3 providers verified streaming*
*Next: Phase 2b — Memory extraction quality overhaul*
