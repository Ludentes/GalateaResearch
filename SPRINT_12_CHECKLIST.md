# Sprint 12: Implementation Checklist
**Phase**: F (Agent Runtime Foundation)
**Duration**: 1 week (Mon 2026-03-14 — Fri 2026-03-21)
**Status**: 🚀 Ready to start
**Total Capacity**: 130 story points

---

## 📋 Overview
Foundation layer for Phase F: multi-step work execution with ReAct agent loop, operational memory persistence, and enhanced retrieval.

**Success Criteria**:
- ✅ All F.1-F.8 deliverables code-complete
- ✅ Phase E tests still green (163 tests passing)
- ✅ E2E message routing verified (Discord ↔ tick ↔ Discord)
- ✅ Operational memory persists across server restarts
- ✅ Safety design approved + ready for Phase G

---

## 🔴 CRITICAL PATH (Week 1)

### F.1: Channel Message Abstraction (16 pts) — FOUNDATION FOR ALL
**Priority**: 🔴 BLOCKING
**Depends on**: Nothing
**Status**: ⬜ Not Started

- [ ] **F.1.1** (2 pts) Define `ChannelMessage` type
  - [ ] Export from `server/types/channel.ts`
  - [ ] Include routing, direction, messageType metadata
  - [ ] Well-documented with examples

- [ ] **F.1.2** (3 pts) Discord adapter (inbound)
  - [ ] Discord → ChannelMessage normalization
  - [ ] @mention parsing (@Agent-Dev-1 extraction)
  - [ ] Thread context preservation
  - [ ] Unit tests for Discord messages

- [ ] **F.1.3** (3 pts) Discord adapter (outbound)
  - [ ] ChannelMessage → Discord webhooks
  - [ ] Thread routing works
  - [ ] Delivery confirmation

- [ ] **F.1.4** (2 pts) Dashboard adapter
  - [ ] Chat UI ↔ ChannelMessage
  - [ ] SSE delivery for outbound
  - [ ] Round-trip verified manually

- [ ] **F.1.5** (2 pts) Channel dispatcher
  - [ ] Routes outbound ChannelMessage to adapters
  - [ ] OTEL logging for audit trail
  - [ ] Graceful degradation

- [ ] **F.1.6** (3 pts) Integration test: Round-trip routing
  - [ ] Discord → agent → Discord ✓
  - [ ] Dashboard → agent → Dashboard ✓
  - [ ] Thread context preserved
  - [ ] All tests pass: `pnpm test channel`

- [ ] **F.1.7** (1 pt) Migration guide
  - [ ] Before/after code examples
  - [ ] List files to update
  - [ ] Clear deprecation path

**Validation**: `pnpm test channel` — all green ✓
**Blocks**: F.2, F.3

---

### F.2: Agent Loop v2 with Tool Scaffolding (24 pts) — CORE RUNTIME
**Priority**: 🔴 CRITICAL
**Depends on**: F.1
**Status**: ⬜ Not Started

- [ ] **F.2.1** (2 pts) ReAct agent loop interface design
  - [ ] AgentLoopInput interface
  - [ ] AgentLoopOutput interface
  - [ ] Execution model: LLM → tool_call? → execute → repeat
  - [ ] Budget controls: max 10 steps, 60s timeout

- [ ] **F.2.2** (5 pts) Inner loop implementation
  - [ ] LLM call with system prompt
  - [ ] Tool call detection & parsing
  - [ ] Safety pre-check stub (always allows)
  - [ ] Budget enforcement (max 10 steps)
  - [ ] Timeout handling (60s)
  - [ ] OTEL logging per iteration

- [ ] **F.2.3** (3 pts) Tool registration system
  - [ ] `registerTool(name, schema, handler, risk)`
  - [ ] Tool schema from ZodSchema
  - [ ] Risk metadata: read | write | destructive
  - [ ] Stub tools: echo, list-tools
  - [ ] Tools discoverable at startup

- [ ] **F.2.4** (2 pts) Tool safety pre-check scaffold
  - [ ] Hook: `safetyPreCheck(toolName, args)`
  - [ ] Currently returns `{allowed: true}`
  - [ ] Integrated into inner loop
  - [ ] Ready for Phase G implementation

- [ ] **F.2.5** (3 pts) Conversation history in context
  - [ ] Load last 5 exchanges from operational memory
  - [ ] Append to system prompt
  - [ ] History bounded correctly
  - [ ] Preserved across tool calls

