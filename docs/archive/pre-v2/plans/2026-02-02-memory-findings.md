# Memory System Findings

**Date**: 2026-02-02
**Status**: Historical — Decision reversed
**Original Decision**: Leaning Mem0 for MVP, may add Graphiti for temporal features
**Actual Decision**: File-based JSONL with LLM extraction pipeline (Phase B)
**Implementation**: `server/memory/knowledge-store.ts`, `server/memory/knowledge-extractor.ts`

> **Reconciliation note (2026-02-13):** This document captures early research (Day 1 of the project).
> The Mem0 vs Graphiti analysis is **historical only** — neither was adopted.
>
> **What actually happened:**
> - Mem0 extraction quality was poor (18-21% recall in benchmarks)
> - Graphiti had poor extraction quality too
> - We built a custom LLM extraction pipeline using Ollama (glm-4.7-flash)
> - Storage: simple JSONL file (`data/memory/entries.jsonl`), not PostgreSQL/FalkorDB
> - Schema: unified `KnowledgeEntry` type (not separate Episode/Fact/Procedure interfaces)
> - Retrieval: keyword + recency scoring, not embedding-based semantic search
>
> **What remains valuable from this doc:**
> - Memory type taxonomy (episodic, semantic, procedural) — informed `KnowledgeEntry.type` values
> - Problems identified (retrieval relevance, confidence calibration) — still open, tracked in KNOWN_GAPS.md
> - Event-to-memory pipeline concept — implemented as extraction pipeline in Phase B
> - The principle "use existing tools" held for extraction (Ollama), but storage was simpler than anticipated

---

## Context

During homeostasis architecture design, we identified memory as a critical component but NOT the thesis differentiator. Memory is infrastructure; psychological architecture is the thesis.

**Key insight**: Use existing tools (Mem0/Graphiti) rather than building custom.

---

## Memory Types Needed

### 1. Episodic Memory (Events)

**What**: Specific events and experiences
**Example**: "User spent 45min debugging NativeWind, found workaround"

```typescript
interface Episode {
  id: string;
  timestamp: Date;
  summary: string;
  outcome: string;           // success, failure, partial
  emotional_valence: number; // -1 to 1
  lessons?: string[];
  embedding: number[];       // For retrieval
}
```

**Operations needed**:
- `store(episode)` - Save new episode
- `recall(query, k)` - Semantic similarity search
- `recall_temporal(start, end)` - Time-based retrieval

### 2. Semantic Memory (Facts)

**What**: Facts and knowledge with confidence
**Example**: "Prefer Clerk over JWT for mobile auth (conf: 0.95)"

```typescript
interface Fact {
  id: string;
  content: string;
  confidence: number;        // 0-1
  source: string;            // episode_id or "manual"
  domain?: string;

  // Temporal validity
  valid_from: Date;
  valid_until?: Date;        // For expiring workarounds
  superseded_by?: string;
}
```

**Operations needed**:
- `add_fact(content, confidence, source)`
- `query(semantic_query)` - Similarity search
- `get_valid_at(timestamp)` - Point-in-time query
- `invalidate(fact_id, reason)` - Mark superseded

### 3. Procedural Memory (How-To)

**What**: Procedures with triggers and success rates
**Example**: "When NativeWind flicker → use inline styles for animated props"

```typescript
interface Procedure {
  id: string;
  name: string;

  trigger: {
    pattern: string;         // Situation that activates this
    context?: string[];
  };

  steps: {
    order: number;
    instruction: string;
    tool_call?: string;      // MCP tool
  }[];

  success_rate: number;
  times_used: number;
  learned_from: string[];    // Episode IDs
  valid_until?: string;      // Expiration
}
```

**Operations needed**:
- `match(situation)` - Find applicable procedures
- `record_outcome(procedure_id, success)` - Update success rate
- `learn_procedure(episodes)` - Extract from examples

---

## Problems Identified

### 1. Retrieval Relevance

**Problem**: When an event arrives, how do we retrieve the RIGHT memories?

**Example**:
```
Event: "Missing null check on user.email"
Query: ???

If fact stored as "Always validate nullable fields" vs "Check null on user objects",
will semantic search find it?
```

**Severity**: Medium - Mem0/Graphiti handle this, but quality varies.

**Mitigation**:
- Use multiple query strategies (event text + task context + category)
- Store facts with multiple formulations
- Test retrieval quality empirically

### 2. Memory Update Coherence

**Problem**: When learning from events, multiple memory types need linked updates.

**Example**: PR feedback about null checks should:
- Create episode (what happened)
- Reinforce existing fact (more important now)
- Create self-observation (I have this tendency)
- Link all three together

**Severity**: Medium - Graphiti handles relationships well, Mem0 less so.

**Mitigation**:
- Graphiti's temporal graph maintains relationships
- Mem0: may need custom relationship tracking
- For MVP: accept some redundancy, fix later

### 3. Confidence Calibration

**Problem**: How does LLM decide confidence scores? "0.4" vs "0.7" is arbitrary.

**Example**:
```yaml
self_observation:
  content: "I tend to miss null checks"
  confidence: 0.4  # Why 0.4? Why not 0.3 or 0.5?
```

**Severity**: Low-Medium - Affects theory updating, not core functionality.

**Mitigation**:
- Use categorical instead of numeric: `low | medium | high`
- Or use evidence counts: "2 supporting, 0 contradicting"
- For MVP: accept rough estimates

### 4. Cross-Agent Learning

**Problem**: When Agent-1 learns something, should Agent-2 and Agent-3 know?

