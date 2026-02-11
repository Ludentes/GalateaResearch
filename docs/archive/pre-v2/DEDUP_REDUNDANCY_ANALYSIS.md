# Deduplication & Redundancy Analysis

**Date:** 2026-02-07
**Context:** Analysis of how the Phase 2 memory system handles redundant information in conversations.

---

## Problem Statement

**Scenario:** User has a conversation about PostgreSQL with 36-40 messages:
- 24-30 basic statements ("PostgreSQL is a database", "It's open source")
- 12 variations of "we should use PostgreSQL for everything"

**Question:** How will this be represented in memory and presented in context?

---

## Current Behavior: Full Trace

### 1. Gatekeeper Evaluation (per message)

**File:** `server/memory/gatekeeper.ts` (lines 56-132)

**Logic:** Fail-OPEN policy — skips only greetings and bare confirmations.

```
"I prefer PostgreSQL"           → shouldIngest: true  (PREFERENCE_RE match)
"We use PostgreSQL"             → shouldIngest: true  (POLICY_RE match)
"PostgreSQL is open source"     → shouldIngest: true  (default, >20 chars)
"Our team uses Postgres"        → shouldIngest: true  (POLICY_RE match)
"We always use PostgreSQL"      → shouldIngest: true  (POLICY_RE match)
"PostgreSQL is great"           → shouldIngest: true  (default, >20 chars)
... (30+ more)                  → shouldIngest: true
```

**Result:** 30-36 out of 40 messages pass through (only "ok", "thanks", "hi" skip).

---

### 2. Pattern Extraction (per message)

**File:** `server/memory/fact-extractor.ts`

Each message extracts 0-2 facts:

```
"I prefer PostgreSQL"         → { content: "User prefers PostgreSQL", category: "preference", entities: ["PostgreSQL"] }
"We use PostgreSQL"          → { content: "Team uses PostgreSQL", category: "technology", entities: ["PostgreSQL"] }
"Our team uses Postgres"     → { content: "Team uses Postgres", category: "technology", entities: ["PostgreSQL"] }
"We always use PostgreSQL"   → { content: "Team always uses PostgreSQL", category: "policy", entities: ["PostgreSQL"] }
"PostgreSQL is great"        → No pattern match (but needsLlmExtraction=true)
"PostgreSQL is open source"  → No pattern match (generic statement)
```

**Entity normalization:** The `entities` array gets `["PostgreSQL"]` (normalized from "Postgres"), but the `content` field preserves original wording ("uses Postgres" vs "uses PostgreSQL").

**Result:** ~25-30 extracted facts, most with different `content` strings.

---

### 3. Storage (per fact)

**File:** `server/db/queries/facts.ts` (lines 44-79)

**Dedup logic:** Exact content match only.

```sql
SELECT * FROM facts
WHERE content = 'User prefers PostgreSQL'
  AND superseded_by IS NULL
LIMIT 1
```

**Outcome:**

```
"User prefers PostgreSQL"          → NEW fact #1  (stored)
"Team uses PostgreSQL"             → NEW fact #2  (stored)
"Team uses Postgres"               → NEW fact #3  (stored, content differs by 1 char!)
"Team always uses PostgreSQL"      → NEW fact #4  (stored)
"User likes PostgreSQL"            → NEW fact #5  (stored)
"PostgreSQL is team's database"    → NEW fact #6  (stored)
"We use PostgreSQL for everything" → NEW fact #7  (stored)
... etc.
```

**Result:** ~25-30 separate rows in the `facts` table.

---

### 4. Graphiti Ingestion (fire-and-forget)

**File:** `server/functions/chat.logic.ts` (lines 134-155)

All 30-36 messages (those with `shouldIngest: true`) are sent to Graphiti:

```typescript
if (decision.shouldIngest) {
  ingestMessages(sessionId, [userMessage, assistantResponse])
}
```

Graphiti's internal extraction:
- Creates entity nodes (e.g., "PostgreSQL" entity)
- Extracts facts using its own NLP pipeline
- Links facts to entities via graph edges
- Stores ~20-30 facts internally (many redundant)

**Result:** Graphiti's knowledge graph has 20-30 PostgreSQL-related facts.

---

### 5. Context Assembly (later retrieval)

**File:** `server/memory/context-assembler.ts` (lines 119-147)

When user asks a database-related question:

