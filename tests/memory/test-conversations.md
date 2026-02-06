# Phase 2 Memory System Test Conversations

**Date**: 2026-02-06
**Purpose**: Comprehensive test scenarios for validating memory ingestion, retrieval, and context assembly
**Based on**: [REFERENCE_SCENARIOS.md](../../docs/REFERENCE_SCENARIOS.md)

---

## Overview

These conversations simulate real scenarios from REFERENCE_SCENARIOS.md. Each includes:
1. **Conversation**: Realistic user/assistant exchanges (3-5 turns)
2. **Gatekeeper Decision**: Should ingest? Why?
3. **Expected Memory State**: Entities, facts, episodes in Graphiti
4. **Expected Retrieval**: What queries should retrieve this memory
5. **Pass Criteria**: How to verify memory system worked
6. **Fail Scenarios**: Common ways this could go wrong

---

## Test Conversation 1: Learning from Mistake (JWT → Clerk)

**Scenario**: User tries JWT auth, hits issues, switches to Clerk (Episode 1 from reference scenarios)
**Session ID**: `test-jwt-clerk`

### Conversation

**Turn 1:**
```
User: I need to add authentication to my Expo app. Let's implement JWT-based auth with refresh tokens.