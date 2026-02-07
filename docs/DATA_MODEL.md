# Data Model & Access Patterns

**Last Updated:** 2026-02-07
**Phase:** Phase 3 Stage C Complete (Homeostasis Engine + Activity Router + Reflexion Loop)

---

## Overview

Galatea uses a **hybrid storage architecture**:
- **PostgreSQL** — Structured memory (facts, procedures, sessions, messages)
- **FalkorDB** — Graph memory (entities, relationships, episodes, temporal context)
- **Graphiti** — Middleware that manages FalkorDB via REST API

**Division of Labor:**
- PostgreSQL: Pattern-extracted facts, procedures, chat history, audit logs
- Graphiti/FalkorDB: LLM-extracted entities, relationships, episodic memory, graph traversal

---

## PostgreSQL Schema

### Core Tables

#### `personas`
**Purpose:** Agent identity and configuration
**Access:** Read-only during operation (seeded)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique persona identifier |
| `name` | TEXT | NOT NULL | Display name (e.g., "Expo Developer Agent") |
| `role` | TEXT | NOT NULL | Role description |
| `domain` | TEXT | | Domain expertise (e.g., "mobile", "backend") |
| `thresholds` | JSONB | | Configuration thresholds |
| `active` | BOOLEAN | DEFAULT true | Whether persona is active |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() | |

**Access Patterns:**
```sql
-- Get active persona by ID (context assembly)
SELECT * FROM personas WHERE id = $1 AND active = true;

-- List all active personas (session creation)
SELECT * FROM personas WHERE active = true ORDER BY name;
```

---

#### `sessions`
**Purpose:** Chat conversation sessions
**Access:** Read/write frequently (every message)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Session identifier (also FalkorDB group_id) |
| `name` | TEXT | | User-provided session name |
| `personaId` | UUID | FK → personas(id) | Active persona for this session |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | |
| `lastActiveAt` | TIMESTAMP | DEFAULT NOW() | Updated on every message |

**Indexes:**
```sql
CREATE INDEX idx_sessions_persona ON sessions(personaId);
CREATE INDEX idx_sessions_last_active ON sessions(lastActiveAt DESC);
```

**Access Patterns:**
```sql
-- Create session
INSERT INTO sessions (id, name, personaId) VALUES ($1, $2, $3) RETURNING *;

-- Get session by ID (every message)
SELECT * FROM sessions WHERE id = $1;

-- List recent sessions for UI
SELECT * FROM sessions ORDER BY lastActiveAt DESC LIMIT 20;

-- Update last active (every message)
UPDATE sessions SET lastActiveAt = NOW() WHERE id = $1;
```

---

#### `messages`
**Purpose:** Chat conversation history
**Access:** Write on every message, read for context window

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `sessionId` | UUID | FK → sessions(id) ON DELETE CASCADE | |
| `role` | TEXT | NOT NULL | "user" or "assistant" |
| `content` | TEXT | NOT NULL | Message text |
| `activityLevel` | INTEGER | | 0-3 (Phase 3: Activity Router classification) |
| `model` | TEXT | | LLM model used (e.g., "claude-sonnet-4-5") |
| `tokenCount` | INTEGER | | Total tokens (input + output) |
| `inputTokens` | INTEGER | | Input tokens |
| `outputTokens` | INTEGER | | Output tokens |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | |

**Indexes:**
```sql
CREATE INDEX idx_messages_session ON messages(sessionId, createdAt);
CREATE INDEX idx_messages_created ON messages(createdAt DESC);
```

**Access Patterns:**
```sql
-- Insert message (every chat turn)
INSERT INTO messages (id, sessionId, role, content, model, tokenCount, ...)
VALUES ($1, $2, $3, $4, $5, $6, ...) RETURNING *;

-- Get conversation history (every assistant response)
SELECT * FROM messages
WHERE sessionId = $1
ORDER BY createdAt ASC;

-- Get recent messages for context window
SELECT * FROM messages
WHERE sessionId = $1
ORDER BY createdAt DESC
LIMIT 10;
```

---

#### `preprompts`
**Purpose:** System prompts and hard rules injected into context
**Access:** Read-only during operation (seeded)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `name` | TEXT | UNIQUE NOT NULL | Identifier (e.g., "core-identity") |
| `type` | TEXT | | "hard_rule", "procedure", "identity" |
| `content` | TEXT | NOT NULL | Prompt text |
| `priority` | INTEGER | DEFAULT 50 | Lower = higher priority (≤10 = CONSTRAINTS, >10 = PROCEDURES) |
| `active` | BOOLEAN | DEFAULT true | |

**Indexes:**
```sql
CREATE INDEX idx_preprompts_active_priority ON preprompts(active, priority);
```

**Access Patterns:**
```sql
-- Get hard rules (priority ≤ 10) for CONSTRAINTS section
SELECT * FROM preprompts
WHERE active = true AND priority <= 10
ORDER BY priority ASC;

-- Get procedures (priority > 10) for PROCEDURES section
SELECT * FROM preprompts
WHERE active = true AND priority > 10
ORDER BY priority ASC;
```

---

#### `facts`
**Purpose:** Pattern-extracted structured facts from conversations
**Access:** Write fire-and-forget, read during context assembly

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `content` | TEXT | NOT NULL | Fact statement (e.g., "User prefers PostgreSQL") |
| `category` | TEXT | NOT NULL | "preference", "policy", "technology", "decision", "temporal", "hard_rule", "other" |
| `confidence` | REAL | DEFAULT 1.0 | 0.0-1.0 (reduced if conditional) |
| `entities` | TEXT[] | DEFAULT '{}' | Extracted entities (normalized) |
| `domain` | TEXT | | Domain scope (e.g., "mobile", "backend") |
| `validFrom` | TIMESTAMP | | Fact validity start |
| `validUntil` | TIMESTAMP | | Fact expiration |
| `supersededBy` | UUID | FK → facts(id) | Pointer to newer version |
| `sourceType` | TEXT | NOT NULL | "gatekeeper", "observation", "dialogue", "manual", "promotion" |
| `sourceId` | TEXT | | Reference to source (e.g., message ID) |
| `extractionMethod` | TEXT | | "pattern:preference_re", "ollama", etc. |
| `extractionVersion` | TEXT | | Version for reprocessing |
| `rawUserMessage` | TEXT | | Original user message (for reprocessing) |
| `rawAssistantMessage` | TEXT | | Original assistant response |
| `lastRetrievedAt` | TIMESTAMP | | Last time fact was used (for confidence decay) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() | |

