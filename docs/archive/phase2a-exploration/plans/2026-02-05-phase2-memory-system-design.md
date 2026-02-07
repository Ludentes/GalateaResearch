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
  extra_hosts:
    - "host.docker.internal:host-gateway"  # Required on Linux (not needed on Docker Desktop)
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
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/healthcheck"]
    interval: 10s
    timeout: 5s
    retries: 5
```

**Notes:**
- `extra_hosts` is **required on Linux** — `host.docker.internal` is a Docker Desktop feature; on native Linux Docker, it needs the explicit `host-gateway` mapping
- Graphiti connects to FalkorDB via Docker network (internal port 6379)
- Ollama runs on host — accessed via `host.docker.internal:11434`
- `galatea_memory` graph is separate from Phase 1's `galatea` test graph — existing `galatea` graph from Phase 1 integration tests is untouched
- `SEMAPHORE_LIMIT: 5` controls LLM call concurrency during ingestion
- Embedding model `nomic-embed-text` must be pulled in Ollama before use: `ollama pull nomic-embed-text`
- LLM model `gpt-oss:latest` must also be available in Ollama
- **Embedding dimensions**: `nomic-embed-text` produces 768-dim vectors. Verify Graphiti's FalkorDB index creation is dimension-aware (not hardcoded to OpenAI's 1536). If mismatched, override or use a different embedding model.

### Environment Variables (.env)

```bash
# Graphiti (Phase 2)
GRAPHITI_URL=http://localhost:18000
```

### group_id Strategy

Graphiti uses `group_id` to isolate memory namespaces. Our strategy:

- **Ingestion**: Use `sessionId` as `group_id` — each conversation is stored in its own namespace
- **Search**: Pass `[sessionId, "global"]` as `group_ids` — search the current session + shared knowledge
- **Cognitive models**: Use `"global"` as `group_id` — self-model and user-model are cross-session
- **Promoted knowledge** (Phase 3+): When facts are promoted, they move to `"global"` group

This means early sessions will only see their own knowledge. Cross-session recall emerges as knowledge is promoted to `"global"` (Phase 3) or as cognitive models accumulate (Stage F).

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

**Staging note**: During Stages B-D, the gatekeeper is OFF — all conversation turns are ingested without filtering. This means the graph will contain noise (greetings, general knowledge, etc.) during early testing, which is acceptable. Stage E adds the gatekeeper filter.

**Error handling**: Ingestion failures in `onFinish` must NOT crash the user experience. PostgreSQL save happens first (critical), then memory ingestion (non-critical) is wrapped in try/catch:
```typescript
onFinish: async ({ text, usage }) => {
  // Critical: save to PostgreSQL
  await db.insert(messages).values({ ... })

  // Non-critical: ingest to memory
  try {
    await graphitiClient.addEpisode({ ... })
  } catch (error) {
    logger.error("Memory ingestion failed", error)
    // Do NOT rethrow — ingestion failure should not affect user
  }
}
```

### Flow 2: Retrieval (before each LLM call)

```
User sends message
  → Context Assembler (server/memory/context-assembler.ts):

    Step 1: Query Formulation
      Phase 2: Pass raw user message directly to Graphiti search.
      No LLM-based concept extraction (avoids latency + complexity).
      Graphiti's hybrid search (BM25 + vector) handles relevance.
      Phase 3+: Add LLM-based concept extraction, technology inference,
      and multi-query strategies from original design.

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
      Graphiti returns results with a single `score` (combined BM25 +
      vector + graph traversal). We re-rank with:
        finalScore = graphiti_score × 0.7 + recency × 0.2 + source_boost × 0.1
      Where recency = exponential decay from created_at (30-day half-life).
      Note: Graphiti does NOT return separate similarity/confidence fields.
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
      - Edge case: if hard rules alone exceed total budget, log
        warning, include all hard rules anyway, skip all other sections

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