**Example**: Agent-1 misses null checks in PR. Later Agent-3 also misses null checks.
System should detect pattern: "Null checks commonly missed."

**Severity**: Medium - Important for multi-agent deployment.

**Mitigation**:
- Shared memory pool with agent-specific episodic layers
- Pattern detection runs across all agents periodically
- Elevated patterns become shared facts

### 5. Event-to-Memory Pipeline

**Problem**: How do events flow to memory? Who decides what to remember?

**Options**:
1. **Rules-based**: "PR feedback always creates episode + reinforces facts"
2. **LLM decides**: "Given this event, what should I remember?"
3. **Hybrid**: System creates episode, LLM decides on fact updates

**Recommendation**: Hybrid. Episodes are mechanical, fact updates need judgment.

---

## Mem0 vs Graphiti Analysis

### Mem0

**What it is**: Memory layer for AI applications. $24M funding, AWS partnership.

**Strengths**:
- Ready SDK for Python/TypeScript
- OpenMemory dashboard for debugging
- Handles embeddings, storage, retrieval
- Active development, good documentation

**Weaknesses**:
- Less sophisticated relationship modeling
- No built-in temporal reasoning
- May need custom extensions for procedures

**Best for**: MVP, fast iteration, standard memory patterns

### Graphiti

**What it is**: Temporal knowledge graph. $2M funding, Zep company.

**Strengths**:
- Temporal reasoning built-in (valid_from, valid_until)
- Graph queries for relationships
- Good for "what was true at time X?"
- Better for procedure dependencies

**Weaknesses**:
- Smaller ecosystem
- More complex setup
- Less documentation

**Best for**: Complex temporal queries, relationship-heavy use cases

### Recommendation

| Phase | Choice | Rationale |
|-------|--------|-----------|
| MVP | **Mem0** | Faster setup, good enough for initial testing |
| Later | **Graphiti** | If temporal features prove essential |
| Alternative | **Both** | Mem0 for facts, Graphiti for procedures |

**Key insight**: We can start with Mem0 and migrate or add Graphiti later. The interface (store, recall, query) is similar enough.

---

## Implementation Notes

### Memory Layer Interface

```python
class MemoryLayer:
    """Abstract interface - implement with Mem0 or Graphiti"""

    def store_episode(self, episode: Episode) -> str:
        """Store an episode, return ID"""
        pass

    def recall_episodes(self, query: str, k: int = 5) -> list[Episode]:
        """Semantic similarity search for episodes"""
        pass

    def add_fact(self, fact: Fact) -> str:
        """Add a fact to semantic memory"""
        pass

    def query_facts(self, query: str, k: int = 10) -> list[Fact]:
        """Query facts by semantic similarity"""
        pass

    def match_procedures(self, situation: str) -> list[Procedure]:
        """Find procedures that match a situation"""
        pass

    def update_procedure_outcome(self, proc_id: str, success: bool):
        """Record procedure success/failure"""
        pass
```

### Mem0 Implementation Sketch

```python
from mem0 import Memory

class Mem0MemoryLayer(MemoryLayer):
    def __init__(self):
        self.memory = Memory()

    def store_episode(self, episode: Episode) -> str:
        return self.memory.add(
            episode.summary,
            metadata={
                "type": "episode",
                "timestamp": episode.timestamp.isoformat(),
                "outcome": episode.outcome,
                "lessons": episode.lessons
            }
        )

    def recall_episodes(self, query: str, k: int = 5) -> list[Episode]:
        results = self.memory.search(
            query,
            filter={"type": "episode"},
            limit=k
        )
        return [self._to_episode(r) for r in results]

    # ... similar for facts and procedures
```

### Graphiti Implementation Sketch

```python
from graphiti import Graphiti

class GraphitiMemoryLayer(MemoryLayer):
    def __init__(self):
        self.graph = Graphiti()

    def add_fact(self, fact: Fact) -> str:
        # Graphiti creates nodes and edges with temporal metadata
        return self.graph.add_node(
            content=fact.content,
            valid_from=fact.valid_from,
            valid_until=fact.valid_until,
            metadata={"confidence": fact.confidence}
        )

    def query_facts_at_time(self, query: str, timestamp: Date) -> list[Fact]:
        # Graphiti's temporal query capability
        return self.graph.search(
            query,
            as_of=timestamp  # Point-in-time query
        )
```

---

## Open Questions

1. **Episode granularity**: What's an "episode"? A task? A session? A single action?
2. **Fact deduplication**: How to handle near-duplicate facts?
3. **Procedure extraction**: Can LLM reliably extract procedures from episodes?
4. **Memory pruning**: When/how to archive old memories?

---

## Next Steps — Status

1. ~~Set up Mem0 for MVP~~ — Not done. Built custom JSONL store instead (Phase B).
2. ~~Implement MemoryLayer interface~~ — Not done. `KnowledgeStore` API is simpler: `loadEntries()`, `appendEntries()`, `entriesByEntity()`, `entriesBySubjectType()`.
3. ~~Test retrieval quality with reference scenarios~~ — Partially done. End-to-end trace (Phase C) revealed `retrievedFacts` always empty. Entity-based retrieval is Phase D Task 5.
4. ~~Evaluate need for Graphiti temporal features~~ — Not needed for current scope. Temporal validity (`supersededBy`, confidence decay) planned for Phase E.
5. Cross-agent memory sharing — Phase F+ (multi-agent deployment).

---

*Document created: 2026-02-02*
*Status: Historical research — see v2 architecture design for current approach*