**Indexes:**
```sql
CREATE INDEX idx_facts_category ON facts(category);
CREATE INDEX idx_facts_superseded ON facts(supersededBy) WHERE supersededBy IS NULL;
CREATE INDEX idx_facts_content_search ON facts USING gin(to_tsvector('english', content));
CREATE INDEX idx_facts_created ON facts(createdAt DESC);
```

**Access Patterns:**
```sql
-- Store fact with dedup check
SELECT * FROM facts
WHERE content = $1 AND supersededBy IS NULL
LIMIT 1;
-- If not exists:
INSERT INTO facts (id, content, category, confidence, entities, sourceType, ...)
VALUES ($1, $2, $3, $4, $5, $6, ...) RETURNING *;

-- Search facts by text (context assembly)
SELECT * FROM facts
WHERE content ILIKE '%' || $1 || '%'
  AND supersededBy IS NULL
ORDER BY createdAt DESC
LIMIT 20;

-- Get hard rules (CONSTRAINTS section)
SELECT * FROM facts
WHERE category = 'hard_rule'
  AND supersededBy IS NULL
ORDER BY confidence DESC;

-- Supersede fact
UPDATE facts SET supersededBy = $1, updatedAt = NOW() WHERE id = $2;
```

---

#### `procedures`
**Purpose:** Learned workflows and step-by-step procedures
**Access:** Read when trigger pattern matches user message

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `name` | TEXT | NOT NULL | Procedure name (e.g., "Start new Expo project") |
| `triggerPattern` | TEXT | NOT NULL | Pattern to match (e.g., "Need to create new mobile app") |
| `triggerContext` | TEXT[] | DEFAULT '{}' | Context keywords |
| `steps` | JSONB | NOT NULL | Array of step objects `[{step: 1, action: "..."}]` |
| `notes` | TEXT | | Additional context |
| `successRate` | REAL | DEFAULT 1.0 | Rolling average (0.0-1.0) |
| `timesUsed` | INTEGER | DEFAULT 0 | Usage counter |
| `learnedFrom` | TEXT[] | DEFAULT '{}' | Source references |
| `validUntil` | TIMESTAMP | | Expiration |
| `supersededBy` | UUID | FK → procedures(id) | Pointer to newer version |
| `sourceType` | TEXT | NOT NULL | "manual", "observation", "promotion" |
| `extractionVersion` | TEXT | | |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() | |

**Indexes:**
```sql
CREATE INDEX idx_procedures_trigger ON procedures(triggerPattern);
CREATE INDEX idx_procedures_superseded ON procedures(supersededBy) WHERE supersededBy IS NULL;
CREATE INDEX idx_procedures_success ON procedures(successRate DESC);
```

**Access Patterns:**
```sql
-- Find procedure by trigger (context assembly)
SELECT * FROM procedures
WHERE triggerPattern ILIKE '%' || $1 || '%'
  AND supersededBy IS NULL
ORDER BY successRate DESC
LIMIT 5;

-- Search procedures by topic
SELECT * FROM procedures
WHERE (name ILIKE '%' || $1 || '%' OR notes ILIKE '%' || $1 || '%')
  AND supersededBy IS NULL
ORDER BY successRate DESC;

-- Update success rate after usage
UPDATE procedures
SET successRate = (successRate * 0.7) + ($1 * 0.3),
    timesUsed = timesUsed + 1,
    updatedAt = NOW()
WHERE id = $2;
```

---

#### `gatekeeper_log`
**Purpose:** Audit log for all gatekeeper decisions
**Access:** Write fire-and-forget (every message evaluated)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `timestamp` | TIMESTAMP | DEFAULT NOW() | |
| `userMessage` | TEXT | NOT NULL | Original user message |
| `assistantMessage` | TEXT | NOT NULL | Generated response |
| `sessionId` | UUID | FK → sessions(id) ON DELETE CASCADE | |
| `decision` | TEXT | NOT NULL | "skip", "ingest_pattern", "ingest_llm", "ingest_failopen" |
| `reason` | TEXT | NOT NULL | Decision reasoning |
| `patternMatched` | TEXT | | Which pattern triggered (if pattern-based) |
| `extractionMethod` | TEXT | | "pattern:*" or "ollama" |
| `factsExtracted` | INTEGER | DEFAULT 0 | Number of facts extracted |
| `factIds` | UUID[] | DEFAULT '{}' | References to stored facts |
| `gatekeeperVersion` | TEXT | NOT NULL | Version for A/B testing |

**Indexes:**
```sql
CREATE INDEX idx_gatekeeper_session ON gatekeeper_log(sessionId, timestamp DESC);
CREATE INDEX idx_gatekeeper_decision ON gatekeeper_log(decision);
CREATE INDEX idx_gatekeeper_timestamp ON gatekeeper_log(timestamp DESC);
```

**Access Patterns:**
```sql
-- Log decision (fire-and-forget after every message)
INSERT INTO gatekeeper_log (id, userMessage, assistantMessage, sessionId, decision, ...)
VALUES ($1, $2, $3, $4, $5, ...) RETURNING *;

-- Analyze gatekeeper performance
SELECT decision, COUNT(*)
FROM gatekeeper_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY decision;

-- Find extraction failures
SELECT * FROM gatekeeper_log
WHERE decision = 'ingest_failopen'
  AND factsExtracted = 0
ORDER BY timestamp DESC;
```

---

