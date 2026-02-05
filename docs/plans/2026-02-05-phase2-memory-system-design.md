# Phase 2: Memory System — Implementation Design

**Date**: 2026-02-05
**Status**: Ready for Implementation
**Depends on**: Phase 1 (COMPLETE)
**References**:
- [2026-02-02-memory-system-design.md](./2026-02-02-memory-system-design.md) — Original memory architecture
- [2026-02-02-memory-findings.md](./2026-02-02-memory-findings.md) — Memory system research
- [2026-02-05-graphiti-ecosystem-research.md](./2026-02-05-graphiti-ecosystem-research.md) — Graphiti ecosystem analysis

---

## Objective

Implement a memory system that enables Galatea to:
1. **Remember** — Store conversation knowledge as structured graph data
2. **Recall** — Retrieve relevant knowledge before each LLM call
3. **Filter** — Distinguish project-specific knowledge from general LLM knowledge
4. **Self-model** — Track strengths, weaknesses, and patterns about itself and its users

**Success Metrics:**
- Hard rules ALWAYS appear in context (100%)
- Semantic search retrieves relevant facts (> 80% relevance)
- Procedures match appropriate triggers
- Context assembly completes in < 500ms (excluding Graphiti search latency)

---

## Architecture: Two Layers

### Layer 1: Graphiti Sidecar (Python)

Graphiti runs as a Python FastAPI container. It handles entity extraction, deduplication, temporal tracking, and hybrid search. We configure it but don't modify it.

- **Image**: `zepai/graphiti` (or built from `/server` in the Graphiti repo)
- **Port**: 18000
- **Database**: Existing FalkorDB at :16379
- **LLM**: Ollama `gpt-oss:latest` (20GB) via OpenAI-compatible endpoint
- **Embeddings**: Ollama embeddings
- **Fallback LLM path**: OpenRouter `gpt-oss` (120B) → OpenRouter Z-LM flash

### Layer 2: Memory Orchestration (TypeScript)

Our custom code in `server/memory/`. Decides what to remember, how to query, how to assemble context, and how to track learning.

```
┌─────────────────────────────────────────────────────────────┐
│  server/memory/  (TypeScript — our code)                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Gatekeeper   │  │  Context     │  │  Cognitive       │  │
│  │  "Worth       │  │  Assembler   │  │  Models          │  │
│  │  remembering?"│  │  (6-step)    │  │  (self/user)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │             │
│         ▼                  ▼                    ▼             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GraphitiClient  (HTTP wrapper)                       │   │
│  │  addEpisode()  search()  getEpisodes()  addEntity()  │   │
│  └──────────────────────────┬───────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Graphiti  (Python FastAPI — :18000)                         │
│  Entity extraction, dedup, temporal model, hybrid search     │
│  └──▶ FalkorDB (:16379)    └──▶ Ollama (:11434)            │
└─────────────────────────────────────────────────────────────┘
```

### What Graphiti Handles vs What We Build

| Concern | Graphiti | Our Code |
|---------|----------|----------|
| Entity/relationship extraction | Yes | — |
| Bi-temporal model (valid_from/until) | Yes | — |
| Hybrid search (BM25 + vector + BFS) | Yes | — |
| Deduplication at ingestion | Yes | — |
| Memory Gatekeeper (filter general knowledge) | — | Yes |
| Context assembly (6-step pipeline) | — | Yes |
| Token budget management | — | Yes |
| Hard rule guaranteed injection | — | Yes |
| Procedural memory with success tracking | — | Yes |
| Cognitive models (self/user) | — | Yes |
| Prompt construction with priorities | — | Yes |
| Promotion engine (episode → fact → rule) | — | Future (Phase 3+) |

---

## Infrastructure

### Docker Compose Addition

