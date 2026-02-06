# Unified Memory Extraction Design

**Date:** 2026-02-06
**Status:** Approved for Implementation
**Context:** Response to poor Mem0/Graphiti fact extraction quality (18-21% recall)

## Problem Statement

Benchmark testing revealed that both Mem0 and Graphiti produce poor fact extraction quality:
- Mem0 (GPT-OSS): 5.0% fact F1 score
- Mem0 (Nemotron): 18.4% fact F1 score
- Graphiti (best model): 21% fact recall

However, deeper analysis showed that the extracted facts are **semantically correct** but fail scoring due to format mismatch:
- Expected: `"user prefers dark mode"` (structured triple)
- Actual: `"I prefer dark mode"` (natural language)

Both formats convey identical information for prompt enrichment, making the low scores misleading. The real issue is over-engineering with graph databases and complex extraction pipelines.

## Solution: Unified Heuristic Gatekeeper + Extraction

Replace Mem0/Graphiti with a unified approach that combines gatekeeping and extraction:

### Core Principles

1. **Pattern-based extraction** for common cases (70% fast path)
   - Regex templates with confidence scores
   - <1ms latency, zero cost
   - Examples: preferences, policies, technology switches

2. **Ollama LLM fallback** for ambiguous cases (30%)
   - Local llama3.2:latest model
   - 200-500ms latency, zero cost
   - Handles complex or nuanced statements

3. **Simple PostgreSQL storage** (no graph complexity)
   - Facts table with vector embeddings (nomic-embed-text)
   - BM25 full-text search
   - Cross-agent visibility control

4. **Two memory pathways, one extraction logic**
   - Conversational: Chat messages → Gatekeeper + Extraction
   - Observational: Activity tracking → Memory Formation (Layer 4)
   - Both use same shared pattern library and extraction functions

## Architecture

### Pattern Library

Categories with example patterns:

**Preferences:**
```typescript
{
  pattern: /\bI prefer (\w+(?:\s+\w+)*?)(?:\s+(?:over|to|instead of)\s+(\w+(?:\s+\w+)*?))?/i,
  template: (match) => {
    const [_, preferred, alternative] = match
    if (alternative) return `User prefers ${preferred} over ${alternative}`
    return `User prefers ${preferred}`
  },
  category: 'preference',
  confidence: 0.9
}
```

**Policies:**
```typescript
{
  pattern: /\b[Ww]e (?:always|never|should|must) (?:use )?([\w\s]+?) (?:for|when|because)/i,
  template: (match) => `Team policy: always ${match[1]}`,
  category: 'policy',
  confidence: 0.85
}
```

**Technology Switches:**
```typescript
{
  pattern: /\b[Ss]witched from ([\w\s]+?) to ([\w\s]+?)(?:\s+(?:because|since|as|for))/i,
  template: (match) => `Team switched from ${match[1]} to ${match[2]}`,
  category: 'technology',
  confidence: 0.9
}
```

**Decisions:**
```typescript
{
  pattern: /\b[Ww]e (?:decided|chose) to ([\w\s]+?)(?: because| since| as)? ([\w\s]+)/i,
  template: (match) => `Team decided to ${match[1]} because ${match[2]}`,
  category: 'decision',
  confidence: 0.85
}
```

**Temporal Events:**
```typescript
{
  pattern: /\b[Ss]tarted using ([\w\s]+?)(?: (?:last|this) (\w+)|(\d+) (\w+) ago)/i,
  template: (match) => `Started using ${match[1]} ${match[2] || match[3] + ' ' + match[4] + ' ago'}`,
  category: 'temporal',
  confidence: 0.8
}
```

### Extraction Flow

#### Conversational Pathway (Chat Messages)

```
User Message + Assistant Response
         ↓
evaluateGatekeeperWithExtraction()
         ↓
   Fast Skip? (greetings, confirmations)
    NO ↓         YES → Skip
         ↓
Pattern Match? (try all patterns)
    YES ↓         NO → Mark for LLM
         ↓              ↓
   Extract Facts    extractWithLLM()
         ↓              ↓
         └──────┬───────┘
                ↓
           storeFact()
                ↓
      PostgreSQL facts table
```