#### `homeostasis_states`
**Purpose:** Stores 6-dimension homeostatic balance assessments (Phase 3 Stage A)
**Access:** Written by HomeostasisEngine, read for trend analysis and UI visualization
**Implementation:** `server/engine/homeostasis-engine.ts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `sessionId` | UUID | FK → sessions(id) ON DELETE CASCADE | |
| `messageId` | UUID | FK → messages(id) ON DELETE CASCADE | |
| `knowledge_sufficiency` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Does agent have enough info? |
| `certainty_alignment` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Is confidence justified? |
| `progress_momentum` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Is task moving forward? |
| `communication_health` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Is dialogue productive? |
| `productive_engagement` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Is agent actively contributing? |
| `knowledge_application` | TEXT | NOT NULL | "LOW", "HEALTHY", "HIGH" — Balancing learning vs doing? |
| `assessment_method` | JSONB | NOT NULL | Records method per dimension: {"knowledge_sufficiency": "computed", ...} |
| `assessed_at` | TIMESTAMP | DEFAULT NOW() | When assessment was performed |

**Indexes:**
```sql
CREATE INDEX idx_homeostasis_session ON homeostasis_states(sessionId, assessedAt DESC);
CREATE INDEX idx_homeostasis_message ON homeostasis_states(messageId);
```

**Access Patterns:**
```sql
-- Store homeostasis state (after Level 2-3 assessments)
INSERT INTO homeostasis_states (
  id, sessionId, messageId,
  knowledge_sufficiency, certainty_alignment, progress_momentum,
  communication_health, productive_engagement, knowledge_application,
  assessment_method, assessed_at
) VALUES (
  $1, $2, $3,
  $4, $5, $6,
  $7, $8, $9,
  $10, NOW()
) RETURNING *;

-- Get latest state for session (for UI display)
SELECT * FROM homeostasis_states
WHERE sessionId = $1
ORDER BY assessed_at DESC
LIMIT 1;

-- Get state for specific message (for debugging)
SELECT * FROM homeostasis_states
WHERE messageId = $1;

-- Analyze dimension trends (count states over time)
SELECT
  DATE_TRUNC('hour', assessed_at) as hour,
  knowledge_sufficiency,
  COUNT(*) as count
FROM homeostasis_states
WHERE sessionId = $1
GROUP BY hour, knowledge_sufficiency
ORDER BY hour DESC;
```

---

## FalkorDB/Graphiti Schema

### Configuration

**Environment Variables (docker-compose.yml):**
```yaml
FALKORDB_DATABASE: "galatea_memory"  # Single shared graph for all sessions
```

**Graph Name:** `galatea_memory`
**All sessions share one graph** — `group_id` (sessionId) is stored as node metadata, not as separate databases.

---

### Node Types

#### Entity Nodes
**Label:** `entity`
**Purpose:** Named entities extracted from conversations

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `uuid` | String | Unique identifier |
| `name` | String | Entity name (e.g., "PostgreSQL", "React", "Sarah") |
| `entity_type` | String | "technology", "person", "organization", "concept" |
| `created_at` | DateTime | |
| `group_id` | String | Session UUID (for multi-tenant isolation) |

**Access Patterns:**
```cypher
// Find entity by name
MATCH (e:entity {name: "PostgreSQL"}) RETURN e

// Get all entities for a session
MATCH (e:entity {group_id: $sessionId}) RETURN e

// Find entities by type
MATCH (e:entity {entity_type: "technology"}) RETURN e.name
```

---

#### Fact Nodes
**Label:** `fact_node`
**Purpose:** Extracted factual statements with temporal validity

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `uuid` | String | Unique identifier |
| `name` | String | Fact identifier/summary |
| `fact` | String | Full fact text (e.g., "User prefers PostgreSQL for database work") |
| `valid_at` | DateTime | When fact became valid |
| `invalid_at` | DateTime \| null | When fact was invalidated |
| `created_at` | DateTime | |
| `expired_at` | DateTime \| null | |
| `group_id` | String | Session UUID |

**Relationships:**
- `(fact_node)-[:MENTIONS]->(entity)` — Fact mentions entity
- `(fact_node)-[:SUPERSEDES]->(fact_node)` — Newer fact replaces old

**Access Patterns:**
```cypher
// Search facts by text (hybrid search via Graphiti API)
POST /search
{
  "query": "PostgreSQL",
  "group_ids": ["session-uuid", "global"],
  "max_facts": 20
}

// Get facts about an entity
MATCH (f:fact_node)-[:MENTIONS]->(e:entity {name: "PostgreSQL"})
RETURN f.fact, f.valid_at
ORDER BY f.created_at DESC

// Get active facts (not expired or invalidated)
MATCH (f:fact_node)
WHERE f.invalid_at IS NULL
  AND (f.expired_at IS NULL OR f.expired_at > datetime())
RETURN f
```

---

#### Episode Nodes
**Label:** `episodic_node`
**Purpose:** Conversation turns (user message + assistant response)

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `uuid` | String | Unique identifier |
| `name` | String | Episode identifier |
| `content` | String | Combined user + assistant messages |
| `source` | String | "user" or "assistant" |
| `source_description` | String | "session:UUID" |
| `created_at` | DateTime | |
| `valid_at` | DateTime | When episode occurred |
| `group_id` | String | Session UUID |

**Relationships:**
- `(episode)-[:MENTIONS]->(entity)` — Episode mentions entity
- `(episode)-[:LEADS_TO]->(episode)` — Temporal sequence

**Access Patterns:**
```cypher
// Get recent episodes for session (RECENT ACTIVITY section)
GET /episodes/{group_id}?last_n=20

// Get episodes mentioning entity
MATCH (ep:episodic_node)-[:MENTIONS]->(e:entity {name: "PostgreSQL"})
WHERE ep.group_id = $sessionId
RETURN ep.content, ep.created_at
ORDER BY ep.created_at DESC

// Get conversation flow
MATCH path = (ep1:episodic_node)-[:LEADS_TO*]->(ep2:episodic_node)
WHERE ep1.group_id = $sessionId
RETURN path
```

---

### Edge Types (Relationships)

| Edge | Source → Target | Purpose |
|------|-----------------|---------|
| `MENTIONS` | fact_node → entity | Fact references entity |
| `MENTIONS` | episodic_node → entity | Episode references entity |
| `SUPERSEDES` | fact_node → fact_node | Newer fact replaces older |
| `LEADS_TO` | episodic_node → episodic_node | Temporal conversation flow |
| `WORKS_WITH` | entity(person) → entity(person) | Relationship between people |
| `USES` | entity(person) → entity(technology) | Person uses technology |
| `PART_OF` | entity → entity | Hierarchical relationships |

---

## Data Flow Diagram

```
User Message
     ↓