```yaml
graphiti:
  image: zepai/graphiti
  ports:
    - "18000:8000"
  environment:
    # Database
    FALKORDB_URI: "redis://falkordb:6379"
    FALKORDB_DATABASE: "galatea_memory"
    # LLM (Ollama via OpenAI-compatible endpoint)
    LLM_PROVIDER: "openai"
    MODEL_NAME: "gpt-oss:latest"
    SMALL_MODEL_NAME: "gpt-oss:latest"
    LLM_BASE_URL: "http://host.docker.internal:11434/v1"
    LLM_API_KEY: "ollama"
    # Embeddings (Ollama)
    EMBEDDER_PROVIDER: "openai"
    EMBEDDING_MODEL: "nomic-embed-text"
    EMBEDDER_BASE_URL: "http://host.docker.internal:11434/v1"
    EMBEDDER_API_KEY: "ollama"
    # Concurrency
    SEMAPHORE_LIMIT: "5"
  depends_on:
    falkordb:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/healthcheck"]
    interval: 10s
    timeout: 5s
    retries: 5
```

**Notes:**
- Graphiti connects to FalkorDB via Docker network (internal port 6379)
- Ollama runs on host — accessed via `host.docker.internal:11434`
- `galatea_memory` graph is separate from Phase 1's `galatea` test graph
- `SEMAPHORE_LIMIT: 5` controls LLM call concurrency during ingestion
- Embedding model `nomic-embed-text` must be pulled in Ollama before use: `ollama pull nomic-embed-text`
- LLM model `gpt-oss:latest` must also be available in Ollama

### Environment Variables (.env)

```bash
# Graphiti (Phase 2)
GRAPHITI_URL=http://localhost:18000
GRAPHITI_GROUP_ID=main
```

### Fallback Configuration

If Ollama `gpt-oss:latest` produces poor structured output (entity extraction failures):

1. **First**: Try OpenRouter with `gpt-oss` (120B):
   ```yaml
   LLM_PROVIDER: "openai"
   MODEL_NAME: "gpt-oss"
   LLM_BASE_URL: "https://openrouter.ai/api/v1"
   LLM_API_KEY: "${OPENROUTER_API_KEY}"
   ```

2. **Second**: Try OpenRouter with Z-LM flash:
   ```yaml
   MODEL_NAME: "z-lm-flash"
   ```

---

## Data Flow

### Flow 1: Ingestion (after each assistant response)

```
User sends message
  → streamMessageLogic() processes it
    → Context Assembler enriches system prompt (Flow 2)
    → LLM generates streaming response
      → onFinish callback:
        1. Save message to PostgreSQL (existing)
        2. [Stage E] Gatekeeper: "Worth remembering?"
           - Always keep: preferences, policies, corrections, decisions
           - Always skip: greetings, confirmations, generic knowledge
           - LLM decides: ambiguous cases
        3. If yes → POST /messages to Graphiti:
           {
             name: messageId,
             episode_body: "user: {message}\nassistant: {response}",
             source: "message",
             group_id: sessionId,
             reference_time: timestamp
           }
        4. Graphiti processes async (202 Accepted):
           - Entity extraction with reflexion loops
           - Entity resolution / deduplication
           - Edge extraction (relationships + temporal bounds)
           - Community detection update
```

**Ingestion is non-blocking** — Graphiti returns 202 and processes in the background. The user sees no latency impact.

### Flow 2: Retrieval (before each LLM call)

```
User sends message
  → Context Assembler (server/memory/context-assembler.ts):

    Step 1: Query Formulation
      - Extract key concepts from user message
      - Identify technologies mentioned or implied
      - Generate constraint query (what NOT to do)
      - Generate procedure trigger patterns

    Step 2: Parallel Retrieval
      Promise.all([
        a. Hard rules from preprompts DB
           (type = 'hard_rule', active = true)
           → Guaranteed injection, no similarity threshold

        b. Graphiti semantic search
           POST /search { query, group_ids }
           → Facts, relationships, entities

        c. Graphiti recent episodes
           GET /episodes/{groupId}?last_n=5
           → Short-term conversational context

        d. [Stage F] Self-model query
           → Strengths, weaknesses, recent misses

        e. [Stage F] User-model query
           → Preferences, expectations, communication style
      ])

    Step 3: Ranking & Selection
      - Score: similarity × 0.4 + recency × 0.2 + confidence × 0.3 + source_boost × 0.1
      - Deduplicate by content similarity (threshold > 0.9)
      - Sort by final score descending

    Step 4: Token Budget Allocation
      DEFAULT_BUDGET = {
        total: 8000,
        hardRules: 500,      // Reserved, never truncated
        procedures: 1500,    // High value, detailed steps
        facts: 4000,         // Bulk of knowledge
        models: 1000,        // Self + user context
        episodes: 1000       // Recent short-term context
      }
      - Hard rules always included (not subject to budget)
      - Truncate lowest-priority sections first if over budget

    Step 5: Prompt Construction
      Prioritized sections:
        1. CONSTRAINTS (hard rules) — priority 1, never truncated
        2. RELEVANT PROCEDURES — priority 2
        3. RELEVANT KNOWLEDGE — priority 3
        4. SELF-AWARENESS — priority 4
        5. USER CONTEXT — priority 5
        6. RECENT CONTEXT — priority 6

    Step 6: [Future] Homeostasis Assessment
      - Evaluate knowledge_sufficiency for the task
      - If LOW → recommend research before proceeding
      - If HEALTHY → proceed with confidence

  → Enriched system prompt passed to streamText()
```

