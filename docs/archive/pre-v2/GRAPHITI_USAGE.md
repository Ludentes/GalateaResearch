# Graphiti Usage & Optional Status

**Date:** 2026-02-07
**Context:** Clarifying how Graphiti is used in Phase 2 and whether the system can function without it.

---

## TL;DR

**Is Graphiti optional?** **YES** — The system gracefully degrades when Graphiti is unavailable.

**What breaks without Graphiti?**
- `RELEVANT KNOWLEDGE` section is empty (no facts retrieved)
- `RECENT ACTIVITY` section is empty (no episodes)
- Cognitive models (self/user) may have reduced data (they search Graphiti)
- Everything else works: constraints, procedures (from PostgreSQL), chat flow, fact storage

**Does the system still extract and store facts without Graphiti?** **YES** — Facts are stored in PostgreSQL via `server/db/queries/facts.ts`. Graphiti ingestion is fire-and-forget and failures are silently ignored.

---

## Current Graphiti Integration Points

### 1. **Chat Pipeline — Ingestion** (Fire-and-Forget)

**File:** `server/functions/chat.logic.ts` (lines 134-155)

```typescript
// Step 4: Ingest to Graphiti (existing behavior)
if (decision.shouldIngest) {
  const graphitiMessages: GraphitiMessage[] = [
    { content: userMessage, role_type: "user", ... },
    { content: assistantResponse, role_type: "assistant", ... }
  ]
  ingestMessages(sessionId, graphitiMessages).catch(() => {
    // Graceful degradation — no error thrown
  })
}
```

**Behavior:**
- Every message with `shouldIngest: true` is sent to Graphiti
- Graphiti runs async NLP extraction (entities, facts, relationships)
- Failures are caught and ignored (fire-and-forget)
- **Chat continues normally even if Graphiti is down**

---

### 2. **Context Assembly — Fact Retrieval**

**File:** `server/memory/context-assembler.ts` (lines 119-147)

```typescript
// Step 2: Search Graphiti for relevant facts
const facts = await searchFacts(userMessage, [sessionId, "global"], 20)

// Step 3: Score and rank
const scored = scoreFacts(facts)

// Step 4: Fill token budget
for (const sf of scored) {
  factsContent += `- ${sf.fact}\n`
  if (tokens > 4000) break
}

if (factsContent) {
  sections.push({ name: "RELEVANT KNOWLEDGE", content: factsContent, ... })
}
```

**Graphiti Client:** `server/memory/graphiti-client.ts` (lines 112-149)

```typescript
export async function searchFacts(
  query: string,
  groupIds: string[],
  maxFacts = 10,
): Promise<FactResult[]> {
  const res = await graphitiFetch<SearchResponse>("/search", { ... })
  const facts = res?.facts ?? []  // Returns [] on failure
  return facts.slice(0, maxFacts)
}
```

**Behavior:**
- If Graphiti is down → `searchFacts()` returns `[]`
- `scoreFacts([])` returns `[]`
- `if (factsContent)` is false → RELEVANT KNOWLEDGE section is omitted
- **Context assembly completes successfully, just without facts**

---

### 3. **Context Assembly — Episode Retrieval**

**File:** `server/memory/context-assembler.ts` (lines 149-173)

```typescript
// Step 5: Retrieve recent episodes for context
let episodesIncluded = 0
try {
  const episodes = (await getEpisodes(sessionId)) ?? []
  if (episodes.length > 0) {
    sections.push({ name: "RECENT ACTIVITY", content: episodeLines, ... })
    episodesIncluded = episodes.length
  }
} catch {
  // Graceful degradation — skip episodes
}
```

**Behavior:**
- If Graphiti is down → `getEpisodes()` throws or returns `null`
- Catch block silently skips RECENT ACTIVITY section
- **Context assembly continues without episodes**

---

### 4. **Cognitive Models — Self & User Models**

**File:** `server/memory/cognitive-models.ts`

Both `getSelfModel(personaId)` and `getUserModel(userName)` call Graphiti's `searchFacts()` to populate their data:

```typescript
export async function getSelfModel(personaId: string): Promise<SelfModel> {
  // Search Graphiti for persona-specific observations
  const facts = await searchFacts(
    `persona:${personaId} capabilities strengths weaknesses`,
    [personaId],
    10
  )

  // Parse facts into strengths/weaknesses/recentMisses
  return { strengths: [...], weaknesses: [...], recentMisses: [...] }
}
```