┌────────────────────────────────────────────────────────────┐
│ 1. Store message → PostgreSQL `messages` table            │
└────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────┐
│ 2. Assemble Context                                        │
│    ├─ CONSTRAINTS (preprompts ≤10, facts.hard_rule)      │
│    ├─ PROCEDURES (preprompts >10, procedures.trigger)    │
│    ├─ KNOWLEDGE (Graphiti search + local facts)          │
│    ├─ RECENT ACTIVITY (Graphiti episodes)                │
│    ├─ SELF-AWARENESS (Graphiti cognitive models)         │
│    └─ USER CONTEXT (Graphiti user model)                 │
└────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────┐
│ 3. Generate LLM Response                                   │
└────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────┐
│ 4. Store response → PostgreSQL `messages` table           │
└────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────┐
│ 5. Fire-and-Forget Memory Pipeline (processMemoryPipeline)│
│                                                            │
│   5a. Gatekeeper + Pattern Extraction                     │
│       ├─ evaluateAndExtract(userMsg, assistantMsg)       │
│       └─ Returns: {decision, extractedFacts, needsLlm}   │
│                                                            │
│   5b. Store Facts → PostgreSQL `facts` table              │
│       └─ storeFact(db, {...}) with dedup                 │
│                                                            │
│   5c. LLM Fallback (if needsLlmExtraction)               │
│       ├─ runExtractionOrchestrator([ollamaExtractor])    │
│       └─ storeFact(db, {...}) for each LLM fact          │
│                                                            │
│   5d. Log Decision → PostgreSQL `gatekeeper_log`          │
│       └─ logGatekeeperDecision(db, {...})               │
│                                                            │
│   5e. Ingest to Graphiti (if shouldIngest)               │
│       └─ ingestMessages(sessionId, graphitiMessages)     │
│           ↓ (async NLP pipeline)                          │
│           └─ FalkorDB `galatea_memory` graph             │
│               ├─ Creates entity nodes                     │
│               ├─ Creates fact_node nodes                  │
│               ├─ Creates episodic_node nodes              │
│               └─ Creates relationship edges               │
│                                                            │
│   5f. Update Cognitive Models (if applicable)            │
│       ├─ updateSelfModel (if correction)                 │
│       └─ updateUserModel (if preference)                 │
└────────────────────────────────────────────────────────────┘
```

---

## Access Pattern Summary

### Context Assembly (Read-Heavy)

**Every assistant response triggers these queries:**

1. **PostgreSQL:**
   ```sql
   -- Hard rules (CONSTRAINTS section)
   SELECT * FROM preprompts WHERE active=true AND priority<=10;
   SELECT * FROM facts WHERE category='hard_rule' AND supersededBy IS NULL;

   -- Procedures (PROCEDURES section)
   SELECT * FROM preprompts WHERE active=true AND priority>10;
   SELECT * FROM procedures WHERE triggerPattern ILIKE '%message%';

   -- Local facts (KNOWLEDGE section - if implemented)
   SELECT * FROM facts WHERE content ILIKE '%query%' AND supersededBy IS NULL LIMIT 20;
   ```

2. **Graphiti/FalkorDB:**
   ```cypher
   -- Graphiti search (KNOWLEDGE section)
   POST /search { query, group_ids: [sessionId, "global"], max_facts: 20 }

   -- Episodes (RECENT ACTIVITY section)
   GET /episodes/{sessionId}?last_n=20

   -- Cognitive models (SELF-AWARENESS, USER CONTEXT)
   POST /search { query: "persona:{id} capabilities", group_ids: [personaId] }
   POST /search { query: "user:{name} preferences", group_ids: [userName] }
   ```

### Memory Storage (Write-Heavy, Fire-and-Forget)

**Every message triggers these writes:**

1. **PostgreSQL:**
   ```sql
   -- Message storage (synchronous)
   INSERT INTO messages (...) VALUES (...);

   -- Fact storage (fire-and-forget)
   INSERT INTO facts (...) VALUES (...);

   -- Gatekeeper log (fire-and-forget)
   INSERT INTO gatekeeper_log (...) VALUES (...);
   ```

2. **Graphiti/FalkorDB:**
   ```
   -- Message ingestion (fire-and-forget, async processing)
   POST /messages { group_id: sessionId, messages: [...] }

   → (Graphiti processes asynchronously)
   → Creates entity, fact_node, episodic_node nodes
   → Creates MENTIONS, LEADS_TO edges
   ```

---

## Phase 3: Homeostasis Engine (In-Memory)

**Status:** Stage A Complete (2026-02-07)
**Implementation:** `server/engine/homeostasis-engine.ts`

### Overview

The Homeostasis Engine is the **psychological core** of Galatea. It assesses 6 dimensions of agent balance and provides guidance when imbalances are detected. Unlike other components, the engine operates **in-memory** during chat flow — assessment results are only persisted to `homeostasis_states` table for historical analysis.

### Architecture

```
User Message
     │
     ▼
Activity Router (Stage B) ──> Determines if homeostasis assessment needed
     │
     ▼
HomeostasisEngine.assessAll(context)
     ├─> Computed assessments (fast, <1ms)
     │   ├─ progress_momentum
     │   ├─ communication_health
     │   └─ productive_engagement
     │
     └─> LLM-ready assessments (heuristic for now)
         ├─ knowledge_sufficiency
         ├─ certainty_alignment
         └─ knowledge_application
     │
     ▼
HomeostasisState (6 dimensions × LOW/HEALTHY/HIGH)
     │
     ▼
HomeostasisEngine.getGuidance(state)
     │
     ▼
GuidanceText (priority-based, actionable advice)
     │
     ▼