**Retrieval adds latency** but enriches context. Target: < 500ms total for the assembly pipeline (Graphiti search is the bottleneck).

---

## Data Model

### Graphiti's Internal Graph Model (FalkorDB)

Graphiti manages its own graph schema. We don't create these manually — Graphiti creates them when `build_indices_and_constraints()` is called on first startup.

**Node types created by Graphiti:**

| Label | Properties | Description |
|-------|-----------|-------------|
| `:Episodic` | `uuid`, `name`, `content`, `source`, `valid_at`, `group_id` | Raw conversation turns |
| `:Entity` | `uuid`, `name`, `summary`, `name_embedding`, `labels`, `attributes`, `group_id` | Extracted entities (people, technologies, concepts) |
| `:Community` | `uuid`, `name`, `summary`, `name_embedding` | Semantic clusters |
| `:Saga` | `uuid`, `name` | Episode groupings |

**Edge types created by Graphiti:**

| Relationship | Pattern | Properties | Description |
|-------------|---------|-----------|-------------|
| `:MENTIONS` | `(Episodic)-[:MENTIONS]->(Entity)` | `uuid` | Provenance: which episode mentioned which entity |
| `:RELATES_TO` | `(Entity)-[:RELATES_TO]->(Entity)` | `uuid`, `fact`, `fact_embedding`, `valid_at`, `invalid_at`, `created_at`, `expired_at`, `group_id` | Primary knowledge: facts as edges between entities |
| `:HAS_MEMBER` | `(Community)-[:HAS_MEMBER]->(Entity)` | | Community membership |
| `:HAS_EPISODE` | `(Saga)-[:HAS_EPISODE]->(Episodic)` | | Saga grouping |
| `:NEXT_EPISODE` | `(Episodic)-[:NEXT_EPISODE]->(Episodic)` | | Temporal ordering |

**Key insight**: In Graphiti, **facts are edges, not nodes**. The `:RELATES_TO` edge contains a `fact` property with the natural language fact, plus `fact_embedding` for semantic search. The bi-temporal model is on edges: `valid_at`/`invalid_at` (reality) and `created_at`/`expired_at` (system).

### Our Custom Data (PostgreSQL — existing tables)

We continue using the existing preprompts table for hard rules and personas:

| Table | Role in Memory System |
|-------|----------------------|
| `preprompts` (type='hard_rule') | Hard rules guaranteed in every prompt |
| `preprompts` (type='core') | Core identity, always injected |
| `preprompts` (type='persona') | Active persona context |
| `preprompts` (type='domain') | Domain knowledge |
| `messages` | Conversation history (source for episodes) |
| `sessions` | Session tracking (maps to Graphiti `group_id`) |

**No new PostgreSQL tables needed for Phase 2.** All memory graph data lives in FalkorDB via Graphiti.

### Our Custom Graph Structures (Stage F — Cognitive Models)

For cognitive models, we use Graphiti's custom entity types (Pydantic models) OR direct FalkorDB queries alongside Graphiti. These are **not standard Graphiti entities** — they're our domain-specific extensions.

**Self-Model** (one per persona):
```
(:Entity {name: "galatea-self", labels: ["SelfModel"]})
  -[:RELATES_TO {fact: "Tends to miss null checks"}]->
    (:Entity {name: "null-check-pattern", labels: ["Weakness"]})

  -[:RELATES_TO {fact: "Strong at React Native styling"}]->
    (:Entity {name: "rn-styling", labels: ["Strength"]})

  -[:RELATES_TO {fact: "Forgot loading state in last PR"}]->
    (:Entity {name: "loading-state-miss-2026-02", labels: ["RecentMiss"]})
```

