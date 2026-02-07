# Phase 2 Memory System Testing Plan

**Date**: 2026-02-06
**Status**: Ready to Execute
**Purpose**: Comprehensive validation of memory system before Phase 3

---

## Executive Summary

Before implementing Phase 3 (Homeostasis Engine), we need to validate that Phase 2 (Memory System) works correctly for the scenarios in REFERENCE_SCENARIOS.md. This document defines:

1. **5 Test Conversations** covering key memory scenarios
2. **Expected Memory State** after each conversation
3. **Testing Strategy** (manual + automated)
4. **Success Criteria** (what "working" looks like)
5. **Remediation Plan** (what to do if suboptimal)

---

## Test Scenarios Overview

| # | Scenario | Tests | Duration |
|---|----------|-------|----------|
| 1 | Learning from Mistake (JWT → Clerk) | Episodic memory, preference extraction | 5-10 min |
| 2 | Workaround Discovery (NativeWind bug) | Procedural memory, temporal validity | 5 min |
| 3 | PR Feedback Learning (null checks) | Pattern reinforcement, self-awareness | 5 min |
| 4 | Manual Knowledge Entry (hard rule) | Explicit fact storage, retrieval guarantee | 3 min |
| 5 | Multi-Turn Context (Clerk followup) | Cross-session retrieval, fact recall | 5 min |

**Total Testing Time**: ~25-35 minutes for manual execution

---

## Test Conversation 1: Learning from Mistake (JWT → Clerk)

**Reference**: Episode 001 from REFERENCE_SCENARIOS.md
**Session ID**: `test-001-jwt-clerk`
**What It Tests**: Episodic memory, preference extraction, temporal sequence

### Conversation

```markdown
User: I need to add auth to my Expo app. Let's use JWT with refresh tokens.