**Behavior:**
- If Graphiti is down → `searchFacts()` returns `[]`
- Models return empty arrays: `{ strengths: [], weaknesses: [], recentMisses: [] }`
- Context assembly checks `if (lines.length > 0)` before adding sections
- **SELF-AWARENESS and USER CONTEXT sections are omitted when empty**

---

## What Still Works Without Graphiti

### ✅ **Chat Flow (100% functional)**
- User sends message → stored in PostgreSQL `messages` table
- LLM generates response → stored in PostgreSQL
- Message history retrieved for conversation context
- **Zero dependency on Graphiti**

### ✅ **Fact Extraction & Storage (100% functional)**
- Gatekeeper evaluates message → pattern extraction
- Facts stored in PostgreSQL `facts` table
- LLM fallback (Ollama) still runs if needed
- Gatekeeper log entries written to PostgreSQL
- **All extraction happens locally, Graphiti is just an additional sink**

### ✅ **Context Assembly: Constraints & Procedures (100% functional)**
- `CONSTRAINTS` section: from `preprompts` table (PostgreSQL)
- `RELEVANT PROCEDURES` section: from `procedures` table (PostgreSQL)
- **No Graphiti involved**

### ⚠️ **Context Assembly: Knowledge & Activity (degraded)**
- `RELEVANT KNOWLEDGE` section: **empty** (Graphiti search fails)
- `RECENT ACTIVITY` section: **empty** (episodes only in Graphiti)
- `SELF-AWARENESS` section: **empty** (searches Graphiti)
- `USER CONTEXT` section: **empty** (searches Graphiti)

**Result:** System prompt has 2 sections instead of 6, but chat still functions.

---

## PostgreSQL vs Graphiti: Current Division of Labor

