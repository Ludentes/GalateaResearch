# Phase 2 Memory System: Testing Summary

**Date**: 2026-02-06
**Status**: Ready for Discussion
**Purpose**: Define test scenarios and strategy before Phase 3

---

## 5 Key Test Conversations

### 1. Learning from Mistake (JWT → Clerk)
**Tests**: Episodic memory, preference extraction, temporal sequence

**Conversation**: User tries JWT auth → hits refresh token bugs → switches to Clerk → succeeds

**Expected Memory**:
- Entity: `JWT`, `Clerk`, `Expo authentication`
- Facts: "Clerk preferred over JWT for Expo auth" (confidence: 0.8-0.9)
- Facts: "JWT has token refresh issues in mobile apps"
- Episode: Captured sequence of attempt → failure → pivot → success

**Query Test**: "How should I implement auth in Expo?" → Should retrieve Clerk preference

---

### 2. Workaround Discovery (NativeWind Animation Bug)
**Tests**: Procedural memory, code examples, temporal validity

**Conversation**: User encounters Pressable animation flicker → debugs → finds workaround (inline styles for animated props)

**Expected Memory**:
- Entity: `NativeWind`, `Pressable`, `animation flicker`
- Facts: "NativeWind className causes flicker with Pressable animations"
- Procedure: "Handle NativeWind animation flicker" with steps + code example
- Temporal: `valid_until: "NativeWind 4.1 release"` (if mentioned)

**Query Test**: "Pressable animation flickering" → Should retrieve workaround procedure

---

### 3. PR Feedback Learning (Null Checks)
**Tests**: Pattern reinforcement, self-awareness, repetition learning

**Conversation**: User submits PR → reviewer finds missing null check → user fixes → learns pattern

**Expected Memory**:
- Entity: `null checks`, `code review`, `user object`
- Facts: "Always add null checks on user objects before PR"
- Episode: PR feedback received, mistake corrected
- Self-observation: "Null checks are easy to miss" (if repeated)

**Query Test**: "PR checklist" → Should retrieve null check requirement

---

### 4. Manual Knowledge Entry (Hard Rule)
**Tests**: Explicit fact storage, hard rule guarantee, alternatives

**Conversation**: User explicitly states "Never use Realm database - sync issues and painful migrations. Use SQLite + Drizzle instead."

**Expected Memory**:
- Entity: `Realm`, `SQLite`, `Drizzle`
- Facts: "Never use Realm database" (type: hard_rule, confidence: 1.0)
- Facts: "Realm has sync issues and painful migrations"
- Facts: "Use SQLite + Drizzle instead of Realm"

**Query Test**: "Which database should I use?" → Should retrieve Realm block + alternatives

---

### 5. Multi-Turn Context (Clerk Followup)
**Tests**: Cross-session retrieval, fact recall, context enrichment

**Conversation** (NEW SESSION, days later): User asks "How do I set up Clerk in my app?"

**Expected Behavior**:
- Context assembly retrieves: "Clerk preferred over JWT" fact
- Response acknowledges prior learning
- Provides Clerk setup steps with confidence

**Query Test**: Session 2 should retrieve facts from Session 1 (cross-session search)

---

## Testing Strategy

### Option A: Manual Testing (Recommended First)
**Process**:
1. Clear FalkorDB graph (`docker restart galatea-falkordb`)
2. Create each test session in UI
3. Have conversations exactly as scripted
4. Use Memory Browser to verify entities/facts
5. Use Graphiti API directly to query facts
6. Score: PASS/FAIL per scenario

**Pros**: Quick to execute, easy to inspect, good for initial validation
**Cons**: Not repeatable, manual verification tedious
**Time**: ~30-45 minutes total

### Option B: Automated Integration Tests
**Process**:
1. Write test script that:
   - Creates session via API
   - Sends messages via API
   - Waits for ingestion
   - Queries Graphiti for expected state
   - Asserts entities/facts exist
   - Asserts retrieval works
2. Run test suite
3. Generate pass/fail report

**Pros**: Repeatable, fast, regression-safe
**Cons**: Takes time to write, harder to debug failures
**Time**: ~4-6 hours to build, ~2 minutes to run

### Option C: Hybrid (Recommended)
**Process**:
1. Manual testing first (Option A) - validate core functionality
2. If PASS: Write automated tests for regression
3. If FAIL: Fix issues, then automate

**Rationale**: Don't automate broken functionality

---

## Success Criteria