- [ ] **F.2.6** (2 pts) Budget accounting
  - [ ] Track tokens per section: system, knowledge, tools, history
  - [ ] Log breakdown after loop
  - [ ] Warning if > 80% budget
  - [ ] OTEL event logging

- [ ] **F.2.7** (4 pts) Unit tests
  - [ ] Simple response (no tools)
  - [ ] Tool call iteration (3+ turns)
  - [ ] Budget limit enforcement
  - [ ] Timeout handling
  - [ ] History preservation

- [ ] **F.2.8** (3 pts) Integration test
  - [ ] Task → stub tool calls → response
  - [ ] Multi-turn capability verified
  - [ ] Operational context updated

**Validation**: `pnpm test agent-loop` — all green ✓
**Blocks**: F.3

---

### F.3: Operational Memory (Work State Persistence) (20 pts) — CONTINUITY
**Priority**: 🔴 CRITICAL (can start in parallel with F.2)
**Depends on**: F.2 (can start after F.1)
**Status**: ⬜ Not Started

#### Week 1 (9 pts)
- [ ] **F.3.1** (2 pts) Define types
  - [ ] OperationalContext type
  - [ ] TaskState type
  - [ ] All fields from architecture spec

- [ ] **F.3.2** (3 pts) JSONL store
  - [ ] Load from `data/agents/{id}/context.jsonl`
  - [ ] Save after each tick (atomic)
  - [ ] Handle file creation
  - [ ] Parse/stringify correctly

- [ ] **F.3.3** (2 pts) Task assignment
  - [ ] message.type="task_assignment" → TaskState
  - [ ] Source routing preserved
  - [ ] Status: "assigned", phase: "exploring"

- [ ] **F.3.4** (2 pts) Phase progression
  - [ ] Phases: exploring → deciding → implementing → verifying → done
  - [ ] phaseStartedAt tracked
  - [ ] Progress[] appended

#### Week 2 (11 pts)
- [ ] **F.3.5** (3 pts) Heartbeat tick handler
  - [ ] Detects in-progress tasks
  - [ ] Continues work without new messages
  - [ ] 30s interval (configurable)
  - [ ] Skips if idle

- [ ] **F.3.6** (2 pts) Carryover
  - [ ] Task completion → carryover summary
  - [ ] Available in next session
  - [ ] Human-readable format

- [ ] **F.3.7** (3 pts) Load/save tests
  - [ ] Persist → restart → load ✓
  - [ ] Multiple tasks ✓
  - [ ] Phase progression ✓
  - [ ] Carryover available ✓

- [ ] **F.3.8** (3 pts) Heartbeat integration test
  - [ ] In-progress task continues
  - [ ] No new message, heartbeat triggers
  - [ ] Phase timestamps updated
  - [ ] No double-execution

**Validation**: `pnpm test operational-memory` — all green ✓
**Blocks**: F.4

---

## 🟡 WEEK 2 EXTENDED DELIVERY (81 pts)

### F.4: Homeostasis Wiring to Operational Memory (13 pts)
**Priority**: 🟡 HIGH
**Depends on**: F.3
**Status**: ⬜ Not Started

- [ ] **F.4.1** (2 pts) communication_health → lastOutboundAt
  - [ ] HIGH: message < 5 min ago
  - [ ] HEALTHY: 5m-3h ago
  - [ ] LOW: in-progress + silent > 3h

- [ ] **F.4.2** (2 pts) progress_momentum → phase duration
  - [ ] LOW: same phase > 2h (spinning)
  - [ ] HEALTHY: < 2h in phase
  - [ ] Uses phaseEnteredAt

- [ ] **F.4.3** (2 pts) productive_engagement → task list
  - [ ] HEALTHY: assigned/in-progress task
  - [ ] LOW: idle + no task
  - [ ] HIGH: overloaded (multiple tasks)

- [ ] **F.4.4** (2 pts) knowledge_sufficiency → task context
  - [ ] Query from TaskState.description
  - [ ] Score against retrieved facts
  - [ ] LOW: no facts or low confidence
  - [ ] HEALTHY: ≥3 facts, avg confidence > 0.7

- [ ] **F.4.5** (1 pt) certainty_alignment → task phase
  - [ ] Thresholds: exploring 0.5, deciding 0.7, implementing 0.8, verifying 0.9
  - [ ] Still defaults HEALTHY (no L2 yet)

- [ ] **F.4.6** (1 pt) knowledge_application → phase duration
  - [ ] HIGH: exploring > 90 min with HEALTHY knowledge_sufficiency
  - [ ] HEALTHY: < 90 min or other phases