#### Observational Pathway (Activity Tracking)

```
Activity Session → Enrichment → Dialogue
                                   ↓
                    formMemoriesFromDialogue()
                                   ↓
                    extractFactsWithPatterns() (shared)
                                   ↓
                    Pattern Match? (try all patterns)
                     YES ↓         NO → Mark for LLM
                         ↓              ↓
                    Extract Facts    extractWithLLM() (shared)
                         ↓              ↓
                         └──────┬───────┘
                                ↓
                           storeFact() (shared)
                                ↓
                      PostgreSQL facts table
```

### Storage Schema

```sql
CREATE TABLE facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  category TEXT NOT NULL, -- 'preference' | 'policy' | 'technology' | 'decision' | 'temporal' | 'other'
  confidence REAL NOT NULL, -- 0.0 - 1.0
  extraction_method TEXT NOT NULL, -- 'pattern' | 'llm'
  entities TEXT[], -- Extracted entities for filtering

  -- Source tracking
  source_session UUID REFERENCES sessions(id),
  source_user_message TEXT,
  source_assistant_message TEXT,
  source_activity_session UUID, -- For observational pathway
  created_at TIMESTAMP DEFAULT now(),

  -- Multi-agent support
  agent_id UUID,
  visibility TEXT DEFAULT 'private', -- 'private' | 'team' | 'global'

  -- Search indexes
  embedding vector(768), -- nomic-embed-text embeddings
  tsvector tsvector -- For BM25 full-text search
);

CREATE INDEX facts_embedding_idx ON facts USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX facts_tsvector_idx ON facts USING gin(tsvector);
CREATE INDEX facts_category_idx ON facts (category);
CREATE INDEX facts_visibility_idx ON facts (visibility, agent_id);
CREATE INDEX facts_created_idx ON facts (created_at DESC);
```

### Cross-Agent Memory Sharing

The `visibility` field enables pattern detection across agents:

- **private**: Only visible to source session (default for personal preferences)
- **team**: Visible to all agents in team (policies, decisions)
- **global**: Visible across all sessions (general patterns)

Example query for detecting PR review patterns:
```typescript
const prReviewFacts = await db.query(`
  SELECT content, agent_id, COUNT(*) as occurrences
  FROM facts
  WHERE visibility = 'team'
    AND category = 'decision'
    AND content LIKE '%null check%'
  GROUP BY agent_id, content
  ORDER BY occurrences DESC
`)
```

## Validation Against Reference Scenarios

### Scenario 1: JWT → Clerk Migration

**Input:** "We switched from JWT to Clerk for authentication because of compliance requirements"

**Pattern Match:** Technology switch pattern
```typescript
{
  pattern: /\b[Ss]witched from ([\w\s]+?) to ([\w\s]+?)(?:\s+(?:because|since|as|for))/i,
  // Matches: ["switched from JWT to Clerk for", "JWT", "Clerk"]
}
```

**Extracted Fact:**
```json
{
  "content": "Team switched from JWT to Clerk",
  "category": "technology",
  "confidence": 0.9,
  "extraction_method": "pattern",
  "entities": ["JWT", "Clerk"],
  "visibility": "team"
}
```

**Memory Formation:** Stored in facts table, retrievable via hybrid search for future authentication questions.

### Scenario 2: NativeWind Workaround

**Input:** "I found a workaround for NativeWind v4 by using className prop directly"

**Pattern Match:** Decision pattern
```typescript
{
  pattern: /\b[Ff]ound (?:a )?(?:workaround|solution) for ([\w\s]+?) by ([\w\s]+)/i,
}
```

**Extracted Fact:**
```json
{
  "content": "Found workaround for NativeWind v4 by using className prop directly",
  "category": "decision",
  "confidence": 0.85,
  "extraction_method": "pattern",
  "entities": ["NativeWind v4", "className"],
  "visibility": "team"
}
```

### Scenario 3: PR Feedback Null Checks

**Input:** Multiple PR reviews by Agent-1 requesting null checks