```typescript
// Search Graphiti (hybrid: vector + graph + text)
const facts = await searchFacts(userMessage, [sessionId, "global"], 20)

// Score by: graphitiScore * 0.7 + recency * 0.2 + 0.1
const scored = scoreFacts(facts)

// Fill 4000 token budget
for (const sf of scored) {
  factsContent += `- ${sf.fact}\n`
  if (tokens > 4000) break
}
```

**Graphiti returns (top 20 by hybrid search):**
- "User prefers PostgreSQL"
- "Team uses PostgreSQL for database"
- "Team always uses PostgreSQL"
- "PostgreSQL is team's primary database"
- "User prefers PostgreSQL over MySQL"
- "Team uses Postgres for everything"
- "PostgreSQL is the standard database"
- "Team decided to use PostgreSQL"
- ... (12 more)

**Token consumption:**
- Each fact: ~5-8 tokens
- 20 facts × 6 tokens = ~120 tokens
- All fit within 4000 token budget

---

### 6. Final Context Prompt

```
## RELEVANT KNOWLEDGE
- User prefers PostgreSQL
- Team uses PostgreSQL for database
- Team always uses PostgreSQL
- PostgreSQL is team's primary database
- User prefers PostgreSQL over MySQL
- Team uses Postgres for everything
- PostgreSQL is the standard database
- Team decided to use PostgreSQL
- User likes PostgreSQL for projects
- PostgreSQL is used by the team
- We use PostgreSQL exclusively
- PostgreSQL is our choice for data storage
- Team prefers PostgreSQL
- PostgreSQL is what we use
- Our database is PostgreSQL
- PostgreSQL for all data needs
- Team standard: PostgreSQL
- Use PostgreSQL for everything
- PostgreSQL is the database
- Team policy: use PostgreSQL
```

**Problems:**
- 20 bullets, ~15 are paraphrases of "use PostgreSQL"
- Wastes 120 tokens conveying the same signal
- Clutters the prompt with redundancy
- Provides zero marginal information after the first 3 facts

---

## Root Causes

### ❌ **No Semantic Deduplication**

**Current:** Only exact string match prevents duplicates.

```typescript
// facts.ts line 52
eq(facts.content, input.content)  // "prefers PostgreSQL" ≠ "likes PostgreSQL"
```

**Missing:** Embedding similarity, entity-based matching, paraphrase detection.

### ❌ **No Cross-Message Awareness**

**Current:** Each message evaluated independently.

**Gatekeeper doesn't know:**
- "Already stored 10 PostgreSQL facts this session"
- "This is the 12th 'use PostgreSQL' statement"
- "Confidence should be boosted by repetition, not stored separately"

### ❌ **No Clustering or Summarization**

**Current:** Each fact becomes a separate bullet.

**Missing:**
- Rollup: "Team exclusively uses PostgreSQL (high confidence, mentioned 12 times)"
- Dedup: Group similar facts, keep highest-confidence version
- Frequency-based confidence boosting

### ❌ **No Retrieval-Time Deduplication**

**Current:** Context assembly just concatenates scored facts.

**Missing:**
- "Already added 'use PostgreSQL', skip similar facts"
- Cluster nearby facts: "PostgreSQL (preferences: prefers, likes; policy: always use)"

---

## Why This Wasn't Caught

### Test Coverage Gaps

1. **`phase2-complete.test.ts`** — Only tests 2 consecutive identical messages (exact match dedup works)
2. **`extraction-quality.test.ts`** — Runs against 22 diverse golden dataset cases (no redundancy stress test)
3. **No "redundant conversation" integration test** — Missing: 10+ paraphrased statements about the same topic

### Design Assumptions

- Phase 2 focused on **extraction quality** (recall/precision)
- Dedup was scoped to "prevent exact duplicates" (achieved)
- Semantic dedup deferred to Phase 6 (memory promotion pipeline)

---

## Impact Assessment

### Low-Volume Conversations (Current)
- 5-10 facts per topic → Redundancy noticeable but not critical
- Token waste: ~50 tokens (5 redundant facts × 10 tokens)

### High-Volume Conversations (Real-World)
- 30+ facts per topic → Severe prompt clutter
- Token waste: ~200 tokens (20 redundant facts × 10 tokens)
- **4000 token fact budget consumed by ~10 distinct signals repeated**

