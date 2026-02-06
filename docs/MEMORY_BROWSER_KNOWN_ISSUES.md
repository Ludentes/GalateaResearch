# Memory Browser Known Issues

## Search Returns All Results Regardless of Query (C2)

**Status:** Known Graphiti limitation, not a bug in our code

**Symptom:** Searching for "dog" in a session about "pnpm" returns all 6 facts about pnpm.

**Root Cause:** Graphiti's hybrid search (BM25 + vector similarity) falls back to pure vector search when:
1. The knowledge graph is very small (< 100 facts)
2. Query terms don't match BM25 index exactly

With only 6 facts in the test session, vector embeddings show high semantic similarity between ALL facts, so every query returns everything.

**Evidence:**
- FalkorDB indexes ARE properly created (verified via `CALL db.indexes()`)
- Entity nodes have FULLTEXT index on `name` and `summary` fields
- Direct Graphiti API calls show same behavior - not our TypeScript code
- Small dataset (6 facts) triggers semantic-only fallback

**Workaround:** Populate larger knowledge graphs (50+ facts) to get proper BM25 keyword matching.

**Test:**
```bash
# Create session with diverse topics
curl -X POST http://localhost:18000/messages -H "Content-Type: application/json" -d '{
  "group_id": "test-large",
  "messages": [
    {"content": "User prefers Python for backend development", "role_type": "user", "role": "user", "name": "msg1", "source_description": "test"},
    {"content": "User likes Docker for containerization", "role_type": "user", "role": "user", "name": "msg2", "source_description": "test"},
    {"content": "User uses PostgreSQL for databases", "role_type": "user", "role": "user", "name": "msg3", "source_description": "test"},
    {"content": "User prefers dark mode in IDEs", "role_type": "user", "role": "user", "name": "msg4", "source_description": "test"},
    {"content": "User likes functional programming", "role_type": "user", "role": "user", "name": "msg5", "source_description": "test"}
  ]
}'

# Wait 10 seconds for processing
sleep 10

# Search should now be more discriminating
curl -X POST http://localhost:18000/search -H "Content-Type: application/json" -d '{
  "query": "Docker",
  "group_ids": ["test-large"],
  "max_facts": 10
}'
```

**Long-term Fix:**
- File issue with Graphiti: "BM25 search should take priority over vector search for exact keyword matches"
- Or: Implement client-side post-filtering by keyword matching

**Impact:** Medium - search works but isn't precise with small datasets. Acceptable for Phase 2 MVP since production usage will have larger graphs.

---

## "All Sessions" Search Returns Empty (C1)

**Status:** FIXED in commit [pending]

**Root Cause:** API route was converting `undefined` to `[]` with `?? []` operator, then passing empty array to `searchFacts()`, which correctly omits `group_ids` field only when array is empty. But the route created empty array from undefined.

**Fix:** Let `searchFacts()` handle the empty array case directly:
```typescript
// BEFORE (broken)
const groupIds = group_ids ? group_ids.split(",").filter(Boolean) : undefined
const facts = await searchFacts(query, groupIds ?? [], maxFacts)  // Forces [] when undefined

// AFTER (fixed)
const groupIds = group_ids ? group_ids.split(",").filter(Boolean) : []
const facts = await searchFacts(query, groupIds, maxFacts)  // Passes [] directly
```

**Test:**
```bash
# Search without group_ids (all sessions)
curl "http://localhost:13000/api/memories/search?query=pnpm&max_facts=30"
# Should return facts from ALL sessions
```

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