**User-Model** (one per user):
```
(:Entity {name: "user-alice", labels: ["UserModel"]})
  -[:RELATES_TO {fact: "Prefers functional components"}]->
    (:Entity {name: "functional-components", labels: ["Preference"]})

  -[:RELATES_TO {fact: "Expects tests for new features"}]->
    (:Entity {name: "test-expectation", labels: ["Expectation"]})

  -[:RELATES_TO {fact: "Communication style: concise"}]->
    (:Entity {name: "concise-style", labels: ["CommunicationStyle"]})
```

**Querying cognitive models** (Cypher, run against FalkorDB directly):
```cypher
-- Self-model: weaknesses
MATCH (s:Entity:SelfModel)-[r:RELATES_TO]->(w:Entity:Weakness)
WHERE r.invalid_at IS NULL
RETURN r.fact, r.created_at
ORDER BY r.created_at DESC

-- User-model: preferences
MATCH (u:Entity:UserModel {name: $userName})-[r:RELATES_TO]->(p:Entity:Preference)
WHERE r.invalid_at IS NULL
RETURN r.fact
```

**Open question**: Should cognitive models be ingested as episodes (letting Graphiti extract entities) or created as explicit entities via `POST /entity-node`? Recommendation: **explicit creation** via `POST /entity-node` for models — they're structured knowledge, not conversational text. Episodes are for conversations.

### Procedural Memory

Procedures are a special case. Graphiti doesn't natively support trigger→steps structures with success tracking. Two options:

**Option A: Store as Graphiti entities with custom attributes**
```
(:Entity {
  name: "image-upload-procedure",
  labels: ["Procedure"],
  attributes: {
    trigger: "When uploading images",
    steps: ["1. Use expo-image-picker", "2. Compress to ≤500KB", ...],
    success_rate: 0.88,
    times_used: 5
  }
})
```
Pros: Lives in Graphiti graph, searchable. Cons: Attributes are unstructured, success tracking requires manual updates via REST API.

**Option B: Store in PostgreSQL with a new `procedures` table**
```sql
CREATE TABLE procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_pattern TEXT NOT NULL,
  steps JSONB NOT NULL,
  success_rate REAL DEFAULT 0.0,
  times_used INTEGER DEFAULT 0,
  domain TEXT,
  learned_from TEXT[],
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```
Pros: Structured, easy to update success_rate. Cons: Not in the graph, separate query path.

**Recommendation**: Option A for Phase 2 (keep everything in the graph, accept the update complexity). Revisit if success tracking becomes a bottleneck.

---

## TypeScript Types

```typescript
// server/memory/types.ts

/** Graphiti REST API types */
export interface GraphitiEpisode {
  name: string
  episode_body: string
  source: "message" | "text" | "json"
  group_id: string
  reference_time: string  // ISO 8601
}

export interface GraphitiSearchResult {
  uuid: string
  fact: string
  source_node_name: string
  target_node_name: string
  score: number
  valid_at: string | null
  invalid_at: string | null
  created_at: string
}

export interface GraphitiEntityNode {
  uuid: string
  name: string
  summary: string
  labels: string[]
  attributes: Record<string, unknown>
  group_id: string
}

export interface GraphitiEpisodeNode {
  uuid: string
  name: string
  content: string
  source: string
  valid_at: string
  group_id: string
}

/** Context assembly types */
export interface ContextBudget {
  total: number
  hardRules: number
  procedures: number
  facts: number
  models: number
  episodes: number
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  total: 8000,
  hardRules: 500,
  procedures: 1500,
  facts: 4000,
  models: 1000,
  episodes: 1000,
}

export interface PromptSection {
  name: string
  priority: number        // 1 = highest (hard rules), 6 = lowest (recent context)
  content: string
  truncatable: boolean
  tokenEstimate: number
}

export interface ScoredFact {
  uuid: string
  fact: string
  source: "primary" | "concept" | "technology" | "constraint"
  similarity: number
  recency: number
  confidence: number
  finalScore: number
}

export interface AssembledContext {
  sections: PromptSection[]
  systemPrompt: string      // Final assembled prompt string
  metadata: {
    totalTokens: number
    retrievalStats: {
      hardRulesCount: number
      factsRetrieved: number
      proceduresMatched: number
      episodesIncluded: number
    }
    assemblyTimeMs: number
  }
}

/** Gatekeeper types */
export interface GatekeeperDecision {
  shouldIngest: boolean
  reason: string
  category: "preference" | "policy" | "correction" | "decision" | "general_knowledge" | "greeting" | "other"
}

/** Cognitive model types */
export interface SelfModel {
  strengths: string[]
  weaknesses: string[]
  recentMisses: string[]
}

export interface UserModel {
  preferences: string[]
  expectations: string[]
  communicationStyle: string | null
}
```