- [ ] **F.4.7** (3 pts) Integration test
  - [ ] All dimensions react to operational context
  - [ ] Dimension states correct per scenario
  - [ ] `pnpm test homeostasis-wiring` passes

**Validation**: Dimensions use operational memory ✓

---

### F.5: Embedding-Based Retrieval (Qdrant + Hybrid Search) (19 pts)
**Priority**: 🟡 HIGH
**Depends on**: Nothing (can work in parallel)
**Status**: ⬜ Not Started

- [ ] **F.5.1** (1 pt) Verify Qdrant running
  - [ ] Health check: `curl http://localhost:6333/health`
  - [ ] Collection "galatea-knowledge" exists
  - [ ] Port 6333 accessible

- [ ] **F.5.2** (4 pts) Hybrid vector + payload retrieval
  - [ ] `hybridRetrieve(query, limit=10)` function
  - [ ] Embed query (OpenRouter/Ollama)
  - [ ] Search: vector similarity + entity/type/about filters
  - [ ] Fallback to keyword if Qdrant down
  - [ ] Error handling

- [ ] **F.5.3** (3 pts) Composite re-ranking
  - [ ] Formula: `similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1`
  - [ ] Hard rules always in top results
  - [ ] Recency: boost recent, decay old
  - [ ] Confidence boost > 0.8

- [ ] **F.5.4** (2 pts) Migrate entries to Qdrant
  - [ ] Load data/memory/entries.jsonl
  - [ ] Compute embeddings
  - [ ] Index in Qdrant
  - [ ] Maintain JSONL as source of truth

- [ ] **F.5.5** (2 pts) Hard rules budget reservation
  - [ ] Rules (type="rule") identified
  - [ ] Reserved slots in context
  - [ ] Never truncated
  - [ ] Always included in retrieval

- [ ] **F.5.6** (2 pts) Qdrant fallback + logging
  - [ ] Fallback to keyword if unavailable
  - [ ] Log degradation warning
  - [ ] Continue functioning
  - [ ] Circuit breaker pattern

- [ ] **F.5.7** (3 pts) Retrieval tests
  - [ ] Vector similarity works
  - [ ] Entity filtering works
  - [ ] Type filtering works
  - [ ] Composite ranking correct
  - [ ] Hard rules always top
  - [ ] `pnpm test qdrant` passes

- [ ] **F.5.8** (2 pts) Load test (500+ entries)
  - [ ] Latency < 500ms (p95)
  - [ ] Recall > 80% on gold standard
  - [ ] No memory leaks
  - [ ] Benchmarks logged

**Validation**: Retrieval latency < 500ms with 500 entries ✓

---

### F.6: Confabulation Guard (Post-Extraction Validation) (13 pts)
**Priority**: 🟠 MEDIUM
**Depends on**: Nothing (can work in parallel)
**Status**: ⬜ Not Started

- [ ] **F.6.1** (2 pts) Entity validation heuristics
  - [ ] Entities must appear in evidence or be known aliases
  - [ ] Flag invented entities
  - [ ] Substring matching in evidence

- [ ] **F.6.2** (2 pts) about.entity validation
  - [ ] Must reference known person or "unknown"
  - [ ] Invalid entries flagged/removed
  - [ ] Entity name matching

- [ ] **F.6.3** (2 pts) Confidence distribution check
  - [ ] Flag uniform 1.0 confidence
  - [ ] Suggest downward adjustment for inferred
  - [ ] Extracted entries: suggest 0.8 if inferred

- [ ] **F.6.4** (1 pt) Type distribution check
  - [ ] Warn if > 80% same type
  - [ ] Suggest diversity review
  - [ ] Types: fact, preference, rule, procedure, correction, decision

- [ ] **F.6.5** (2 pts) Integrate into pipeline
  - [ ] Pipeline: Extractor → Guard → Dedup → Store
  - [ ] Guard validates, flags bad entries
  - [ ] Continue gracefully
  - [ ] OTEL event: {total, valid, flagged}

- [ ] **F.6.6** (2 pts) Unit tests
  - [ ] Valid extraction passes unchanged
  - [ ] Hallucinated entity flagged
  - [ ] Unknown about.entity removed
  - [ ] Uniform confidence detected

- [ ] **F.6.7** (2 pts) Integration test
  - [ ] Extract → guard validates → store
  - [ ] Bad entries removed
  - [ ] Good entries in knowledge.jsonl
  - [ ] OTEL logs validation summary