### Hard Requirements (Must Pass)
- ✅ **Gatekeeper correctly filters greetings**: "Hi", "Thanks" NOT ingested
- ✅ **Substantive exchanges ARE ingested**: Preference statements, technical discussions
- ✅ **Entities extracted**: At least 80% of key entities identified
- ✅ **Facts created**: At least 1 fact per substantive turn
- ✅ **Cross-session retrieval works**: Session 2 can retrieve Session 1 facts

### Soft Requirements (Should Pass)
- ✅ **Fact confidence reasonable**: 0.7-1.0 for explicit statements
- ✅ **Episode summaries meaningful**: Not just "user sent message"
- ✅ **Retrieval precision**: Query "auth" returns auth-related facts (not everything)
- ✅ **Retrieval recall**: Query "Clerk" returns Clerk preference (not missed)

### Known Limitations (Acceptable for Phase 2)
- ⚠️ **Procedural extraction basic**: May not capture all procedure steps perfectly
- ⚠️ **Temporal validity not parsed**: "valid until X" may be in text but not structured
- ⚠️ **Self-awareness limited**: Cognitive models infrastructure exists but not integrated

---

## What to Do If Suboptimal

### Issue 1: Gatekeeper Over-Filters (Too Strict)
**Symptom**: Important technical discussions not ingested
**Diagnosis**: Check gatekeeper logs, review pattern matches
**Fix Options**:
1. Add patterns for technical discussions (e.g., "implement", "bug", "error")
2. Adjust short exchange threshold (currently <20 + <100 chars)
3. Add LLM-based classification for ambiguous cases (Phase 3+)

### Issue 2: Gatekeeper Under-Filters (Too Loose)
**Symptom**: Greetings, confirmations, noise ingested
**Diagnosis**: Check Memory Browser for "Hi", "Ok", "Thanks" facts
**Fix Options**:
1. Strengthen fast-skip patterns
2. Add more confirmation patterns
3. Increase short exchange threshold

### Issue 3: Poor Entity Extraction
**Symptom**: Missing key entities like "Clerk", "JWT", "NativeWind"
**Diagnosis**: Check Graphiti entity extraction (LLM-based)
**Fix Options**:
1. Verify Graphiti LLM is working (check `docker logs galatea-graphiti`)
2. Check Ollama model quality (`gpt-oss:latest` may need upgrade)
3. Test with better model (e.g., `llama3.1:8b` or API-based)
4. Adjust Graphiti entity extraction prompts

### Issue 4: Facts Too Generic
**Symptom**: Facts like "User discussed auth" instead of "Clerk preferred over JWT"
**Diagnosis**: Graphiti fact extraction quality
**Fix Options**:
1. Improve message content (more specific technical details)
2. Use better LLM model for Graphiti
3. Add custom fact extraction prompts (Phase 3+)
4. Use relationship edges to add context

### Issue 5: Retrieval Fails (Facts Exist But Not Retrieved)
**Symptom**: Query "auth" doesn't return auth facts
**Diagnosis**: Check Graphiti search (BM25 + vector + graph)
**Fix Options**:
1. Verify embeddings are generated (`nomic-embed-text`)
2. Check if dataset too small (< 100 facts → falls back to vector only)
3. Test exact keyword match (should work via BM25)
4. Check client-side filtering (implemented in Stage B)

### Issue 6: Cross-Session Retrieval Fails
**Symptom**: Session 2 can't see Session 1 facts
**Diagnosis**: Check group_id filtering in Graphiti client
**Fix Options**:
1. Verify single-graph architecture is working
2. Check `group_id` property on nodes (should be session ID)
3. Test "All sessions" filter in Memory Browser
4. Check Graphiti search includes multiple group_ids

---

## Remediation Priority

**If 0-2 scenarios pass**: Major issues, block Phase 3
- Focus on gatekeeper + ingestion pipeline
- Check Graphiti sidecar health
- Verify end-to-end flow

**If 3-4 scenarios pass**: Minor issues, can proceed with caution
- Document known issues
- Plan fixes for Phase 3 integration
- Continue with limited functionality

**If 5 scenarios pass**: Phase 2 working as designed
- Write automated regression tests
- Proceed to Phase 3 confidently
- Monitor for edge cases in production

---

## Next Steps

1. **Execute Manual Testing** (Option A above)
2. **Score Each Scenario** (PASS/FAIL + notes)
3. **Discuss Results**:
   - What worked well?
   - What needs improvement?
   - Are issues blockers for Phase 3?
4. **Decide Path Forward**:
   - Remediate issues now OR
   - Document as known limitations OR
   - Defer to Phase 3+ improvements

---

*Testing plan ready: 2026-02-06*
*Ready to execute: Manual testing first, automated later*