**Graceful degradation**: If context assembly fails (Graphiti down, timeout, error), fall back to preprompts-only behavior (the Phase 1 path). Chat never breaks because memory is unavailable:
```typescript
let systemPrompt: string
try {
  const context = await assembleContext(message, sessionId)
  systemPrompt = context.systemPrompt
} catch (error) {
  // Graceful degradation: preprompts only (Phase 1 behavior)
  const activePrompts = await db.select().from(preprompts)
    .where(eq(preprompts.active, true))
    .orderBy(asc(preprompts.priority))
  systemPrompt = activePrompts.map((p) => p.content).join("\n\n")
  logger.warn("Memory system unavailable, using preprompts only", error)
}
```

**HTTP timeouts**: All Graphiti client calls must have timeouts:
- Search: 2000ms (on the critical path)
- Episode ingestion: 5000ms (non-blocking)
- Health check: 1000ms

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

**Dual-path architecture note**: Cognitive model retrieval uses direct FalkorDB Cypher queries (via existing `server/integrations/falkordb.ts` with `getGraph("galatea_memory")`) alongside the Graphiti HTTP client. This is intentional — Graphiti's search API is optimized for semantic similarity, not structured graph traversal. For queries like "get all weaknesses for persona X", direct Cypher is more reliable and faster. This means Stage F introduces a second connection path to FalkorDB. The existing `getGraph()` function already supports custom graph names.

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

**IMPORTANT**: The Graphiti response types below are **provisional** — based on API documentation and source code analysis. They MUST be verified against the actual Swagger docs at `:18000/docs` during Stage A before writing the client. Capture real response shapes and update these types accordingly.