**Validation**: Confabulation guard catches hallucinations > 50% ✓

---

### F.7: Token Budget Upgrade (12K + Per-Section Accounting) (11 pts)
**Priority**: 🟠 MEDIUM
**Depends on**: Nothing (independent)
**Status**: ⬜ Not Started

- [ ] **F.7.1** (1 pt) Upgrade to 12K budget
  - [ ] Config: `context.maxTokens = 12000`
  - [ ] Context assembler respects new limit

- [ ] **F.7.2** (3 pts) Per-section token accounting
  - [ ] Track: identity, rules, guidance, operational, history, tools, knowledge
  - [ ] Log breakdown: {section, tokens, percentage}
  - [ ] OTEL event with details

- [ ] **F.7.3** (2 pts) Truncation priority
  - [ ] Never truncate: Identity + Rules + Guidance
  - [ ] Truncate first: Knowledge
  - [ ] Truncate if needed: Tools, History

- [ ] **F.7.4** (2 pts) Budget overage logging
  - [ ] Warning if > 90% used
  - [ ] Error if exceeded
  - [ ] Per-section breakdown
  - [ ] Suggests which to trim

- [ ] **F.7.5** (2 pts) Context assembler tests
  - [ ] Sections fit in 12K
  - [ ] Knowledge truncated cleanly
  - [ ] Non-truncatable preserved
  - [ ] Accounting accurate

- [ ] **F.7.6** (1 pt) Manual verification
  - [ ] Send message → check logs
  - [ ] Verify per-section accounting
  - [ ] Identify bottlenecks
  - [ ] All sections fit

**Validation**: All sections fit in 12K, accounting accurate ✓

---

### F.8: Safety Model Design (Pre-Implementation) (14 pts)
**Priority**: 🟠 MEDIUM (BLOCKS Phase G)
**Depends on**: Nothing (design-only)
**Status**: ⬜ Not Started

- [ ] **F.8.1** (2 pts) Document Layer 0 (LLM guardrails)
  - [ ] Explain leverage of Claude's native safety
  - [ ] What it covers: harmful content, injection resistance
  - [ ] What it doesn't: domain-specific safety

- [ ] **F.8.2** (2 pts) Document Layer 0.5 (Local guardrail model)
  - [ ] Ollama guardrail model (llama-guard, shieldgemma)
  - [ ] ~50ms latency requirement
  - [ ] Classification: input/output → safe/unsafe + category

- [ ] **F.8.3** (2 pts) Document Layer 1 (Homeostasis self_preservation)
  - [ ] 7th dimension definition
  - [ ] What triggers LOW: destructive tools, rule conflicts, trust violations
  - [ ] Multi-dimension resistance examples

- [ ] **F.8.4** (2 pts) Document Layer 2 (Hard guardrails)
  - [ ] Tool risk: read | write | destructive
  - [ ] Hard blocks: rm -rf, DROP TABLE, force push, etc.
  - [ ] Workspace boundaries, branch protection
  - [ ] Pre-LLM checks

- [ ] **F.8.5** (2 pts) Define trust matrix
  - [ ] Channels: Dashboard, Discord, GitLab, Unknown
  - [ ] Identities: Admin/PM, Dev, User, Unknown
  - [ ] Trust levels: FULL, HIGH, MEDIUM, LOW, NONE
  - [ ] Combined: effective = min(channel, identity)

- [ ] **F.8.6** (1 pt) Tool risk metadata schema
  - [ ] Every tool declares: name, risk, allowlist/blocklist
  - [ ] Examples: file_read (read), git_push (write)

- [ ] **F.8.7** (2 pts) Document hook integration
  - [ ] PreToolUse: (toolName, args) → {allowed, reason}
  - [ ] PostToolUse: (toolName, result) → {valid, reason}
  - [ ] Integration into CodingToolAdapter

- [ ] **F.8.8** (1 pt) Review + approval
  - [ ] Safety model doc complete
  - [ ] Team reviews (async or sync)
  - [ ] PM + tech lead approval
  - [ ] Document marked "APPROVED"

**Validation**: Safety design complete, reviewed, approved ✓
**Blocks**: Phase G start

---

## ✅ DAILY VALIDATION CHECKPOINTS

### End of Day (EOD)
- [ ] `pnpm test` — Phase E tests still green (163 tests)
- [ ] No regressions in existing functionality
- [ ] Commit progress with clear messages