---

## File Structure

```
server/memory/
├── graphiti-client.ts          # Typed HTTP wrapper for Graphiti REST API
├── context-assembler.ts        # 6-step pipeline: query → retrieve → rank → build prompt
├── gatekeeper.ts               # [Stage E] Filter: worth remembering?
├── cognitive-models.ts         # [Stage F] Self-model + user-model queries
├── types.ts                    # Shared types (above)
├── constants.ts                # Token budgets, priority weights, scoring coefficients
└── __tests__/
    ├── graphiti-client.test.ts
    ├── graphiti-client.integration.test.ts
    ├── context-assembler.test.ts
    ├── chat-memory-flow.integration.test.ts
    ├── gatekeeper.test.ts
    └── cognitive-models.test.ts
```

**Modified existing files:**
- `docker-compose.yml` — Add Graphiti service
- `.env.example` — Add `GRAPHITI_URL`, `GRAPHITI_GROUP_ID`
- `server/functions/chat.logic.ts` — Replace preprompt concatenation with context assembler; add post-response ingestion
- `app/routes/memories/index.tsx` — [Stage D] New route for memory browser UI

---

## Staged Implementation Plan

### Stage A: Graphiti Sidecar Deployment

**Goal**: Graphiti running, healthy, can add/search a test episode.

**Tasks:**
1. Add Graphiti service to `docker-compose.yml`
2. Configure Ollama as LLM + embedding provider
3. Pull required Ollama models (`gpt-oss:latest`, `nomic-embed-text`)
4. Verify: `GET /healthcheck` returns healthy
5. Verify: `POST /messages` with test data → 202 Accepted
6. Verify: `POST /search` returns results from test data
7. Update `.env.example` with Graphiti vars
8. Write integration test: sidecar health + basic add/search

**Deliverable**: Graphiti sidecar running alongside existing stack.

### Stage B: TypeScript Client + Basic Ingestion

**Goal**: Chat conversations automatically ingested as Graphiti episodes.

**Tasks:**
1. Create `server/memory/types.ts` — shared type definitions
2. Create `server/memory/graphiti-client.ts` — HTTP wrapper:
   - `addEpisode(episode)` → `POST /messages`
   - `search(query, groupIds)` → `POST /search`
   - `getEpisodes(groupId, lastN)` → `GET /episodes/{groupId}`
   - `getMemory(messages)` → `POST /get-memory`
   - `addEntityNode(entity)` → `POST /entity-node`
   - `healthcheck()` → `GET /healthcheck`
3. Wire into `chat.logic.ts` `onFinish` callback: after saving to PostgreSQL, also POST to Graphiti
4. Use `sessionId` as `group_id` for episode isolation
5. Unit tests for client (mocked HTTP)
6. Integration test: send chat message → verify episode appears in Graphiti

**Deliverable**: Every conversation turn is automatically ingested into Graphiti.

### Stage C: Context Assembly

**Goal**: LLM calls enriched with memory-retrieved context.

**Tasks:**
1. Create `server/memory/constants.ts` — budget defaults, scoring weights
2. Create `server/memory/context-assembler.ts`:
   - `assembleContext(message, sessionId)` → `AssembledContext`
   - Step 1: Query formulation (extract concepts from message)
   - Step 2: Parallel retrieval (hard rules from DB + Graphiti search + recent episodes)
   - Step 3: Score and rank results
   - Step 4: Allocate token budget, truncate if needed
   - Step 5: Build prioritized prompt sections
   - Step 6: Assemble final system prompt string