Injected into prompt (HOMEOSTASIS GUIDANCE section)
```

### 6 Dimensions

| Dimension | Question | Assessment Method | Thresholds |
|-----------|----------|-------------------|------------|
| `knowledge_sufficiency` | "Do I know enough?" | Heuristic (fact count, confidence) | LOW: <5 facts or <0.7 confidence<br>HEALTHY: ≥5 facts + ≥0.7 conf<br>HIGH: >20 facts + low conf |
| `certainty_alignment` | "Does confidence match stakes?" | Heuristic (keyword detection) | LOW: Uncertainty + high-stakes<br>HEALTHY: Balanced<br>HIGH: No uncertainty + high-stakes |
| `progress_momentum` | "Am I moving forward?" | Computed (time + actions) | LOW: >30min + <3 actions<br>HEALTHY: Balanced<br>HIGH: >10 actions in <10min |
| `communication_health` | "Am I connected?" | Computed (time since last msg) | LOW: >10min silence<br>HEALTHY: 2-10min<br>HIGH: <2min (rapid back-and-forth) |
| `productive_engagement` | "Am I contributing?" | Computed (task status) | LOW: No assigned task<br>HEALTHY: Has task<br>HIGH: TBD (needs LLM) |
| `knowledge_application` | "Learning vs doing?" | Heuristic (time tracking) | LOW: <20% research<br>HEALTHY: 20-80% research<br>HIGH: >80% research (paralysis) |

### Guidance System

**Configuration:** `server/engine/guidance.yaml` (202 lines)

**Priority Levels** (when multiple dimensions imbalanced):
1. **Priority 1** (Highest): `knowledge_sufficiency` LOW, `certainty_alignment` LOW
2. **Priority 2** (High): `progress_momentum` LOW, `productive_engagement` LOW, `knowledge_application` HIGH
3. **Priority 3** (Moderate): `certainty_alignment` HIGH, `communication_health` LOW
4. **Priority 4** (Lower): `progress_momentum` HIGH, `productive_engagement` HIGH
5. **Priority 5** (Low): `knowledge_sufficiency` HIGH, `knowledge_application` LOW
6. **Priority 6** (Lowest): `communication_health` HIGH

**Logic:** Safety issues (knowledge gaps, uncertainty about high-stakes actions) are prioritized over refinements (overconfidence, over-communication).

### AgentContext Interface

The assessment requires this context:

```typescript
interface AgentContext {
  sessionId: string
  currentMessage: string
  messageHistory: Array<{ role: string; content: string }>
  retrievedFacts?: Array<{ content: string; confidence: number }>
  retrievedProcedures?: Array<{ name: string; success_rate: number }>
  lastMessageTime?: Date
  currentTaskStartTime?: Date
  recentActionCount?: number
  hasAssignedTask?: boolean
  timeSpentResearching?: number  // milliseconds
  timeSpentBuilding?: number     // milliseconds
}
```

### Performance Characteristics

- **Fast path** (`assessQuick`): <1ms (computed only, 3 dimensions)
- **Full assessment** (`assessAll`): ~5-10ms (all 6 dimensions, parallel execution)
- **Guidance lookup**: <1ms (cached YAML config)

### Future Enhancements (Post-Stage A)

1. **LLM Upgrade Path** (Stage D/E):
   - Replace heuristics with true LLM reasoning
   - Method tracking: `assessment_method` field records "computed" vs "llm"
   - TODOs marked at lines 402, 484, 616 in `homeostasis-engine.ts`

2. **Dynamic Thresholds** (Phase 6):
   - Learn optimal thresholds from historical data
   - Persona-specific calibration

3. **Multi-Agent Coordination** (Phase 7+):
   - Cross-agent homeostasis awareness
   - Team-level balance assessment

### Testing

- **Unit Tests:** 38 tests in `server/engine/__tests__/homeostasis-engine.unit.test.ts`
- **Coverage:** Estimated 85-90% (all critical paths covered)
- **Code Review:** 92/100 score (agent a62c6d7)

---

## Phase 3: Activity Router (In-Memory)

**Status:** Stage B Complete (2026-02-07)
**Implementation:** `server/engine/activity-router.ts`, `server/engine/classification-helpers.ts`

### Overview

The Activity Router is the **cost optimization engine** for Galatea. It classifies incoming tasks into 4 activity levels (0-3) and selects the optimal model for execution, achieving up to 93% cost savings on routine tasks while maintaining quality on high-stakes operations.

### Architecture

```
User Message
     │
     ▼
enrichTaskWithFlags() ──> Compute risk/pattern flags
     │
     ▼
ActivityRouter.classify(task, procedure, homeostasis)
     │
     ├─> Level 0: Templates, tool calls → none ($0)
     ├─> Level 3: High-risk → sonnet + reflexion
     ├─> Level 1: Strong procedure → haiku ($0.001/1k tokens)
     └─> Level 2: Default → sonnet ($0.015/1k tokens)
     │
     ▼
selectModel(level) ──> Returns ModelSpec from config/models.yaml
     │
     ▼
Execute with selected model
```

### Activity Levels

| Level | Name | Triggers | Model | Cost | Use Case |
|-------|------|----------|-------|------|----------|
| 0 | Direct | Templates (`done`, `ok`), tool calls | none | $0 | No LLM needed |
| 1 | Pattern | Strong procedure (>80% success, >5 uses) | haiku | $0.001/1k | Established patterns |
| 2 | Reason | Default for most tasks | sonnet | $0.015/1k | Standard implementation |
| 3 | Reflect | High-risk, knowledge gaps, homeostasis LOW | sonnet + loop | $0.030-$0.045/1k | Critical decisions |

**Priority Order:** Level 0 > Level 3 > Level 1 > Level 2

### Classification Logic

**Decision Tree (lines 143-189 in `activity-router.ts`):**

1. **Level 0 Check** (Direct Execution):
   ```typescript
   if (task.isToolCall || task.isTemplate) → Level 0
   ```
   - Tool calls: `isToolCall` flag (MCP tool invocations)
   - Templates: 8 patterns (`done`, `ok`, `completed`, `tests passing`, etc.)

2. **Level 3 Check** (Reflexion Required):
   ```typescript
   if (_needsReflexion(task, homeostasis)) → Level 3
   ```
   Triggers:
   - Explicit knowledge gap: `task.hasKnowledgeGap` (10 uncertainty markers)
   - High-stakes + irreversible: Both flags set (13 irreversible keywords × 12 high-stakes keywords)
   - LOW knowledge + high stakes: `homeostasis.knowledge_sufficiency === "LOW"` AND `task.isHighStakes`
   - LOW certainty + irreversible: `homeostasis.certainty_alignment === "LOW"` AND `task.isIrreversible`

3. **Level 1 Check** (Procedure Match):
   ```typescript
   if (hasProcedureMatch(procedure)) → Level 1
   ```
   - Success rate ≥ 80%
   - Times used ≥ 5

4. **Level 2 Default**:
   ```typescript
   → Level 2 (Standard reasoning)
   ```

### Pattern Detection

**Classification Helpers (`classification-helpers.ts`):**

| Helper Function | Patterns | Example Keywords |
|----------------|----------|-----------------|
| `isTemplateMessage` | 8 | done, ok, ready, completed, tests passing |
| `isIrreversibleAction` | 13 | force push, drop table, rm -rf, hard reset, delete production |
| `isHighStakesAction` | 12 | production, deploy, security, authentication, database migration |
| `hasKnowledgeGap` | 10 | how do i, not sure, unclear, help me, never done |
| `hasProcedureMatch` | Thresholds | success_rate ≥ 0.8, times_used ≥ 5 |

**Pattern Examples:**

```typescript
// Irreversible (lines 76-96)
"force push", "force-push", "--force", "git push -f",
"drop table", "drop database", "delete database",
"rm -rf", "delete production", "hard reset",
"git reset --hard", "delete branch", "prune", "truncate table"