### Per Deliverable (Before PR)
- [ ] F.1: Discord round-trip verified manually
- [ ] F.2: Stub tool iteration works
- [ ] F.3: Operational memory persists across restart
- [ ] F.4: Homeostasis dimensions use operational context
- [ ] F.5: Retrieval latency < 500ms with 500 entries
- [ ] F.6: Confabulation guard catches hallucinations
- [ ] F.7: Per-section token accounting visible in logs
- [ ] F.8: Safety design reviewed by team

### Sprint End
- [ ] All 8 deliverables code-complete
- [ ] Phase E tests still green (163/163)
- [ ] Demo: E2E message flow (Discord ↔ tick ↔ Discord)
- [ ] Demo: Heartbeat continues in-progress work
- [ ] Safety model approved + ready for Phase G

---

## 📊 Story Points by Week

| Deliverable | Total | Week 1 | Week 2 |
|-------------|-------|--------|--------|
| **F.1** Channel Abstraction | 16 | 🔴 16 | — |
| **F.2** Agent Loop v2 | 24 | 🔴 24 | — |
| **F.3** Operational Memory | 20 | 9 | 11 |
| **F.4** Homeostasis Wiring | 13 | — | 13 |
| **F.5** Qdrant Retrieval | 19 | — | 19 |
| **F.6** Confabulation Guard | 13 | — | 13 |
| **F.7** Token Budget | 11 | — | 11 |
| **F.8** Safety Design | 14 | — | 14 |
| **TOTAL** | **130** | **49** | **81** |

**Pace**: 49 pts/week (Week 1, critical path) + 81 pts/week (Week 2 if on track)

---

## 🚨 KEY BLOCKERS TO AVOID

### 🚫 DO NOT
- [ ] Break Phase E tests (foundation for F)
- [ ] Commit directly to main — use feature branches
- [ ] Enable Qdrant until tests pass
- [ ] Start tool execution before F.8 approved
- [ ] Implement multi-agent (Phase H only)

### ✅ DO
- [ ] Merge F.1 → F.2 → F.3 in sequence
- [ ] Run `pnpm test` daily
- [ ] Update ARCHITECTURE.md when sections complete
- [ ] Keep CLAUDE.md current with decisions
- [ ] Document new types/interfaces clearly

---

## 📝 FILES TO CREATE/UPDATE

### New Files (Create)
- [ ] `server/types/channel.ts`
- [ ] `server/runtime/agent-loop.ts`
- [ ] `server/runtime/tool-registry.ts`
- [ ] `server/runtime/safety-check.ts`
- [ ] `server/runtime/operational-memory.ts`
- [ ] `server/runtime/task-state.ts`
- [ ] `server/memory/qdrant-retrieval.ts`
- [ ] `server/memory/confabulation-guard.ts`
- [ ] `docs/plans/safety-model.md`
- [ ] `server/__tests__/channel-abstraction.test.ts`
- [ ] `server/__tests__/agent-loop.test.ts`
- [ ] `server/__tests__/operational-memory.test.ts`
- [ ] `server/__tests__/homeostasis-wiring.test.ts`
- [ ] `server/__tests__/qdrant-retrieval.test.ts`
- [ ] `server/__tests__/confabulation-guard.test.ts`
- [ ] `server/__tests__/token-budget.test.ts`

### Existing Files (Update)
- [ ] `server/adapters/discord-adapter.ts`
- [ ] `server/adapters/dashboard-adapter.ts`
- [ ] `server/memory/context-assembler.ts`
- [ ] `server/memory/extraction-pipeline.ts`
- [ ] `server/engine/homeostasis-engine.ts`
- [ ] `server/memory/fact-retrieval.ts`
- [ ] `server/runtime/heartbeat.ts`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/ROADMAP.md`

---

## 🎯 DEFINITION OF DONE (Per Task)

Each task is DONE when:
1. ✅ Code written + type-safe (no `any` types)
2. ✅ Tests written (unit + integration as applicable)
3. ✅ Tests pass (`pnpm test <component>`)
4. ✅ PR created with clear description
5. ✅ Code reviewed by peer
6. ✅ Acceptance criteria met
7. ✅ ARCHITECTURE.md updated (if architectural)
8. ✅ Merged to main

---

## 📚 Reference Documents
- **Detailed Plan**: `docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md`
- **Architecture**: `docs/ARCHITECTURE.md` (Layer 1-5 reference)
- **Roadmap**: `docs/ROADMAP.md` (Phase-level view)

---

*Created: 2026-03-14*
*Status: Ready to execute*
*Print this, track progress, celebrate completion!* 🚀
