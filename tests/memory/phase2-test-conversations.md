# Phase 2 Memory System Test Conversations

**Date**: 2026-02-06  
**Purpose**: Validate memory ingestion, retrieval, and context assembly before Phase 3  
**Based on**: [REFERENCE_SCENARIOS.md](../../docs/REFERENCE_SCENARIOS.md)

---

## How to Use This Document

### For Manual Testing
1. Start Galatea with clean FalkorDB graph
2. Create session for each test conversation
3. Have the conversations exactly as written
4. Check Memory Browser for expected entities/facts  
5. Verify retrieval with test queries
6. Score: PASS if criteria met, FAIL otherwise

### For Automated Testing
- Parse conversations into test cases
- Use Graphiti API to verify expected state
- Compare retrieved facts against expected facts
- Generate pass/fail report

---

## Test Conversation 1: Learning from Mistake (JWT → Clerk)

**Scenario**: User tries JWT auth, fails, switches to Clerk  
**Reference**: Episode 001 from REFERENCE_SCENARIOS.md  
**Session ID**: `test-jwt-clerk`  
**Duration**: ~30 minutes simulated

### Conversation

**Turn 1:**
```
User: I need to add authentication to my Expo app. Let's implement JWT-based auth with refresh tokens.