**Pattern Match:** Policy pattern in PR comments
```typescript
{
  pattern: /\bshould (?:add|include) ([\w\s]+?) (?:check|validation)/i,
}
```

**Pattern Detection:** Query team-visible facts by Agent-1 shows repeated null check suggestions → surface in PR checklist.

## Integration with Observation Pipeline

The unified approach integrates seamlessly with `OBSERVATION_PIPELINE.md` Layer 4 (Memory Formation):

**Current (LLM-only):**
```typescript
export const formMemoriesFromDialogue = internalAction({
  handler: async (ctx, args) => {
    const extraction = await generateText({
      model: claude("claude-sonnet-4"), // Expensive
      system: MEMORY_EXTRACTION_PROMPT,
      prompt: `Extract memories from this exchange...`
    })
  }
})
```

**Updated (Unified Extraction):**
```typescript
export const formMemoriesFromDialogue = internalAction({
  handler: async (ctx, args) => {
    // Try pattern-based extraction first (fast path)
    const patternFacts = extractFactsWithPatterns(args.dialogue.response)

    if (patternFacts.length > 0) {
      // Fast path: pattern matched (70% of cases)
      for (const fact of patternFacts) {
        await ctx.runMutation(api.facts.store, { fact })
      }
      return
    }

    // Fallback: LLM extraction (30% of cases)
    const llmFacts = await extractFactsWithLLM(
      args.activitySession.validatedIntent,
      args.dialogue.response
    )
    for (const fact of llmFacts) {
      await ctx.runMutation(api.facts.store, { fact })
    }
  }
})
```

**Benefits:**
- 70% reduction in LLM calls for memory formation
- Same extraction logic for both conversational and observational pathways
- Consistent fact format across all memory sources

## Performance Characteristics

### Pattern-Based Extraction (70% of cases)
- Latency: <1ms
- Cost: $0
- Accuracy: 90% confidence on matched patterns

### LLM Fallback (30% of cases)
- Latency: 200-500ms (Ollama llama3.2)
- Cost: $0 (local model)
- Accuracy: 75-85% confidence on ambiguous cases

### Storage & Retrieval
- Write: ~5ms (PostgreSQL + embedding generation)
- Search: ~10-20ms (hybrid vector + BM25)
- Scale: Millions of facts without performance degradation

### Comparison to Mem0/Graphiti
- 10x faster extraction (patterns vs LLM)
- 100% cost reduction (local vs API)
- Simpler storage (PostgreSQL vs Neo4j/FalkorDB)
- Better multi-agent support (visibility field)

## Implementation Phases

### Phase 1: Shared Pattern Library & Extraction Logic
- Create pattern definitions for 5 categories
- Implement `extractFactsWithPatterns()`
- Implement `extractFactsWithLLM()` with Ollama
- Add comprehensive test suite

### Phase 2: Conversational Pathway
- Extend gatekeeper to include extraction
- Update chat API to call unified extraction
- Store facts with session context

### Phase 3: Observational Pathway
- Update Layer 4 memory formation
- Replace LLM-only extraction with unified approach
- Store facts with activity session context

### Phase 4: Cross-Agent Support
- Implement visibility-based retrieval
- Add pattern detection queries
- Test multi-agent scenarios

## Success Metrics

1. **Extraction Coverage**: >70% of cases handled by patterns
2. **Extraction Quality**: Manual review of 100 sampled facts shows >85% usefulness
3. **Performance**: P95 extraction latency <100ms
4. **Cost**: Zero incremental cost vs observation pipeline
5. **Multi-agent**: Successfully detect cross-agent patterns in PR review scenario

## Open Questions

1. **Pattern Library Maintenance**: How do we iteratively improve patterns based on misses?
   - Proposed: Log pattern misses, periodic review to add new patterns

2. **Entity Extraction**: Should patterns extract entities separately?
   - Proposed: Yes, extract entities for filtering and relationship queries

3. **Confidence Calibration**: How do we tune confidence scores?
   - Proposed: Start conservative (0.8-0.9), tune based on manual review

4. **LLM Fallback Model**: llama3.2:latest vs larger models?
   - Proposed: Start with llama3.2, upgrade if quality issues emerge