### Retrieval Quality
- Redundant facts don't harm correctness (all are true)
- But they dilute token budget, preventing retrieval of diverse facts from other topics

---

## What Phase 6 Would Fix

**From:** `docs/KNOWN_GAPS.md` (gap #5)

> **Memory promotion pipeline** — Detecting similar episodes (needs embeddings or LLM comparison), counting supporting observations without contradictions

### Promotion Chain

```
Episode 1:  "I prefer PostgreSQL"        }
Episode 2:  "We use PostgreSQL"           } → Cluster similar observations
Episode 3:  "Team always uses PostgreSQL" }    (embedding similarity > 0.85)
... (9 more)                              }
                  ↓
Promoted Fact: "Team exclusively uses PostgreSQL"
  - confidence: 0.98 (boosted by 12 supporting observations)
  - evidence_count: 12
  - first_observed: 2026-02-05
  - last_observed: 2026-02-07
                  ↓
Archive 12 individual episodes (preserve raw data)
Surface only the promoted fact in context
```

### Required Components (Phase 6)

1. **Embedding similarity** — Compute cosine similarity between fact embeddings
2. **Clustering** — Group facts with similarity > 0.85
3. **Confidence boosting** — `base_confidence + (observation_count * 0.05)` up to 0.99
4. **Promotion logic** — Create high-level fact, archive low-level observations
5. **Retrieval ranking** — Prioritize promoted facts over raw observations

---

## Immediate Workarounds (If Needed Before Phase 6)

### Option 1: Simple Frequency Limit (Bandaid)
```typescript
// In context-assembler.ts, after scoring:
const seenEntities = new Set<string>()
const dedupedFacts = scored.filter(f => {
  const entityKey = f.entities.join(',')
  if (seenEntities.has(entityKey) && seenEntities.size > 3) return false
  seenEntities.add(entityKey)
  return true
})
```
**Effect:** Max 3 facts per entity. Reduces "PostgreSQL" from 20 → 3 bullets.
**Cost:** Loses nuance (preference vs policy vs decision).

### Option 2: Entity-Based Rollup (Medium Effort)
```typescript
// Group facts by primary entity, take top 2 per entity
const grouped = groupBy(scored, f => f.entities[0])
const topPerEntity = Object.values(grouped).flatMap(g => g.slice(0, 2))
```
**Effect:** "PostgreSQL" → 2 facts, "React" → 2 facts, etc.
**Cost:** Still doesn't merge paraphrases.

### Option 3: Wait for Phase 6 (Recommended)
- Current behavior is non-breaking (just inefficient)
- Phase 6 promotion pipeline solves it properly
- No hacky bandaid code to maintain

---

## Recommendation

**Accept current behavior as a Phase 2 limitation.**

**Reasoning:**
1. **Not a correctness issue** — Facts are true, just redundant
2. **Doesn't break retrieval** — Relevant info still surfaces
3. **Phase 6 is the proper fix** — Semantic dedup requires embeddings/LLM
4. **Bandaids create tech debt** — Simple heuristics (entity limit) lose nuance

**Action:** Document in `KNOWN_GAPS.md` as gap #13.

---

## Test That Would Have Caught This

```typescript
// tests/memory/redundancy-stress.test.ts
it("handles redundant conversation without prompt clutter", async () => {
  const messages = [
    "I prefer PostgreSQL",
    "We use PostgreSQL for everything",
    "Team always uses PostgreSQL",
    "PostgreSQL is our standard",
    "I like PostgreSQL",
    ... (10 more paraphrases)
  ]

  // Extract and store all
  for (const msg of messages) {
    const result = evaluateAndExtract(msg, "Noted.")
    for (const fact of result.extractedFacts) {
      await storeFact(db, { ...fact, sourceType: "gatekeeper" })
    }
  }

  // Assemble context
  const context = await assembleContext(sessionId, "What database?", budget)

  // RELEVANT KNOWLEDGE section should have max 5 PostgreSQL facts (not 15)
  const knowledgeSection = context.sections.find(s => s.name === "RELEVANT KNOWLEDGE")
  const postgresLines = knowledgeSection?.content.split('\n')
    .filter(line => line.toLowerCase().includes('postgresql'))

  expect(postgresLines.length).toBeLessThanOrEqual(5)  // FAILS currently (would be ~15)
})
```

This test would fail with current implementation, catching the redundancy issue.
