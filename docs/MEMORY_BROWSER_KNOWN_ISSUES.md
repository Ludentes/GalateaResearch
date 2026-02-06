# Memory Browser Known Issues

## Search Returns All Results Regardless of Query (C2)

**Status:** FIXED with client-side exact-match prioritization

**Symptom:** Searching for "pnpm" in a session returns all 6 facts including unrelated "dark mode" facts.

**Root Cause:** Graphiti's hybrid search (BM25 + vector similarity) falls back to pure vector search when:
1. The knowledge graph is very small (< 100 facts)
2. Query terms don't match BM25 index exactly

With only 6 facts in the test session, vector embeddings show high semantic similarity between ALL facts, so every query returns everything.

**Our Fix:** Implemented client-side post-filtering in `server/memory/graphiti-client.ts`:
```typescript
// For short queries (< 10 chars OR single word), prioritize exact keyword matches
if (isShortQuery && facts.length > 0) {
  const exactMatches = facts.filter((f) => hasExactKeywordMatch(f.fact, query))
  const fuzzyMatches = facts.filter((f) => !hasExactKeywordMatch(f.fact, query))
  return [...exactMatches, ...fuzzyMatches].slice(0, maxFacts)
}
```

This is **much cleaner** than modifying Graphiti's Docker image - it's entirely in our codebase and doesn't require rebuilding containers.

**Result:** Searching for "pnpm" now returns exact matches first (4 facts containing "pnpm"), with semantic matches at the bottom (2 "dark mode" facts).

**Test:**
```bash
curl "http://localhost:13000/api/memories/search?query=pnpm&group_ids=SESSION_ID&max_facts=10" | jq '.facts[].fact'
# First 4 results contain "pnpm", last 2 are fuzzy matches
```

**Impact:** Fixed! Search now prioritizes exact keyword matches for short queries, solving the precision issue without modifying Graphiti.

---

## "All Sessions" Search Returns Empty (C1)

**Status:** ✅ FIXED - Migrated to single-graph architecture

**Original Issue:** FalkorDB's multi-graph architecture (one graph per session) made cross-session search impossible.

**Solution:** Migrated to single-graph architecture:
- All sessions stored in single `galatea_memory` graph
- Sessions differentiated by `group_id` property (not separate graphs)
- Aligns with single-user personal memory system use case

**Changes Made:**
1. Modified FalkorDriver to use `galatea_memory` as default database
2. Removed multi-graph logic
3. Fresh start with new data model

**Test Results:**
```bash
# All sessions search - WORKS ✅
curl "http://localhost:13000/api/memories/search?query=Docker&max_facts=30"

# Specific session search - WORKS ✅
curl "http://localhost:13000/api/memories/search?query=Docker&group_ids=SESSION_ID&max_facts=30"
```

**Impact:** FIXED - Both "All sessions" and filtered session search now work perfectly!

---

## Recommendations

### For Testing
1. Create diverse test sessions with 20+ messages each
2. Use distinct topics (Python, Docker, databases, UI preferences)
3. Verify search precision improves with larger dataset

### For Production
1. Document that search quality improves with usage (more facts = better BM25)
2. Consider adding client-side keyword highlighting to show relevance
3. File Graphiti issue about small-dataset search behavior

---

*Created: 2026-02-06*
*Last Updated: 2026-02-06*