3. Integrate into `chat.logic.ts` — replace `preprompts.map(p => p.content).join("\n\n")` with `assembleContext()`
4. Ensure hard rules (preprompts with type='hard_rule') are always included regardless of Graphiti results
5. Log assembly metadata (token counts, retrieval stats, timing) via Langfuse
6. Unit tests with mocked Graphiti client
7. Integration test: verify enriched prompts contain both preprompts AND Graphiti knowledge

**Deliverable**: Every LLM call gets memory-enriched context.

### Stage D: Memory Panel UI

**Goal**: Browse what Graphiti has stored.

**Tasks:**
1. Create `app/routes/memories/index.tsx` — memory browser page
2. Create Nitro API route `GET /api/memories/search` — proxies to Graphiti search
3. Create Nitro API route `GET /api/memories/episodes` — proxies to Graphiti episodes
4. UI shows:
   - Recent episodes (conversation turns ingested)
   - Extracted entities and relationships
   - Search interface (query → facts)
5. Consider reusing D3.js graph visualization patterns from [zep-graph-visualization](https://github.com/getzep/zep-graph-visualization) (MIT, same stack)

**Deliverable**: Visual confirmation that memory system is working.

### Stage E: Memory Gatekeeper

**Goal**: Filter general knowledge, only ingest project-specific information.

**Tasks:**
1. Create `server/memory/gatekeeper.ts`:
   - `shouldIngest(userMessage, assistantResponse)` → `GatekeeperDecision`
   - Uses LLM call (via existing provider system) to classify
   - Rules-based fast path: always keep corrections, preferences, policies; always skip greetings, confirmations
   - LLM for ambiguous cases: "Is this team/project-specific?"
2. Wire into `chat.logic.ts` ingestion flow — gatekeeper runs before Graphiti POST
3. Make gatekeeper configurable: can be disabled for testing (ingest everything)
4. Add `experimental_telemetry` to gatekeeper LLM calls (Langfuse visibility)
5. Unit tests with example conversations
6. Integration test: verify general knowledge is filtered, specific knowledge is kept

**Deliverable**: Only project-relevant knowledge enters the memory graph.

### Stage F: Cognitive Models

**Goal**: Galatea models itself and its users.

**Tasks:**
1. Create `server/memory/cognitive-models.ts`:
   - `getSelfModel(personaId)` → `SelfModel`
   - `getUserModel(userName)` → `UserModel`
   - `updateSelfModel(personaId, observation)` — creates/updates self-model entities in Graphiti
   - `updateUserModel(userName, observation)` — creates/updates user-model entities in Graphiti
2. Determine when to update models:
   - Self-model: after corrections, errors, successful patterns
   - User-model: after preference expressions, explicit requests
3. Integrate self-model + user-model into context assembly (sections 4 & 5)
4. Use `POST /entity-node` for explicit model entity creation (not episode ingestion)
5. Use direct FalkorDB Cypher queries for structured model retrieval
6. Unit tests with mocked graph data
7. Integration test: correction → self-model updated → next response includes self-awareness

**Deliverable**: Galatea's prompts include self-awareness and user context.

---

## Testing Strategy

### Unit Tests (no Docker required)

| Test File | What It Tests |
|-----------|---------------|
| `graphiti-client.test.ts` | HTTP request shapes, error handling, timeout behavior (mocked fetch) |
| `context-assembler.test.ts` | Query formulation, ranking logic, token budget, prompt construction (mocked client) |
| `gatekeeper.test.ts` | Classification: "we use Clerk" → keep, "use try/catch" → skip (mocked LLM) |
| `cognitive-models.test.ts` | Self/user model assembly from graph data (mocked queries) |

### Integration Tests (require Docker: Graphiti + FalkorDB + Ollama)

| Test File | What It Tests |
|-----------|---------------|
| `graphiti-client.integration.test.ts` | Graphiti reachable, can add episode, can search, healthcheck |
| `chat-memory-flow.integration.test.ts` | Full flow: send message → episode ingested → next message gets enriched context |

### Manual Testing

- **FalkorDB Browser** (:13001) — Cypher queries to inspect graph state
- **Graphiti Swagger** (:18000/docs) — manually POST episodes, search, inspect
- **Optionally**: Graphiti MCP server for Claude-powered interactive testing

### CI Consideration

Integration tests require Docker (Graphiti + FalkorDB + Ollama). Tag them separately:
```typescript
// @vitest-environment node
// @vitest-tag integration
```
CI runs unit tests always, integration tests only when Docker is available.

---

## Development Prerequisites

### Required before starting Stage A:

1. **Ollama models pulled:**
   - `ollama pull gpt-oss:latest` (20GB — LLM for entity extraction)
   - `ollama pull nomic-embed-text` (embedding model)
2. **Docker Compose running:** existing PostgreSQL + FalkorDB healthy
3. **Verify Graphiti Docker image supports FalkorDB**: test `zepai/graphiti` image connects to FalkorDB (if not, build from source with `pip install graphiti-core[falkordb]`)

### Required before starting Stage B:

4. **Graphiti sidecar healthy** at :18000
5. **At least one test episode ingested** to verify the pipeline works end-to-end

### Required before starting Stage E:

6. **Gatekeeper LLM model**: Uses existing provider system (Ollama default). No additional models needed.

### Required before starting Stage F:

7. **Understanding of Graphiti custom entity types**: May need Pydantic model definitions in the Graphiti sidecar config for `SelfModel`, `UserModel`, `Weakness`, `Strength`, `Preference`, `Expectation` labels. OR use plain entity creation with custom labels (simpler).

---

## Open Questions

1. **Graphiti Docker image + FalkorDB**: Does the latest `zepai/graphiti` image include FalkorDB support? If not, we build from the repo's `/server` directory with `graphiti-core[falkordb]`.

2. **Ollama embedding model**: We chose `nomic-embed-text` as a reasonable default. Need to verify Graphiti's OpenAI-compatible embedder works with Ollama's `/v1/embeddings` endpoint.

3. **Graphiti structured output with gpt-oss**: This is the biggest risk. If `gpt-oss:latest` (20GB) can't reliably produce structured JSON for entity extraction, we escalate to OpenRouter. Need to test early in Stage A.

4. **group_id strategy**: Using `sessionId` as `group_id` isolates memory per session. Should we also have a global `group_id` for cross-session knowledge? Recommendation: use both — `sessionId` for session-specific episodes, `"global"` for promoted/shared knowledge.

5. **Cognitive model creation**: Use `POST /entity-node` (explicit) vs `POST /messages` (let Graphiti extract)? Recommendation: explicit creation for structured models.

6. **Procedural memory storage**: Graphiti entity attributes (Option A) vs PostgreSQL table (Option B)? Current recommendation: Option A (graph), revisit if success tracking is painful.

7. **Concurrent ingestion**: Multiple chat sessions ingesting simultaneously. Graphiti handles this via `group_id` isolation, but verify no race conditions in FalkorDB writes.

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Ollama structured output failures | Ingestion breaks | Documented escalation: Ollama → OpenRouter gpt-oss → OpenRouter Z-LM flash |
| Graphiti Docker image missing FalkorDB | Can't start | Build from source: `pip install graphiti-core[falkordb]`, custom Dockerfile |
| Context assembly adds too much latency | Slow chat | Parallel retrieval, caching, fallback to preprompts-only if Graphiti is down |
| Memory graph grows too large | Slow queries | group_id isolation, Graphiti community detection, future pruning (Phase 3+) |
| Gatekeeper too aggressive / too permissive | Bad memory quality | Configurable, can be disabled; tune with real conversation data |
| FalkorDB concurrent writes | Data corruption | Graphiti handles locking internally; test with parallel sessions |

---

## What's NOT in Phase 2

These are explicitly deferred to later phases:

- **Promotion engine** (episode → observation → fact → rule → procedure → shared) — Phase 3
- **Consolidation** (background promotion, decay) — Phase 3
- **Cross-agent learning** (shared memory pool, pattern detection) — Phase 4
- **Export/import** (persona portability) — Phase 5
- **Homeostasis integration** (knowledge_sufficiency assessment) — Phase 3
- **Activity router** (Level 0-3 classification, model selection) — Phase 3
- **MQTT observation pipeline** (external event ingestion) — Phase 5

---

*Document created: 2026-02-05*
*Status: Ready for implementation*
