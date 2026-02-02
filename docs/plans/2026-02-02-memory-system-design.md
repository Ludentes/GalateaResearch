# Memory System Design: Graphiti vs Mem0 vs Self-Build

**Date**: 2026-02-02
**Status**: Draft - Awaiting Decision
**Context**: Brainstorm session evaluating memory layer options for Galatea

---

## Executive Summary

This document evaluates three options for Galatea's memory system based on concrete use cases derived from the target scenario: shadow learning from vibe coding, exporting personas, and multi-agent collaboration in a company setting.

**Key Finding**: Neither Mem0 nor Graphiti fully implements the 6-layer memory architecture in `memory-systems.md`, but both can serve as foundations. The choice depends on whether **temporal reasoning** (Graphiti) or **ecosystem/UX** (Mem0) is prioritized.

**Recommendation**: Graphiti with FalkorDB backend, with custom procedural memory layer.

---

## Target Scenario

### The Full Lifecycle

```
Phase 1: Shadow Learning
├── User vibe codes with Expo + Claude Code
├── Galatea observes: decisions, errors, solutions, preferences
├── Forms: episodic, semantic, procedural memories
└── Duration: Days/weeks

Phase 2: Export Persona
├── Package: semantic + procedural memories
├── Exclude/anonymize: raw episodic (privacy)
└── Output: Portable persona file

Phase 3: Company Deployment
├── PM imports persona to company instance
├── Instantiates 3 AI programmers
├── Each agent: shared knowledge base + own episodic memory
└── MCP access: GitLab, Discord, Filesystem

Phase 4: Multi-Agent Work
├── Agents pick tasks, execute, communicate
├── Learn from each other's feedback
├── Build shared knowledge over time
└── PM can inspect and correct knowledge
```

---

## Concrete Use Cases

### Use Case 1: Shadow Learning - Tech Decision

**Scenario**: User tries JWT, abandons it for Clerk

**What happens**:
```
10:00 - User starts custom JWT implementation
10:45 - Token refresh errors, user frustrated
11:00 - User asks Claude about alternatives
11:15 - Switches to Clerk, completes in 30 min
```

**Memory operations**:
| Type | Content | Temporal Aspect |
|------|---------|-----------------|
| Episodic | "Feb 2 10:00-11:45: Tried JWT, hit refresh issues, switched to Clerk" | When it happened |
| Semantic | "Prefer Clerk over custom JWT for Expo auth" | Valid from Feb 2 |
| Semantic | "Custom JWT has token refresh issues" | Learned Feb 2 |
| Procedural | "When adding auth to Expo: consider Clerk first" | Learned from experience |

**Retrieval scenario**:
```
Agent starts new Expo project, needs auth.
Query: "How should I handle auth in Expo?"

Expected retrieval:
1. Semantic: "Prefer Clerk over custom JWT" (high relevance)
2. Procedural: "When adding auth: consider Clerk first"
3. Episodic: (optional) "User had bad experience with JWT on Feb 2"
```

---

### Use Case 2: Manual Knowledge Entry - "Never Use Realm"

**Scenario**: User wants to add explicit rule about Realm database

**Input**:
- Fact: "Realm is a mobile database option"
- Rule: "Never use Realm in our projects"
- Reason: "Sync issues, painful migrations"

**Memory operations**:
| Type | Content | Metadata |
|------|---------|----------|
| Semantic | "Realm is a mobile database for React Native" | domain: mobile |
| Semantic | "Never use Realm - sync issues, painful migrations" | type: hard-rule, severity: block |
| Semantic | "Use SQLite+Drizzle or WatermelonDB instead of Realm" | type: alternative |

**Retrieval scenario**:
```
Agent researching mobile database options.
Query: "What database should I use for offline storage?"

Expected retrieval:
1. "Use SQLite+Drizzle or WatermelonDB" (recommendation)
2. "Never use Realm" (hard-block rule)
3. Reason available if agent asks "why not Realm?"
```

**View/Edit requirement**:
- User wants to see stored Realm knowledge
- Verify the rule was captured correctly
- Potentially update if Realm improves

---

### Use Case 3: Article Ingestion - "Liquid Glass"

**Scenario**: User reads article about Apple's new design language

**Input**:
- Article URL or pasted content
- Key concepts: Liquid Glass, .glassEffect(), iOS 26
- User's annotation: "Use sparingly - performance impact"

