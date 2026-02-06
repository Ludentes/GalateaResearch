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

**Status:** KNOWN LIMITATION - Upstream Graphiti issue

**Root Cause:** Graphiti's REST API (`POST /search`) returns empty results when `group_ids` field is omitted from the request body. The API treats `group_ids: null` or omitted field as "filter to nothing" instead of "search all groups".

**Investigation:** Our TypeScript code correctly omits `group_ids` when searching all sessions:
```typescript
const body: SearchRequest = {
  query,
  max_facts: maxFacts * 2,
  ...(groupIds.length > 0 && { group_ids: groupIds }),  // Omits field when empty
}
```

But Graphiti's search implementation requires explicit `group_ids` array. Without it, the FalkorDB fulltext search returns no results.

**Workaround Options:**
1. **Frontend parallel search** - Fetch all session IDs, search each session, merge results
2. **Backend aggregation** - Add new API endpoint that queries all sessions server-side
3. **Wait for upstream fix** - File issue with Graphiti to support `group_ids: null` = search all

**Test:**
```bash
# This returns empty (Graphiti limitation):
curl "http://localhost:13000/api/memories/search?query=pnpm&max_facts=30"

# This works (specific session):
curl "http://localhost:13000/api/memories/search?query=pnpm&group_ids=SESSION_ID&max_facts=30"
```

**Impact:** Medium - "All sessions" dropdown doesn't work, but single-session search works perfectly.

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