// High-stakes (lines 117-134)
"production", "deploy", "release", "publish",
"security", "authentication", "authorization", "permissions",
"credentials", "database migration", "schema change",
"public api", "breaking change"

// Knowledge gap (lines 155-169)
"how do i", "how to", "not sure", "don't know",
"unclear", "help me", "what is", "explain",
"never done", "first time"
```

### Model Configuration

**YAML Structure (`config/models.yaml`):**

```yaml
models:
  none:
    id: none
    provider: none
    model_id: none
    suitable_for: [0]
    cost_per_1k_tokens: 0

  haiku:
    id: haiku
    provider: anthropic
    model_id: claude-haiku-4-5-20251001
    characteristics: [fast, cheap, pattern-following, procedure-execution]
    suitable_for: [1]
    cost_per_1k_tokens: 0.001
    temperature: 0.3  # Lower for consistent procedure following

  sonnet:
    id: sonnet
    provider: anthropic
    model_id: claude-sonnet-4-5-20250929
    characteristics: [capable, reasoning, implementation, analysis, reflexion]
    suitable_for: [2, 3]
    cost_per_1k_tokens: 0.015
    temperature: 0.7  # Higher for creative problem-solving
```

**Loading & Fallback:**
- Cached on first load (lines 50-115)
- Graceful fallback to hardcoded defaults if YAML missing
- Error logged but application continues

### Homeostasis Integration

The Activity Router integrates with the Homeostasis Engine to escalate tasks when psychological dimensions are imbalanced:

**Escalation Rules (`_needsReflexion()`, lines 227-275):**

| Condition | Escalation | Reason |
|-----------|-----------|---------|
| LOW `knowledge_sufficiency` + `isHighStakes` | → Level 3 | Need research before risky action |
| LOW `certainty_alignment` + `isIrreversible` | → Level 3 | Uncertain about permanent action |
| Explicit `hasKnowledgeGap` | → Level 3 | Agent doesn't know how to proceed |
| `isHighStakes` AND `isIrreversible` | → Level 3 | Doubly dangerous |

**Example Flow:**

```
User: "deploy to production"
  └─> enrichTaskWithFlags() → isHighStakes = true
  └─> HomeostasisEngine.assessAll() → knowledge_sufficiency = "LOW" (no facts about prod deploy)
  └─> ActivityRouter.classify() → Level 3 (Knowledge gap + high stakes)
  └─> selectModel(3) → sonnet with reflexion loop
```

### Cost Optimization

**Target Distribution (from Phase 3 plan):**
- Level 0-1: >60% of activities
- Level 2: ~30% of activities
- Level 3: <10% of activities

**Savings Calculation:**

```
Weighted avg cost = (0.6 × $0.0005) + (0.3 × $0.015) + (0.1 × $0.035)
                  = $0.0003 + $0.0045 + $0.0035
                  = $0.0083 per 1k tokens

Always-Sonnet cost = $0.015 per 1k tokens

Savings = ($0.015 - $0.0083) / $0.015 = 44.7% ≈ 45%
```

**Haiku vs Sonnet (Level 1):**
```
Savings = ($0.015 - $0.001) / $0.015 = 93%
```

### Type Definitions

**Core Types (`server/engine/types.ts`, lines 93-158):**

```typescript
// Activity levels (0-3 spectrum)
export type ActivityLevel = 0 | 1 | 2 | 3

// Classification result
export interface ActivityClassification {
  level: ActivityLevel
  reason: string              // Why this level was chosen
  model: ModelType            // Which model to use ("none" | "haiku" | "sonnet")
  skipMemory: boolean         // Optimization: skip memory lookup
  skipHomeostasis: boolean    // Optimization: skip homeostasis assessment
}

// Task with computed flags
export interface Task {
  message: string
  sessionId: string
  isToolCall?: boolean        // MCP tool invocation
  isTemplate?: boolean        // Boilerplate response
  isIrreversible?: boolean    // Can't undo (force push, drop table)
  isHighStakes?: boolean      // High impact (production, security)
  hasKnowledgeGap?: boolean   // Agent doesn't know how to proceed
}

// Model specification
export interface ModelSpec {
  id: string                  // "none" | "haiku" | "sonnet" | "opus"
  provider: string            // "anthropic" | "openrouter" | "ollama"
  model_id: string            // Actual model identifier
  characteristics: string[]   // Tags describing model capabilities
  suitable_for: ActivityLevel[] // Which levels can use this model
  cost_per_1k_tokens: number  // Cost per 1k tokens
  temperature?: number        // Optional temperature override
  max_tokens?: number         // Optional max tokens
}

// Procedure (for Level 1 matching)
export interface Procedure {
  id: number
  name: string
  trigger_pattern: string
  trigger_context: string[]
  steps: any[]                // JSONB: order + instruction + toolCall
  success_rate: number        // 0-1 (must be ≥0.8 for Level 1)
  times_used: number          // Count (must be ≥5 for Level 1)
}
```

### Future Enhancements (Post-Stage B)

1. **Distribution Tracking** (Stage E):
   - Log actual Level 0-3 distribution in production
   - Validate cost model assumptions
   - Adjust thresholds if distribution skews

2. **Pattern Tuning** (Phase 4):
   - Add 11 suggested patterns from code review (see `docs/STAGE_B_ENHANCEMENTS.md`)
   - Analyze false positives/negatives in production
   - ML-based pattern learning

3. **Model Provider Expansion** (Phase 4+):
   - Add OpenRouter support (multi-provider routing)
   - Add Ollama support (local models for Level 0-1)
   - Add model-specific tool support

4. **Performance Optimization** (Phase 5):
   - Cache classification results for identical messages
   - Batch homeostasis assessments
   - Async model selection

### Testing

- **Unit Tests:** 71 tests across 3 suites
  - `classification-helpers.unit.test.ts`: 38 tests (pattern detection)
  - `activity-router.unit.test.ts`: 22 tests (classification logic)
  - `stage-b-integration.test.ts`: 11 tests (homeostasis integration)
- **Coverage:** All critical paths + edge cases
- **Code Review:** Grade A (Excellent) - Production Ready (agent aa2c024)

### Known Gaps

**Nice-to-Have Enhancements** (documented in `docs/STAGE_B_ENHANCEMENTS.md`):
1. Enhanced YAML validation (catch config errors earlier)
2. Additional risk patterns (11 patterns for DevOps/Kubernetes workflows)
3. Environment variable model override (A/B testing support)
4. Inline pattern explanations (maintainer documentation)
5. Edge case tests (empty message, unicode, long messages)

**Estimated effort:** 2-3 hours total (low priority, defer to Phase 4+)

---

## Phase 3: Reflexion Loop (In-Memory)

**Status:** Stage C Complete (2026-02-07)
**Implementation:** `server/engine/reflexion-loop.ts`

### Overview

The Reflexion Loop implements **iterative self-improvement** for Level 3 (high-risk) tasks. Based on research by Shinn et al. (2023), it executes a Draft → Evidence → Critique → Revise cycle until the draft passes quality checks or max iterations are reached.

### Architecture

```
Level 3 Task
     │
     ▼
