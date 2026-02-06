# Memory System Tests

**Purpose**: Validate Phase 2 memory system functionality

---

## Quick Start

### Prerequisites

1. **Start all services**:
```bash
docker-compose up -d postgres falkordb graphiti
pnpm dev
```

2. **Verify Graphiti is healthy**:
```bash
curl http://localhost:18000/healthcheck
# Should return: {"status":"healthy"}
```

3. **Clear FalkorDB graph** (fresh start):
```bash
docker restart galatea-falkordb
# Wait 5 seconds for restart
```

---

## Run Tests

### Option 1: Run all validation tests
```bash
pnpm test tests/memory/phase2-validation.test.ts
```

### Option 2: Run specific test
```bash
# Test 1: JWT → Clerk learning
pnpm test tests/memory/phase2-validation.test.ts -t "Learning from Mistake"

# Test 5: Cross-session retrieval
pnpm test tests/memory/phase2-validation.test.ts -t "Cross-Session Retrieval"

# Test 6: Gatekeeper filtering
pnpm test tests/memory/phase2-validation.test.ts -t "Gatekeeper"
```

### Option 3: Watch mode (re-run on changes)
```bash
pnpm test tests/memory/phase2-validation.test.ts --watch
```

---

## What the Tests Do

### Test 1: Learning from Mistake (JWT → Clerk)
- **Tests**: Episodic memory, preference extraction
- **Conversation**: User tries JWT → hits bugs → switches to Clerk → succeeds
- **Verifies**:
  - Episodes ingested
  - Entities extracted (JWT, Clerk)
  - Preference fact created ("Clerk > JWT")

### Test 2: Workaround Discovery (NativeWind Bug)
- **Tests**: Procedural memory, code workarounds
- **Conversation**: User finds Pressable animation flicker → discovers workaround
- **Verifies**:
  - Workaround captured as fact
  - Technical details preserved

### Test 3: PR Feedback Learning (Null Checks)
- **Tests**: Pattern reinforcement
- **Conversation**: PR submitted → reviewer finds null check issue → user fixes
- **Verifies**:
  - Null check pattern extracted
  - Learning from feedback

### Test 4: Manual Knowledge Entry (Hard Rule)
- **Tests**: Explicit fact storage
- **Conversation**: User states "Never use Realm"
- **Verifies**:
  - Hard rule captured
  - Alternative (SQLite) extracted

### Test 5: Cross-Session Retrieval
- **Tests**: Single-graph architecture
- **Process**: Store fact in Session 1 → retrieve from Session 2
- **Verifies**:
  - Cross-session search works
  - Global search works

### Test 6: Gatekeeper Filtering
- **Tests**: Noise filtering
- **Process**: Send greetings, confirmations, substantive content
- **Verifies**:
  - Greetings NOT ingested
  - Substantive content IS ingested

---

## Expected Results

### All Passing (Success!)
```
✓ Test 1: Learning from Mistake (4/4 assertions)
✓ Test 2: Workaround Discovery (3/3 assertions)
✓ Test 3: PR Feedback Learning (2/2 assertions)
✓ Test 4: Manual Knowledge Entry (3/3 assertions)
✓ Test 5: Cross-Session Retrieval (3/3 assertions)
✓ Test 6: Gatekeeper Filtering (3/3 assertions)

Test Files  1 passed (1)
     Tests  18 passed (18)
  Duration  ~45s
```

**Interpretation**: Phase 2 working as designed, proceed to Phase 3 ✅

### Partial Passing (Issues)
```
✓ Test 1: Learning from Mistake (4/4 assertions)
✗ Test 2: Workaround Discovery (1/3 assertions FAILED)
✓ Test 3: PR Feedback Learning (2/2 assertions)
✓ Test 4: Manual Knowledge Entry (3/3 assertions)
✗ Test 5: Cross-Session Retrieval (0/3 assertions FAILED)
✓ Test 6: Gatekeeper Filtering (3/3 assertions)
```

**Interpretation**: Some functionality broken, needs investigation
- Check Graphiti logs: `docker logs galatea-graphiti`
- Check entity extraction quality
- Verify single-graph architecture