| Data | PostgreSQL | Graphiti | Why Split? |
|------|-----------|----------|------------|
| **Messages** | ✅ Primary | ✅ Copy | PostgreSQL for CRUD, Graphiti for graph analysis |
| **Facts (structured)** | ✅ Primary | ❌ No | PostgreSQL stores extracted facts, Graphiti extracts its own |
| **Facts (Graphiti's)** | ❌ No | ✅ Primary | Graphiti's NLP extracts different facts from raw messages |
| **Episodes** | ❌ No | ✅ Primary | Episodic memory is Graphiti's strength (temporal graph) |
| **Entities** | ❌ No | ✅ Primary | Graphiti builds entity graph (nodes + edges) |
| **Procedures** | ✅ Primary | ❌ No | Trigger-based matching requires SQL, not graph |
| **Cognitive Models** | ⚠️ Metadata | ✅ Observations | PostgreSQL stores model structure, Graphiti stores supporting facts |

**Observation:** There's overlap but not redundancy. PostgreSQL facts are pattern-extracted, Graphiti facts are LLM-extracted from raw messages.

---

## Why Not Just Use PostgreSQL for Everything?

### Graphiti's Unique Value

1. **Entity Graph** — Tracks relationships between entities (e.g., "User works with Sarah on backend team")
2. **Temporal Context** — Episodes have `valid_at` timestamps, enabling time-based queries
3. **Hybrid Search** — Vector embeddings + graph traversal + full-text (better than PostgreSQL ILIKE)
4. **Automatic NLP Extraction** — No pattern maintenance, LLM-based extraction runs on every message

### PostgreSQL's Unique Value

1. **ACID Guarantees** — Facts are transactional, never lost
2. **Trigger Matching** — Procedures use ILIKE on `trigger_pattern` (fast, simple)
3. **Deduplication** — Exact content matching prevents duplicates
4. **Hard Rules** — Non-negotiable constraints stored with `category: hard_rule`

**Current Design:** PostgreSQL for structured memory, Graphiti for unstructured/graph memory.

---

## Can Graphiti Be Removed?

### Short Answer: Yes, but with feature loss

**What you'd lose:**
- RELEVANT KNOWLEDGE section (no fact search)
- RECENT ACTIVITY section (no episodes)
- Entity graph capabilities (no "who works with whom" queries)
- Cognitive model observations (self/user models would be empty unless we build local search)

**What you'd keep:**
- All chat functionality
- Fact extraction and PostgreSQL storage
- Constraints and procedures
- Gatekeeper logging
- Fire-and-forget extraction pipeline

### To Make It Fully Optional (Future Work)

**Option 1: Local Fact Search Fallback**

```typescript
// In context-assembler.ts
const graphitiFacts = await searchFacts(userMessage, [sessionId], 20)
if (graphitiFacts.length === 0) {
  // Fallback: search local PostgreSQL facts
  const localFacts = await searchFactsByText(db, userMessage, { limit: 20 })
  // Convert to FactResult format and score
}
```

**Option 2: Local Episode Storage**

Add `episodes` table to PostgreSQL:
```sql
CREATE TABLE episodes (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  content TEXT,
  created_at TIMESTAMP,
  valid_at TIMESTAMP
)
```

Then `getEpisodes(sessionId)` can fallback to PostgreSQL when Graphiti is down.

**Option 3: Hybrid Cognitive Models**

Store observations in PostgreSQL `facts` table with special categories:
- `category: "self_strength"`
- `category: "self_weakness"`
- `category: "user_preference"`

Then `getSelfModel()` can query local facts instead of Graphiti.

---

## Current Recommendation

**Keep Graphiti as a recommended-but-optional component.**

**Reasoning:**
1. **Graceful degradation works** — System doesn't crash when Graphiti is down
2. **Graphiti provides real value** — Entity graph and hybrid search are hard to replicate in PostgreSQL
3. **Phase 2 achieved its goal** — Local facts (PostgreSQL) + graph knowledge (Graphiti) is a good division
4. **Phase 3 doesn't require Graphiti** — Homeostasis engine can work with just local facts if needed

**Documentation for users:**
- **Minimal setup:** PostgreSQL only (chat + fact extraction + procedures work)
- **Full features:** PostgreSQL + Graphiti (adds knowledge graph, episodes, entity search)

---

## Testing Graphiti-Optional Behavior

### Current Test Coverage

**With Graphiti mocked/unavailable:**
- ✅ `context-assembler.unit.test.ts` — Mocks `searchFacts()` and `getEpisodes()`
- ✅ `cognitive-models.unit.test.ts` — Mocks Graphiti calls
- ✅ `chat.unit.test.ts` — Mocks `ingestMessages()`

**Missing:**
- ❌ Integration test with Graphiti actually down (Docker stopped)
- ❌ Test that verifies context assembly completes without Graphiti
- ❌ Test that verifies fact extraction still works when `ingestMessages` fails

### Recommended Test

```typescript
// tests/integration/graphiti-optional.test.ts
describe("system functions without Graphiti", () => {
  beforeAll(async () => {
    // Verify Graphiti is actually unreachable
    const healthy = await isHealthy()
    if (healthy) {
      throw new Error("Graphiti must be stopped for this test")
    }
  })

  it("chat flow completes successfully", async () => {
    const session = await createSessionLogic(db, { name: "Test" })
    const result = await sendMessageLogic(db, session.id, { message: "I prefer PostgreSQL" })
    expect(result.message.content).toBeDefined()
  })

  it("context assembly returns valid prompt", async () => {
    const context = await assembleContext(sessionId, "What database?", DEFAULT_CONTEXT_BUDGET)
    expect(context.systemPrompt).toBeDefined()
    expect(context.sections.length).toBeGreaterThan(0)  // At least CONSTRAINTS
    // RELEVANT KNOWLEDGE should be missing
    expect(context.sections.find(s => s.name === "RELEVANT KNOWLEDGE")).toBeUndefined()
  })

  it("fact extraction still stores to PostgreSQL", async () => {
    const result = evaluateAndExtract("I prefer dark mode", "Noted.")
    expect(result.extractedFacts.length).toBeGreaterThan(0)

    const stored = await storeFact(db, {
      ...result.extractedFacts[0],
      sourceType: "gatekeeper"
    })
    expect(stored.id).toBeDefined()

    // Verify retrieval
    const facts = await searchFactsByText(db, "dark mode")
    expect(facts.length).toBeGreaterThan(0)
  })
})
```

---

## Summary

| Question | Answer |
|----------|--------|
| Is Graphiti optional? | **Yes** — System degrades gracefully when unavailable |
| What requires Graphiti? | RELEVANT KNOWLEDGE, RECENT ACTIVITY, cognitive model observations |
| What works without Graphiti? | Chat flow, fact extraction, PostgreSQL storage, constraints, procedures |
| Should we remove Graphiti? | **No** — It provides unique graph/entity/episode capabilities |
| Should we document it as optional? | **Yes** — Users should know minimal (PostgreSQL) vs full (+ Graphiti) setups |