ReflexionLoop.execute(task, context, maxIterations=3)
     │
     ▼
┌─────────────────────────────────────────────┐
│ Iteration 1                                 │
│  ├─> _generateInitialDraft()                │
│  ├─> _gatherEvidence()                      │
│  ├─> _generateCritique()                    │
│  └─> if (critique.passes) → EXIT SUCCESS   │
└─────────────────────────────────────────────┘
     │ (if critique fails)
     ▼
┌─────────────────────────────────────────────┐
│ Iteration 2                                 │
│  ├─> _reviseDraft(previousCritique)        │
│  ├─> _gatherEvidence()                      │
│  ├─> _generateCritique()                    │
│  └─> if (critique.passes) → EXIT SUCCESS   │
└─────────────────────────────────────────────┘
     │ (if critique fails)
     ▼
┌─────────────────────────────────────────────┐
│ Iteration 3 (final)                        │
│  ├─> _reviseDraft(previousCritique)        │
│  ├─> _gatherEvidence()                      │
│  ├─> _generateCritique()                    │
│  └─> EXIT (success if passes, failure if not)│
└─────────────────────────────────────────────┘
     │
     ▼
ReflexionResult {
  final_draft: string
  iterations: ReflexionIteration[]
  total_llm_calls: number
  success: boolean
}
```

### Loop Flow

**Sequence** (lines 68-134 in `reflexion-loop.ts`):

1. **Iteration 1**: Generate initial draft
2. **All Iterations**: Gather evidence → Generate critique → Check exit conditions
3. **Iterations 2-3**: Revise draft based on previous critique
4. **Exit Conditions**:
   - Critique passes (`critique.passes === true`) → SUCCESS
   - Max iterations reached (`i === maxIterations - 1`) → FAILURE

### Exit Conditions

**Early Exit** (Success):
```typescript
if (critique.passes) {
  return {
    final_draft: currentDraft,
    iterations,
    total_llm_calls: totalLlmCalls,
    success: true
  }
}
```

**Max Iterations** (Failure):
```typescript
if (i === maxIterations - 1) {
  return {
    final_draft: currentDraft,  // Best effort, even if failed critique
    iterations,
    total_llm_calls: totalLlmCalls,
    success: false
  }
}
```

### Type Definitions

**Core Types** (`server/engine/types.ts`, lines 159-209):

```typescript
// Result of reflexion loop execution
export interface ReflexionResult {
  final_draft: string           // Best draft (passed critique or last iteration)
  iterations: ReflexionIteration[]  // Full trace of all iterations
  total_llm_calls: number       // Cost tracking
  success: boolean              // Did critique pass, or hit max iterations?
}

// Single iteration trace
export interface ReflexionIteration {
  iteration_number: number      // 1-indexed
  draft: string                 // Draft text for this iteration
  evidence: Evidence[]          // Evidence gathered to support/refute draft
  critique: Critique            // Quality assessment
  revised: boolean              // Was this draft revised (false for iteration 1)
}

// Evidence supporting or refuting draft
export interface Evidence {
  source: "memory" | "codebase" | "documentation"
  content: string
  relevance: number             // 0-1 relevance score
  supports_claim?: string       // Which claim in draft this supports
}

// Quality critique of draft
export interface Critique {
  issues: Issue[]               // Identified problems
  confidence: number            // 0-1 confidence in critique
  passes: boolean               // Does draft meet quality bar?
}

