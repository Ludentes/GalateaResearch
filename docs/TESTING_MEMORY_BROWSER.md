# Memory Browser Testing Instructions

## Current State After Single-Graph Migration

✅ **Architecture:** Single `galatea_memory` graph in FalkorDB
✅ **"All Sessions" Search:** Works - searches entire graph
✅ **Filtered Search:** Works - filters by `group_id` property
✅ **Episodes:** Works - retrieves episodes for any `group_id`

## Why Episodes Tab Shows Empty

**Root Cause:** Session dropdown shows sessions from PostgreSQL, but there's no data in Graphiti for those session IDs.

**Flow:**
1. User opens Memory Browser → fetches sessions from PostgreSQL
2. User selects session from dropdown → uses that session's UUID
3. Frontend queries Graphiti with that UUID → Graphiti has no data for it
4. Episodes tab shows empty ❌

## Testing Scenarios

### Scenario A: Test with Existing Graphiti Data (Quick)

We have test data in Graphiti but not in PostgreSQL dropdown.

**Test Session IDs:**
- `session-docker-123` - Docker Discussion (2 episodes, ~5 facts)
- `session-pnpm-456` - Package Managers (1 episode, ~2 facts)
- `session-database-789` - Database Discussion (1 episode, ~2 facts)

**Manual Test via API:**

```bash
# Test Episodes for Docker session
curl "http://localhost:13000/api/memories/episodes?group_id=session-docker-123&last_n=10" | jq

# Expected: 2 episodes about Docker

# Test Search in Docker session
curl "http://localhost:13000/api/memories/search?query=Docker&group_ids=session-docker-123&max_facts=10" | jq

# Expected: Facts about Docker, containers, docker-compose

# Test All Sessions Search
curl "http://localhost:13000/api/memories/search?query=Docker&max_facts=30" | jq

# Expected: Facts from all sessions mentioning Docker
```

**Frontend Workaround:**
- Manually edit frontend code to use test session IDs
- OR use browser console: temporarily set selectedSession to test IDs
- OR wait for Scenario B (proper sessions)

### Scenario B: Create Real Sessions via Frontend (Proper)

This creates sessions in BOTH PostgreSQL AND Graphiti.

**Steps:**

1. **Open Galatea** → http://localhost:13000

2. **Create Session 1 - Docker Discussion:**
   - Click "New Chat"
   - Send message: `"I love using Docker for containerization. It makes my development workflow much smoother."`
   - Wait 10 seconds for Graphiti processing
   - Note the session ID from URL: `/chat/{SESSION_ID}`

3. **Create Session 2 - Package Managers:**
   - Click "New Chat"
   - Send message: `"I prefer pnpm over npm because it's faster and more efficient with disk space."`
   - Wait 10 seconds
   - Note session ID

4. **Create Session 3 - Databases:**
   - Click "New Chat"
   - Send message: `"PostgreSQL is my favorite database. I also use Redis for caching."`
   - Wait 10 seconds
   - Note session ID

5. **Test Memory Browser:**
   - Navigate to `/memories`
   - **Session Dropdown:** Should show your 3 new sessions ✅
   - **Select Session 1:** Should show Docker episodes and facts ✅
   - **Select "All Sessions":** Should search across all 3 sessions ✅
   - **Search "Docker":** Should find facts from Session 1
   - **Search "pnpm":** Should find facts from Session 2
   - **Switch to Episodes tab:** Should show episode content ✅

### Scenario C: Directly Insert Test Sessions into PostgreSQL (Dev)

Add the test sessions to PostgreSQL so they appear in dropdown.

```bash
# Connect to PostgreSQL
docker exec -it galatea-postgres-1 psql -U postgres -d galatea

# Insert test sessions
INSERT INTO chat_session (id, data, created_at, updated_at) VALUES
  ('session-docker-123', '{"name": "Docker Discussion"}', NOW(), NOW()),
  ('session-pnpm-456', '{"name": "Package Managers"}', NOW(), NOW()),
  ('session-database-789', '{"name": "Database Discussion"}', NOW(), NOW());

# Exit
\q
```

Now the dropdown will show these sessions, and they have data in Graphiti!

## Expected Test Results

### ✅ Working Features

1. **All Sessions Search**
   - Query: "Docker"
   - Expected: Facts from any session mentioning Docker
   - Behavior: Searches entire `galatea_memory` graph

2. **Filtered Session Search**
   - Query: "Docker" + Session: "Docker Discussion"
   - Expected: Only Docker facts from that session
   - Behavior: Adds `WHERE group_id = 'session-docker-123'`

3. **Episodes Tab**
   - Select session: "Docker Discussion"
   - Expected: 2 episode cards with message content
   - Behavior: Calls `/api/memories/episodes?group_id=...`

4. **Fact Search Results**
   - Shows fact text, timestamps
   - Client-side filters prioritize exact keyword matches (short queries)

### ✅ Verified via Direct API

```bash
# All sessions - 9 facts across all sessions
curl -s "http://localhost:18000/search" -d '{"query": "Docker", "max_facts": 30}' | jq '.facts | length'
# Output: 9

# Specific session - 2 facts from pnpm session
curl -s "http://localhost:18000/search" -d '{"query": "pnpm", "group_ids": ["session-pnpm-456"], "max_facts": 10}' | jq '.facts | length'
# Output: 2

# Episodes - 2 episodes from Docker session
curl -s "http://localhost:18000/episodes/session-docker-123?last_n=10" | jq 'length'
# Output: 2
```

## Troubleshooting

### Issue: "All Sessions" returns empty
**Check:**
```bash
# Verify galatea_memory graph has data
docker exec galatea-falkordb-1 redis-cli GRAPH.QUERY galatea_memory "MATCH (n) RETURN count(n)"
```
**Expected:** > 0 nodes

**Fix:** Re-run seed script or create sessions via frontend

### Issue: Selected session shows empty episodes
**Check:**
```bash
# Check if session exists in PostgreSQL
docker exec galatea-postgres-1 psql -U postgres -d galatea -c "SELECT id, data->>'name' FROM chat_session;"

# Check if that session ID has data in Graphiti
docker exec galatea-falkordb-1 redis-cli GRAPH.QUERY galatea_memory "MATCH (n) WHERE n.group_id = 'YOUR-SESSION-ID' RETURN count(n)"
```

**Fix:** Session exists in PostgreSQL but not Graphiti → send messages to that session to populate Graphiti

### Issue: Search returns all facts regardless of query
**Status:** Fixed via client-side filtering (commit c7e9a41)

**Behavior:** Short queries (< 10 chars) now prioritize exact keyword matches

## Recommended Test Flow

**For Quick Verification:**
→ Use **Scenario A** (test via API with existing data)

**For Full UI Testing:**
→ Use **Scenario B** (create sessions via frontend)

**For Development:**
→ Use **Scenario C** (insert test sessions into PostgreSQL)

## Success Criteria

- [ ] Session dropdown shows sessions with data
- [ ] Selecting a session shows episodes in Episodes tab
- [ ] Search with "All Sessions" finds facts across all sessions
- [ ] Search with specific session filters correctly
- [ ] Short keyword queries (e.g., "Docker") prioritize exact matches
- [ ] Episodes show full message content and timestamps

## Notes

- **Data freshness:** Graphiti processes messages asynchronously (~10 seconds)
- **Single-graph benefit:** No need for complex multi-graph search
- **Architecture:** All sessions in `galatea_memory` graph, filtered by `group_id` property
- **PostgreSQL vs Graphiti:** Sessions must exist in BOTH for dropdown to work properly