**Memory operations**:
| Type | Content | Source |
|------|---------|--------|
| Semantic | "Liquid Glass is Apple's design language for iOS 26" | Article |
| Semantic | "Use .glassEffect() modifier in SwiftUI for Liquid Glass" | Article |
| Semantic | "Liquid Glass impacts performance on older devices" | User annotation |
| Procedural | "When using Liquid Glass: apply to hero sections only" | User annotation |

**Retrieval scenario**:
```
Agent designing iOS UI.
Query: "How do I make this look modern for iOS 26?"

Expected retrieval:
1. "Liquid Glass is Apple's new design language"
2. "Use .glassEffect() modifier"
3. "Use sparingly - performance impact on older devices"
```

**Temporal aspect**:
- "When did we learn about Liquid Glass?" → Feb 2, 2026
- "Is this still current?" → Yes, introduced iOS 26

---

### Use Case 4: Procedural Workaround - "NativeWind Flicker"

**Scenario**: User discovered NativeWind bug and workaround

**Input**:
- Problem: "className on Pressable causes animation flicker"
- Trigger: Using className for animated properties
- Solution: Use inline style for animated props
- Code example provided
- Status: Workaround until NativeWind 4.1

**Memory operations**:
| Type | Content | Metadata |
|------|---------|----------|
| Procedural | "When Pressable animation flickers: move animated props to style, keep static in className" | trigger: animation-flicker, technology: nativewind |
| Semantic | "NativeWind className causes flicker with Pressable animations" | type: known-issue |
| Semantic | "NativeWind 4.1 will fix Pressable animation issue" | type: future-fix |

**Retrieval scenario**:
```
Agent implementing animated button with NativeWind.
Encounters flicker during testing.
Query: "Why is my Pressable animation flickering?"

Expected retrieval:
1. "Known issue: NativeWind className causes flicker"
2. "Workaround: move animated props to inline style"
3. Code example
```

**Temporal aspect (critical)**:
```
Later: NativeWind 4.1 releases

Memory update needed:
- Mark workaround as "superseded"
- Add: "Fixed in NativeWind 4.1"
- History preserved: "Was a workaround from Feb-Mar 2026"
```

---

### Use Case 5: Cross-Agent Learning

**Scenario**: Agent-Dev-3 reviews Agent-Dev-1's code, finds pattern

**What happens**:
```
PR Review #1: Dev-1 forgot null check on user object
PR Review #2: Dev-1 forgot null check on profile object
PR Review #3: Dev-1 remembered null checks (improvement!)
```

**Memory operations**:
| Type | Content | Agent |
|------|---------|-------|
| Semantic | "Agent-Dev-1 sometimes forgets null checks" | Shared |
| Episodic | "PR #456: Found missing null check" | Dev-3 |
| Episodic | "PR #789: Found missing null check again" | Dev-3 |
| Episodic | "PR #890: Null checks present, improvement noted" | Dev-3 |
| Procedural (Dev-1) | "Remember to add null checks before PR" | Dev-1 |

**Retrieval scenario**:
```
Dev-3 starts reviewing Dev-1's PR.
Query: "What should I watch for in Dev-1's code?"

Expected retrieval:
1. "Dev-1 sometimes forgets null checks"
2. "But improved recently - PR #890 was clean"
```