---

## Debugging Failed Tests

### Test Fails: "Graphiti sidecar is not healthy"
**Symptom**: Test suite exits immediately with error
**Fix**:
```bash
docker-compose up -d graphiti
# Wait 10 seconds
curl http://localhost:18000/healthcheck
```

### Test Fails: "No episodes ingested"
**Symptom**: `expect(episodes.length).toBeGreaterThan(0)` fails
**Diagnosis**:
1. Check gatekeeper logs in Galatea console
2. Check Graphiti ingestion logs: `docker logs galatea-graphiti | grep POST`
3. Verify messages weren't filtered as greetings

**Fix**:
- If gatekeeper too strict: Adjust patterns in `server/memory/gatekeeper.ts`
- If Graphiti not receiving: Check `chat.logic.ts` ingestion call

### Test Fails: "No entities/facts extracted"
**Symptom**: `searchFacts()` returns empty array
**Diagnosis**:
1. Check if episodes exist: `getEpisodes(sessionId)` should return data
2. If episodes exist but no facts: Entity extraction issue
3. Check Graphiti LLM: `docker logs galatea-graphiti | grep "entity"`

**Fix**:
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check model quality: Try `llama3.1:8b` instead of `gpt-oss:latest`
- Check Graphiti config: Entity extraction prompt may need tuning

### Test Fails: "Cross-session retrieval"
**Symptom**: Session 2 can't find Session 1 facts
**Diagnosis**:
1. Check if single-graph architecture is working
2. Verify `group_id` properties on nodes
3. Test "All sessions" filter in Memory Browser

**Fix**:
- Check Graphiti fork changes: `graphiti/GALATEA_FORK_CHANGES.md`
- Verify FalkorDB graph name: Should be `galatea_memory`
- Check search includes multiple `group_ids`

### Test Fails: "Gatekeeper not filtering"
**Symptom**: Greetings ARE ingested (should be filtered)
**Diagnosis**:
1. Check gatekeeper decision logs
2. Verify patterns in `gatekeeper.ts`

**Fix**:
- Strengthen greeting patterns
- Add more confirmation patterns
- Adjust short exchange threshold

---

## Manual Verification

After tests pass, manually verify in Memory Browser:

1. **Go to** http://localhost:3000/memories

2. **Check Facts tab**:
   - Search "Clerk" → Should find JWT vs Clerk preference
   - Search "Realm" → Should find "Never use Realm" rule
   - Search "null" → Should find null check pattern

3. **Check Episodes tab**:
   - Select session → Should see ingested conversations
   - Episodes should have meaningful summaries (not just "user sent message")

4. **Check "All Sessions" filter**:
   - Should see facts from all test sessions
   - Verifies cross-session search

---

## Cleanup

After testing, clean up test data:

```bash
# Option 1: Restart FalkorDB (clears graph)
docker restart galatea-falkordb

# Option 2: Delete test sessions from PostgreSQL
psql -h localhost -p 15432 -U galatea -d galatea \
  -c "DELETE FROM sessions WHERE name LIKE 'test-%';"

# Option 3: Full reset (nuclear option)
docker-compose down -v
docker-compose up -d
pnpm db:push  # Recreate schema
pnpm db:seed  # Reseed data
```

---

## Next Steps

### If All Tests Pass (5/6 or 6/6)
1. ✅ Phase 2 validated
2. Document any minor issues as known limitations
3. Proceed to Phase 3 (Homeostasis Engine) confidently

### If Some Tests Fail (3-4/6)
1. Investigate failures (see "Debugging" section above)
2. Fix critical issues (cross-session retrieval, gatekeeper)
3. Re-run tests
4. Decide: Block Phase 3 OR proceed with caution

### If Many Tests Fail (0-2/6)
1. Major issues in memory system
2. Block Phase 3 implementation
3. Focus on fixing:
   - Graphiti sidecar integration
   - Ingestion pipeline
   - Entity extraction quality
4. Re-run tests until 4+ passing

---

*Tests created: 2026-02-06*
*Estimated run time: 45-60 seconds*