```typescript
// server/memory/types.ts

/** Graphiti REST API request types */
export interface GraphitiEpisode {
  name: string
  episode_body: string
  source: "message" | "text" | "json"
  group_id: string
  reference_time: string  // ISO 8601
}

export interface GraphitiSearchRequest {
  query: string
  group_ids?: string[]
  num_results?: number
}

export interface GraphitiGetMemoryRequest {
  messages: Array<{ role: string; content: string }>
  group_id: string
}

/** Graphiti REST API response types (PROVISIONAL — verify against Swagger) */
export interface GraphitiSearchResult {
  uuid: string
  fact: string
  source_node_name: string
  target_node_name: string
  score: number               // Combined BM25 + vector + graph traversal
  valid_at: string | null
  invalid_at: string | null
  created_at: string
  // NOTE: No separate 'confidence' or 'similarity' fields.
  // Graphiti returns a single combined 'score'.
}

/** Graphiti error response */
export interface GraphitiError {
  detail: string | Array<{ loc: string[]; msg: string; type: string }>
  status_code: number
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
  source: "primary" | "concept" | "technology" | "constraint" | "episode" | "model"
  graphitiScore: number       // Raw score from Graphiti
  recency: number             // Computed from created_at (0-1, exponential decay)
  finalScore: number          // Re-ranked: graphitiScore × 0.7 + recency × 0.2 + sourceBoost × 0.1
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
// Failure policy: fail-OPEN. If the gatekeeper LLM call fails (timeout,
// malformed response, Ollama down), ingest the message anyway. Better to
// have noise in the graph than to lose potentially valuable knowledge.

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
- `.env.example` — Add `GRAPHITI_URL`
- `server/functions/chat.logic.ts` — Both `streamMessageLogic` and `sendMessageLogic` get context assembly + post-response ingestion. The non-streaming path (`sendMessageLogic`) uses the same `assembleContext()` for enriched prompts and the same try/catch graceful degradation.
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
8. **Capture actual API response shapes**: Hit `/docs` (Swagger), POST a test episode, capture JSON responses from `/search`, `/episodes/{group_id}`, `/get-memory`. Update `server/memory/types.ts` if they differ from provisional types.
9. Write integration test: sidecar health + basic add/search
10. Save sample responses as test fixtures in `server/memory/__tests__/fixtures/`

**Deliverable**: Graphiti sidecar running alongside existing stack. Actual API response shapes captured and documented.

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
3. Integrate into `chat.logic.ts` — replace `preprompts.map(p => p.content).join("\n\n")` with `assembleContext()` in **both** `streamMessageLogic` and `sendMessageLogic`
4. Add graceful degradation: try/catch around `assembleContext()`, fallback to preprompts-only
5. Ensure hard rules (preprompts with type='hard_rule') are always included regardless of Graphiti results
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

### Test Data Fixtures

Create `server/memory/__tests__/fixtures/` with:
- `graphiti-search-response.json` — sample `POST /search` response (captured from real sidecar during Stage A)
- `graphiti-episodes-response.json` — sample `GET /episodes/{group_id}` response
- `sample-conversations.ts` — example conversation turns for gatekeeper testing
- `sample-graph-data.ts` — mock cognitive model graph data for context assembly tests

**What we explicitly don't test:**
- Graphiti's internal entity extraction quality (that's Graphiti's problem)
- Ollama model quality (tested manually, escalation path documented)
- Embedding similarity thresholds (tuned empirically, not unit-testable)

**Integration test latency note**: Entity extraction with local Ollama can take 10-30s per episode. Integration tests that need ingestion should either: (a) use pre-ingested fixtures, or (b) have generous timeouts and be tagged for manual/CI-optional runs.

### CI / Environment Handling

Integration tests require Docker (Graphiti + FalkorDB + Ollama). Use environment-based skipping:
```typescript
// @vitest-environment node
const hasGraphiti = !!process.env.GRAPHITI_URL
describe.skipIf(!hasGraphiti)("Graphiti integration", () => { ... })
```
CI runs unit tests always, integration tests only when `GRAPHITI_URL` is set.

---

## Development Prerequisites

### Required before starting Stage A (RESOLVE THESE FIRST):

1. **Verify Graphiti Docker image supports FalkorDB:**
   ```bash
   docker pull zepai/graphiti
   # Try starting with FalkorDB config — if it fails, build from source:
   # git clone https://github.com/getzep/graphiti
   # cd graphiti/server
   # docker build -t galatea/graphiti --build-arg EXTRAS="[falkordb]" .
   ```
   If the official image doesn't include FalkorDB support, we need a custom Dockerfile.

2. **Ollama models pulled and verified:**
   ```bash
   ollama pull gpt-oss:latest   # 20GB — verify it fits in available VRAM/RAM
   ollama pull nomic-embed-text  # Embedding model (~274MB)
   ```
   **System requirements**: gpt-oss:latest (20GB) + nomic-embed-text + the main chat model (llama3.2) all need to coexist. Verify total memory budget.

3. **Verify embedding dimension compatibility:**
   `nomic-embed-text` produces 768-dim vectors. Check Graphiti source code (`build_indices_and_constraints()`) to confirm the FalkorDB vector index dimensions are derived from the embedding model, not hardcoded to 1536 (OpenAI default). If hardcoded, either override or use a different embedding model.

4. **Docker Compose running:** existing PostgreSQL + FalkorDB healthy

5. **Capture actual Graphiti API response shapes:**
   Once the sidecar is running, hit `/docs` (Swagger) and POST a test episode. Capture the actual JSON response from `POST /search`, `GET /episodes/{group_id}`, and `POST /get-memory`. Update the TypeScript types in `server/memory/types.ts` to match reality.

### Required before starting Stage B:

6. **Graphiti sidecar healthy** at :18000
7. **At least one test episode ingested** and searchable end-to-end

### Required before starting Stage E:

8. **Gatekeeper LLM model**: Uses existing provider system (Ollama default). No additional models needed.

### Required before starting Stage F:

9. **Understanding of Graphiti custom entity types**: May need Pydantic model definitions in the Graphiti sidecar config for `SelfModel`, `UserModel`, `Weakness`, `Strength`, `Preference`, `Expectation` labels. OR use plain entity creation with custom labels (simpler, recommended for Phase 2).
10. **Verify direct FalkorDB queries work against Graphiti's graph**: Use FalkorDB Browser (:13001) to run test Cypher queries against the `galatea_memory` graph to confirm node labels and relationship types match expectations.

---

## Open Questions

### Resolved

1. ~~**Graphiti Docker image + FalkorDB**~~ → Verify in Stage A prereqs. If not supported, build custom image.
2. ~~**Ollama embedding model**~~ → `nomic-embed-text` (768-dim). Verify dimension compatibility in prereqs.
3. ~~**group_id strategy**~~ → `sessionId` for episodes, `"global"` for cognitive models and promoted knowledge. Search both.
4. ~~**Cognitive model creation**~~ → Explicit `POST /entity-node` for structured models, not episode ingestion.

### Still Open

5. **Graphiti structured output with gpt-oss**: Biggest risk. If `gpt-oss:latest` (20GB) can't reliably produce structured JSON for entity extraction, we escalate to OpenRouter. Must test early in Stage A.

6. **Procedural memory storage**: Graphiti entity attributes (Option A) vs PostgreSQL table (Option B)? Current recommendation: Option A (graph), revisit if success tracking is painful.

7. **Concurrent ingestion**: Multiple chat sessions ingesting simultaneously. Graphiti handles this via `group_id` isolation, but verify no race conditions in FalkorDB writes.

8. **Episode granularity**: Currently ingesting full conversation turns ("user: X\nassistant: Y"). Should we ingest user and assistant messages separately? Or accumulate multiple turns into a single episode? Current approach (per-turn) is simplest.

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

These are explicitly deferred to later phases. The original memory system design (`2026-02-02-memory-system-design.md`) defined many features that Phase 2 intentionally simplifies or skips.

### Deferred to Phase 3 (Homeostasis + Learning)
- **Promotion engine** — episode → observation → fact → rule → procedure → shared hierarchy
- **Consolidation** — background promotion, confidence decay, periodic processing
- **Memory invalidation** — explicit `invalidateMemory()` with `SUPERSEDES` edges (Graphiti handles basic temporal invalidation, but our custom rules are deferred)
- **Cascade demotion** — when evidence is invalidated, dependent facts lose confidence
- **Circular promotion prevention** — source tagging, self-reinforcement discount
- **Homeostasis integration** — knowledge_sufficiency assessment before each LLM call
- **Activity router** — Level 0-3 classification, model selection per task

### Deferred to Phase 4+ (Cross-Agent + Advanced)
- **Memory Router** — classifying ingested content into specific types (semantic:fact, semantic:preference, procedural, etc.). Phase 2 relies on Graphiti's generic entity extraction. All knowledge enters the graph as Entity nodes with RELATES_TO edges. The original design's rich node type taxonomy is not implemented.
- **Rich custom edge types** — The original design defined 20+ edge types (CONTRIBUTED_TO, PROMOTED_TO, SUPERSEDES, HAS_STRENGTH, HAS_WEAKNESS, etc.). Phase 2 uses Graphiti's native `:RELATES_TO` edges with `fact` text properties. This is a significant simplification — queries based on edge type must use string matching on `fact` content instead.
- **Cross-agent learning** — shared memory pool, pattern detection across agents
- **Conflict resolution** — structured handling of contradictory facts from different agents
- **Abstraction quality checking** — preventing over-generalization during promotion

### Deferred to Phase 5+ (Infrastructure)
- **Export/import** — persona portability with privacy filters
- **MQTT observation pipeline** — external event ingestion from Home Assistant/Frigate
- **Pruning/archival** — moving old low-confidence superseded memories to cold storage
- **LLM-based query formulation** — multi-query strategies, concept extraction, technology inference (Phase 2 uses raw message as search query)

---

*Document created: 2026-02-05*
*Status: Ready for implementation*