// Issue identified in draft
export interface Issue {
  type: "missing" | "unsupported" | "incorrect"
  description: string           // Human-readable explanation
  severity: "minor" | "major" | "critical"
  suggested_fix?: string        // Actionable suggestion
}
```

### Stage C Implementation Status

**Completed Infrastructure** ✅:
- [x] Loop structure (for loop with max iterations)
- [x] Iteration tracking (ReflexionIteration[] with all metadata)
- [x] Exit conditions (critique passes OR max iterations)
- [x] LLM call tracking (total_llm_calls counter)
- [x] Type-safe interfaces
- [x] 24 comprehensive tests

**Placeholders** (Deferred to Stage E) ⚠️:
- [ ] `_generateInitialDraft()` - Returns placeholder text
- [ ] `_gatherEvidence()` - Returns memory placeholder
- [ ] `_generateCritique()` - Returns always-passing placeholder
- [ ] `_reviseDraft()` - Returns placeholder revision

**Status**: Infrastructure complete, LLM integration deferred to Stage E. See `docs/PLACEHOLDERS_AND_DEFERRALS.md` for upgrade paths.

### Performance Characteristics (Target)

**Placeholder Performance** (Current):
- Single iteration: <1ms (synchronous placeholders)
- Full loop (3 iterations): <3ms
- Memory allocation: Minimal (string concatenation only)

**Production Performance** (After Stage E):
- Draft generation: ~2-3s (LLM call)
- Evidence gathering: ~500ms (memory search + optional external tools)
- Critique generation: ~1-2s (LLM call)
- Revision generation: ~2-3s (LLM call)
- **Single iteration**: ~6-8s
- **Full loop (3 iterations)**: ~18-24s

**Cost Model** (After Stage E):
- Draft: ~1000 tokens × $0.015/1k = $0.015
- Critique: ~800 tokens × $0.015/1k = $0.012
- Revision: ~1200 tokens × $0.015/1k = $0.018
- **Per iteration**: ~$0.045
- **Max cost (3 iterations)**: ~$0.135

### Integration Points

**Called By**:
- `ActivityRouter` when task classified as Level 3
- Level 3 triggers:
  - High-stakes + irreversible
  - Knowledge gaps (hasKnowledgeGap flag)
  - LOW knowledge_sufficiency + high stakes
  - LOW certainty_alignment + irreversible

**Uses**:
- `AgentContext` - Session state, message history, retrieved knowledge
- `Task` - User message and computed flags (isHighStakes, isIrreversible, etc.)

**Returns**:
- `ReflexionResult` - Final draft + full iteration trace for debugging

### Evidence Sources (Planned for Stage E)

**Memory Evidence** (Stage E):
- Retrieved facts from `AgentContext.retrievedFacts`
- Retrieved procedures from `AgentContext.retrievedProcedures`
- Recent conversation history from `AgentContext.messageHistory`

**External Evidence** (Phase 4+):
- Web search results (via MCP tools)
- Documentation searches (Graphiti, APIs)
- Codebase searches (grep, semantic search)

**Current**: Placeholder returns single memory evidence object (lines 193-199)

### Critique Structure (Planned for Stage E)

**Issue Taxonomy**:
- **missing**: Key information absent from draft
- **unsupported**: Claims lack evidence or citations
- **incorrect**: Statements contradict evidence

**Severity Levels**:
- **minor**: Draft acceptable, but could be improved
- **major**: Draft needs revision before use
- **critical**: Draft is incorrect or dangerous

**Pass Criteria**:
- Zero critical issues
- Zero major issues
- Minor issues OK (quality threshold)

**Current**: Placeholder returns empty issues array, always passes (lines 220-224)

### Comparison to Research

**Alignment with Shinn et al. (2023)**: 8/10

**Preserved**:
- ✅ Core loop concept (Draft → Critique → Revise)
- ✅ Iterative improvement
- ✅ Max iterations limit (3)
- ✅ Quality gate (critique.passes)
- ✅ Trace storage (iterations[])
- ✅ LLM call tracking

**Architectural Differences**:
- **Class-based** (ours) vs **Graph-based** LangGraph (research)
- **Issue[]** critique (ours) vs **Superfluous/Missing/Unsupported** taxonomy (research)
- **Memory-only** evidence (Stage E plan) vs **External tools** (research, Phase 4+)

See `docs/REFLEXION_COMPARISON.md` for detailed analysis.

### Future Enhancements

**Stage E** (LLM Integration):
- Replace all 4 placeholder methods with actual LLM calls
- Implement evidence gathering from memory
- Implement structured critique with taxonomy
- Implement evidence-based revision

**Phase 4+** (External Evidence):
- Web search integration
- MCP tool support for evidence
- Citation extraction and tracking
- Superfluous content detection
- Convergence detection (draft unchanged)

### Testing

- **Unit Tests**: 24 tests in `server/engine/__tests__/reflexion-loop.unit.test.ts`
- **Coverage**: All loop mechanics + edge cases
  - Constructor/factory (2 tests)
  - Happy path (3 tests)
  - Max iterations (2 tests)
  - Iteration tracking (3 tests)
  - LLM call tracking (2 tests)
  - Result structure (3 tests)
  - Edge cases (3 tests)
  - Placeholder behavior (3 tests)
  - Integration readiness (3 tests)
- **Code Review**: Completed, aligned with research

### Known Gaps

**Documented in** `docs/PLACEHOLDERS_AND_DEFERRALS.md`:

1. **Convergence Detection** (missing):
   - Check if `currentDraft === previousDraft` → stuck, exit
   - Effort: ~1 hour

2. **Citation Tracking** (missing):
   - Extract citations from evidence
   - Track which claims are supported
   - Effort: ~3 hours

3. **Superfluous Detection** (missing):
   - Add `"superfluous"` to Issue type
   - Detect irrelevant/redundant content
   - Effort: ~1 hour

---

## Consistency Model

### PostgreSQL
- **ACID guarantees**
- **Immediate consistency** for messages, facts, logs
- **Foreign key constraints** enforce referential integrity

### FalkorDB/Graphiti
- **Eventual consistency** (async ingestion)
- **No FK constraints** (graph relationships)
- **Graceful degradation** if Graphiti is unavailable (context assembly continues without graph data)

### Hybrid Queries
- **Context assembly** combines both:
  - PostgreSQL: Hard rules, procedures (immediate, guaranteed)
  - Graphiti: Facts, episodes, relationships (best-effort)
- **No distributed transactions** — each system independent

---

## Scaling Considerations

### Current Limits
- **PostgreSQL:** Tested with 277 tests, ~100s of facts
- **FalkorDB:** `galatea_memory` graph had 434 nodes before clear
- **Sessions:** Multiple sessions share `galatea_memory` graph

### Future Optimizations

**PostgreSQL:**
- Add full-text search indexes: `CREATE INDEX ON facts USING gin(to_tsvector('english', content))`
- Partition `messages` table by `createdAt` for large volumes
- Archive old `gatekeeper_log` entries (retention policy)

**FalkorDB:**
- Consider per-session graphs if `galatea_memory` exceeds 100K nodes
- Implement fact expiration/archival in Graphiti
- Add graph indexes on frequently queried properties

---

## Maintenance Tasks

### Regular
- **Backup PostgreSQL:** `pg_dump galatea > backup.sql`
- **Backup FalkorDB:** Export graphs via Graphiti API or `GRAPH.EXPORT`
- **Monitor `gatekeeper_log` growth:** Implement retention policy

### Phase 6 (Deferred)
- **Confidence decay:** Update `facts` with unused `lastRetrievedAt` > 90 days
- **Memory promotion:** Cluster similar episodes → facts → rules
- **Archival:** Move low-confidence facts to cold storage
- **Reprocessing:** Re-extract facts when `extractionVersion` changes

---

## Related Documentation
- **Implementation:** See `/home/newub/w/galatea/docs/PHASE2_STATUS.md`
- **Known Gaps:** See `/home/newub/w/galatea/docs/KNOWN_GAPS.md`
- **Redundancy Analysis:** See `/home/newub/w/galatea/docs/DEDUP_REDUNDANCY_ANALYSIS.md`
- **Graphiti Usage:** See `/home/newub/w/galatea/docs/GRAPHITI_USAGE.md`