**Temporal aspect (critical)**:
- Pattern emerged over time (PR #456, #789)
- Pattern improving (PR #890)
- Need to track trajectory, not just current state

---

### Use Case 6: Retrieval During Task Execution

**Scenario**: Agent-Dev-1 picks up task "Add user profile screen"

**Retrieval pipeline**:
```
1. Task Context
   Query: "user profile screen expo"
   Retrieves:
   - Procedural: "For new Expo screen: create in app/(tabs)"
   - Semantic: "Use expo-router for navigation"

2. Technology Context
   Query: "expo ui styling"
   Retrieves:
   - Semantic: "Use NativeWind for styling"
   - Procedural: "NativeWind animation workaround"
   - Semantic: "Liquid Glass for premium feel"

3. Company Context
   Query: "code standards PR"
   Retrieves:
   - Procedural: "PR checklist: types, tests, null checks"
   - Semantic: "Use GitLab MR, post in #mobile-dev"

4. Negative Constraints
   Query: implicit check
   Retrieves:
   - "Never use Realm"
   - Any other hard-block rules
```

**Memory assembly for LLM context**:
```
## Relevant Knowledge

### How to create Expo screens
- Create file in app/(tabs)/profile.tsx
- Use expo-router for navigation
- Use NativeWind for styling

### Known Issues
- NativeWind Pressable animation: use inline style for animated props

### Design Guidelines
- Consider Liquid Glass for premium feel (sparingly)

### Code Standards
- PR checklist: types, tests, null checks
- Post in #mobile-dev when ready

### Constraints
- Do NOT use Realm for database
```

---

## Extraction Pipeline Comparison

### Mem0 Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  QUERY                                                          │
│  "How should I handle auth in Expo?"                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  MEM0 SEARCH                                                    │
│                                                                 │
│  1. Generate embedding for query                                │
│  2. Vector similarity search in Qdrant                          │
│  3. (Optional) BM25 keyword search                              │
│  4. (Optional) Graph traversal if Mem0g enabled                 │
│  5. Rerank results                                              │
│                                                                 │
│  Returns: List[Memory] with scores                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULTS                                                        │
│                                                                 │
│  [0.92] "Prefer Clerk over custom JWT for Expo auth"            │
│  [0.87] "When adding auth: consider Clerk first"                │
│  [0.76] "Custom JWT has token refresh issues"                   │
│                                                                 │
│  Flat list, ranked by relevance                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Code**:
```python
from mem0 import Memory

m = Memory()

# Simple search
results = m.search(
    query="How should I handle auth in Expo?",
    user_id="mobile-dev-knowledge",
    limit=10
)

# With filters
results = m.search(
    query="auth expo",
    user_id="mobile-dev-knowledge",
    filters={"technology": "expo", "type": ["fact", "procedure"]}
)

# Results structure
for r in results:
    print(f"[{r['score']:.2f}] {r['memory']}")
    print(f"  Metadata: {r['metadata']}")
```

**Pros**:
- Simple API
- Fast retrieval
- Good relevance ranking

**Cons**:
- No structured relationships
- Can't query "what changed since X"
- Can't traverse "related to Y"

---

### Graphiti Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  QUERY                                                          │
│  "How should I handle auth in Expo?"                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  GRAPHITI HYBRID SEARCH                                         │
│                                                                 │
│  1. Semantic search on node summaries                           │
│  2. BM25 keyword search                                         │
│  3. Graph traversal from matched nodes                          │
│  4. Temporal filtering (valid_at = now)                         │
│  5. Combine and rank                                            │
│                                                                 │
│  Returns: Nodes + Edges + Facts                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULTS (Graph Structure)                                      │
│                                                                 │
│  Entities:                                                      │
│    - Clerk (auth_provider)                                      │
│    - JWT (auth_method)                                          │
│    - Expo (framework)                                           │
│                                                                 │
│  Facts (Edges):                                                 │
│    - Clerk --[preferred_for]--> Expo auth                       │
│    - JWT --[has_issue]--> token refresh                         │
│    - Clerk --[recommended_over]--> JWT                          │
│                                                                 │
│  Temporal:                                                      │
│    - JWT preference: invalid_from Feb 2                         │
│    - Clerk preference: valid_from Feb 2                         │
└─────────────────────────────────────────────────────────────────┘
```

**Code**:
```python
from graphiti_core import Graphiti

g = Graphiti(...)

# Search for relevant facts
facts = await g.search(
    query="How should I handle auth in Expo?",
    num_results=10
)

# Search with temporal filter
facts = await g.search(
    query="auth expo",
    num_results=10,
    # Only facts valid now (not invalidated)
)

# Get specific entity and relationships
entity = await g.get_entity("Clerk")
relationships = await g.get_entity_edges("Clerk")

# Temporal query: "What did we think about auth before Feb 2?"
historical = await g.search(
    query="auth expo",
    reference_time=datetime(2026, 2, 1)  # Before the JWT->Clerk switch
)
```

**Pros**:
- Structured relationships
- Temporal queries native
- Can traverse graph for related knowledge
- History preserved

**Cons**:
- More complex API
- Requires understanding graph model
- Results need more processing

---

### Extraction for Task Execution

**Mem0 approach**:
```python
async def get_context_for_task(task: str, technology: str) -> str:
    # Multiple searches, combine results
    tech_facts = m.search(f"{technology} best practices", limit=5)
    task_procedures = m.search(f"how to {task}", limit=5)
    constraints = m.search(f"{technology} avoid never don't", limit=3)

    # Manual assembly
    context = "## Relevant Knowledge\n\n"
    context += "### Best Practices\n"
    for f in tech_facts:
        context += f"- {f['memory']}\n"
    # ... etc

    return context
```

**Graphiti approach**:
```python
async def get_context_for_task(task: str, technology: str) -> str:
    # Single search with graph expansion
    results = await g.search(f"{task} {technology}", num_results=10)

    # Get related entities automatically via graph
    entities = set()
    for fact in results:
        entities.add(fact.source_entity)
        entities.add(fact.target_entity)

    # Get constraints (edges with negative sentiment)
    constraints = [f for f in results if f.relationship in ["avoid", "never_use", "has_issue"]]

    # Temporal: only current knowledge
    current = [f for f in results if f.valid_at is None or f.valid_at <= now]

    # Assembly with structure preserved
    context = format_knowledge_graph(current, constraints)
    return context
```

---

## Requirements Summary

### Functional Requirements

| ID | Requirement | Priority | Mem0 | Graphiti | Self-Build |
|----|-------------|----------|------|----------|------------|
| F1 | Store episodic memories (what happened, when) | High | ⚠️ Timestamps only | ✅ Native | ✅ Full control |
| F2 | Store semantic memories (facts, concepts) | High | ✅ Native | ✅ Native | ✅ Full control |
| F3 | Store procedural memories (trigger → action) | High | ⚠️ As text | ⚠️ Custom entity | ✅ Full control |
| F4 | Query by semantic similarity | High | ✅ Native | ✅ Native | ⚠️ Use Qdrant |
| F5 | Query by relationships (what's related to X) | Medium | ⚠️ Mem0g | ✅ Native | ⚠️ Use graph DB |
| F6 | Temporal queries (what was true when) | Medium | ❌ Manual | ✅ Native | ⚠️ Build yourself |
| F7 | Invalidate outdated knowledge | Medium | ⚠️ DELETE/UPDATE | ✅ Native | ⚠️ Build yourself |
| F8 | Track knowledge provenance (where learned) | Medium | ⚠️ Metadata | ✅ Episode links | ✅ Full control |
| F9 | Export/import persona | High | ⚠️ API dump | ⚠️ API dump | ✅ Full control |
| F10 | Cross-agent knowledge sharing | High | ✅ Shared user_id | ✅ Shared graph | ✅ Full control |

### Non-Functional Requirements

| ID | Requirement | Priority | Mem0 | Graphiti | Self-Build |
|----|-------------|----------|------|----------|------------|
| N1 | View/edit UI for knowledge management | High | ✅ OpenMemory | ❌ Need Neo4j/custom | ❌ Build yourself |
| N2 | TypeScript native | Medium | ⚠️ REST API | ⚠️ REST API | ✅ Native |
| N3 | Local-first (no cloud dependency) | High | ✅ Self-hosted | ✅ Self-hosted | ✅ Self-hosted |
| N4 | No JVM | Low | ✅ Python | ✅ FalkorDB option | ✅ Your choice |
| N5 | Low latency retrieval (<500ms) | High | ✅ ~100ms | ✅ ~300ms p95 | Depends |
| N6 | Ecosystem/community support | Medium | ✅ Large ($24M) | ⚠️ Smaller ($2M) | ❌ None |
| N7 | Future-proof (won't be abandoned) | Medium | ✅ AWS partnership | ⚠️ YC backed | ✅ You own it |

---

## Architecture Options

### Option A: Mem0 (Simpler, Larger Ecosystem)

```
┌─────────────────────────────────────────────────────────────────┐
│  GALATEA                                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Memory Abstraction Layer                                │   │
│  │  (Wraps Mem0, adds procedural memory logic)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Mem0 (with Mem0g graph mode)                           │   │
│  │  ├── Vector store: Qdrant                               │   │
│  │  ├── Graph store: Neo4j (optional)                      │   │
│  │  └── LLM: Claude for extraction                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  OpenMemory Dashboard                                    │   │
│  │  View, edit, delete memories                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Pros:
+ Simpler mental model (facts with metadata)
+ Better dashboard/UX out of the box
+ Larger ecosystem, AWS backing
+ Faster to implement

Cons:
- No native temporal reasoning
- Procedural memory is awkward
- Less structured relationships
- May need to add temporal layer later
```

### Option B: Graphiti + FalkorDB (More Powerful, Smaller Ecosystem)

```
┌─────────────────────────────────────────────────────────────────┐
│  GALATEA                                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Memory Abstraction Layer                                │   │
│  │  (Adds procedural memory, UI layer)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Graphiti                                                │   │
│  │  ├── Graph store: FalkorDB (Redis-based, no JVM)        │   │
│  │  ├── Embeddings: Voyage AI                              │   │
│  │  ├── LLM: Claude for extraction                         │   │
│  │  └── Temporal model: bi-temporal                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Custom Dashboard (or FalkorDB Insight)                 │   │
│  │  Graph visualization, CRUD operations                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Pros:
+ Native temporal reasoning
+ Structured relationships
+ Better for multi-agent patterns
+ FalkorDB: 500x faster than Neo4j, no JVM

Cons:
- Smaller ecosystem
- Need to build/adopt dashboard
- More complex mental model
- Custom procedural layer still needed
```

### Option C: Hybrid (Mem0 + Graphiti)

```
┌─────────────────────────────────────────────────────────────────┐
│  GALATEA                                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Memory Router                                           │   │
│  │  Routes queries to appropriate store                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                    │                    │                       │
│                    ▼                    ▼                       │
│  ┌────────────────────────┐  ┌────────────────────────────┐   │
│  │  Mem0                  │  │  Graphiti                  │   │
│  │  Simple facts, rules   │  │  Temporal, relationships   │   │
│  │  "Never use Realm"     │  │  "JWT→Clerk on Feb 2"      │   │
│  └────────────────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Pros:
+ Best of both worlds
+ Use simple tool for simple things

Cons:
- Two systems to maintain
- Complex routing logic
- Potential inconsistencies
```

### Option D: Self-Build on Qdrant + FalkorDB

```
┌─────────────────────────────────────────────────────────────────┐
│  GALATEA                                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Custom Memory Layer (TypeScript)                        │   │
│  │  ├── EpisodicMemory: Qdrant + timestamps                │   │
│  │  ├── SemanticMemory: FalkorDB graph                     │   │
│  │  ├── ProceduralMemory: Custom schema                    │   │
│  │  └── WorkingMemory: In-memory with decay                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                    │                    │                       │
│                    ▼                    ▼                       │
│  ┌────────────────────────┐  ┌────────────────────────────┐   │
│  │  Qdrant               │  │  FalkorDB                   │   │
│  │  Vector similarity    │  │  Graph + Cypher             │   │
│  └────────────────────────┘  └────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Custom Dashboard (React)                                │   │
│  │  Full control over UX                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Pros:
+ Full control
+ Exact fit to memory-systems.md
+ TypeScript native
+ No vendor lock-in

Cons:
- Most development effort
- No community support
- Must build everything
```

---

## Recommendation

### Primary: Option B (Graphiti + FalkorDB)

**Rationale**:

1. **Temporal reasoning is critical** for the multi-agent scenario
   - "When did we learn this?"
   - "What changed?"
   - "Is this still valid?"

2. **FalkorDB solves the JVM concern**
   - Redis-based, written in C
   - 500x faster p99 than Neo4j
   - Same Cypher query language

3. **Custom procedural layer is needed regardless**
   - Neither Mem0 nor Graphiti has native procedural memory
   - Building on Graphiti's entity system is cleaner

4. **Dashboard can be solved**
   - FalkorDB has Insight UI
   - Cypher queries are acceptable
   - Can build custom UI incrementally

5. **Ecosystem risk is manageable**
   - Graphiti is open source, can fork
   - FalkorDB is established (Redis ecosystem)
   - Zep is YC-backed, growing

### Fallback: Option A (Mem0) if:
- Temporal reasoning proves less critical than expected
- Dashboard UX becomes blocking issue
- Mem0 adds temporal features

### Migration Path

```
Week 1-2: Implement Graphiti + FalkorDB
Week 3: Add custom procedural memory layer
Week 4: Build basic management UI (or adopt FalkorDB Insight)
Ongoing: Monitor if temporal reasoning is actually used
If not: Consider simplifying to Mem0
```

---

## Implementation Sketch

### Memory Abstraction Interface

```typescript
// src/lib/memory/types.ts

interface Memory {
  id: string;
  type: "episodic" | "semantic" | "procedural";
  content: string;
  metadata: MemoryMetadata;
  temporal: TemporalInfo;
}

interface TemporalInfo {
  createdAt: Date;
  validFrom?: Date;
  validUntil?: Date;  // null = still valid
  supersededBy?: string;  // ID of newer memory
}

interface MemoryMetadata {
  source: "observation" | "manual" | "article" | "feedback";
  confidence: number;
  tags: string[];
  domain?: string;
  technology?: string;
}

interface ProceduralMemory extends Memory {
  type: "procedural";
  trigger: string;
  steps: string[];
  successRate: number;
  lastUsed?: Date;
}

interface MemoryStore {
  // Write
  addMemory(memory: Omit<Memory, "id">): Promise<string>;
  addEpisode(content: string, metadata: EpisodeMetadata): Promise<void>;

  // Read
  search(query: string, options?: SearchOptions): Promise<Memory[]>;
  searchProcedures(trigger: string): Promise<ProceduralMemory[]>;
  getMemory(id: string): Promise<Memory | null>;

  // Temporal
  getHistoryOf(entityOrTopic: string): Promise<Memory[]>;
  getValidAt(query: string, timestamp: Date): Promise<Memory[]>;

  // Update
  updateMemory(id: string, updates: Partial<Memory>): Promise<void>;
  invalidateMemory(id: string, reason: string): Promise<void>;

  // Delete
  deleteMemory(id: string): Promise<void>;
}
```

### Graphiti Implementation

```typescript
// src/lib/memory/graphiti-store.ts

import { Graphiti } from "graphiti-core";  // via REST API wrapper

export class GraphitiMemoryStore implements MemoryStore {
  private client: Graphiti;

  constructor(config: GraphitiConfig) {
    this.client = new Graphiti({
      graphDriver: "falkordb",
      falkordbUrl: config.falkordbUrl,
      embeddingModel: "voyage-ai",
      llmModel: "claude-sonnet"
    });
  }

  async addMemory(memory: Omit<Memory, "id">): Promise<string> {
    // Convert to Graphiti episode
    const result = await this.client.addEpisode({
      name: memory.metadata.source,
      episodeBody: this.formatMemoryAsEpisode(memory),
      sourceDescription: memory.metadata.source,
      referenceTime: memory.temporal.createdAt
    });
    return result.episodeId;
  }

  async search(query: string, options?: SearchOptions): Promise<Memory[]> {
    const facts = await this.client.search({
      query,
      numResults: options?.limit ?? 10,
      // Temporal filter: only valid facts
    });

    return facts.map(this.factToMemory);
  }

  async getHistoryOf(topic: string): Promise<Memory[]> {
    // Graphiti native: get all versions of facts about topic
    const facts = await this.client.getEntityHistory(topic);
    return facts.map(this.factToMemory);
  }

  async invalidateMemory(id: string, reason: string): Promise<void> {
    // Graphiti native: mark edge as invalid, preserve history
    await this.client.invalidateEdge(id, {
      reason,
      invalidatedAt: new Date()
    });
  }
}
```

---

## Open Questions

1. **Procedural memory schema**: How exactly to model trigger/steps/success in Graphiti?
2. **Dashboard priority**: Build custom vs adopt FalkorDB Insight?
3. **Multi-agent memory isolation**: Shared graph with user_id filtering, or separate graphs?
4. **Export format**: What's in a portable persona file?

---

## Next Steps

1. **Decision**: Confirm Option B (Graphiti + FalkorDB)
2. **Spike**: Set up FalkorDB locally, test Graphiti basic operations
3. **Design**: Procedural memory schema as custom Graphiti entities
4. **Implement**: Memory abstraction layer
5. **Iterate**: Build dashboard as needed

---

*Document created: 2026-02-02*
*Status: Awaiting decision*

Sources:
- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [Graphiti CRUD Operations](https://help.getzep.com/graphiti/working-with-data/crud-operations)
- [Mem0 Documentation](https://docs.mem0.ai/)
- [OpenMemory MCP](https://mem0.ai/blog/introducing-openmemory-mcp)
- [FalkorDB vs Neo4j](https://www.falkordb.com/blog/falkordb-vs-neo4j-for-ai-applications/)
- [Mem0 $24M Funding](https://mem0.ai/series-a)
- [Zep Tracxn](https://tracxn.com/d/companies/zep/__poSadJnSfLWHjz05Xi3U5KwnpCMWSU3aDrihLX_8FLs)
