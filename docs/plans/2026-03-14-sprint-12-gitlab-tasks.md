# Sprint 12: GitLab Task Creation Guide

**Sprint**: 12 (Phase F Part 1: Agent Runtime Foundation)
**Start Date**: 2026-03-14
**Duration**: 1 week
**Status**: Ready to create tasks

---

## Parent Epic

**Title**: Sprint 12: Agent Runtime Foundation (Phase F Part 1)

**Description**:
```
Foundation layer for Phase F: multi-step work execution with ReAct agent loop,
operational memory persistence, and enhanced retrieval.

Duration: 1 week (Mon 2026-03-14 — Fri 2026-03-21)
Total Capacity: 130 story points

Key Deliverables:
- F.1: Channel Message Abstraction (16 pts)
- F.2: Agent Loop v2 with Tool Scaffolding (24 pts)
- F.3: Operational Memory (20 pts)
- F.4: Homeostasis Wiring to Operational Memory (13 pts)
- F.5: Embedding-Based Retrieval with Qdrant (19 pts)
- F.6: Confabulation Guard (13 pts)
- F.7: Token Budget Upgrade (11 pts)
- F.8: Safety Model Design (14 pts)

Dependencies:
- Requires: Phase E complete (163 tests passing)
- Blocks: Phase G (Work Execution)

Success Criteria:
✅ All F.1-F.8 deliverables code-complete
✅ Phase E tests still green (163 tests passing)
✅ Integration test: Round-trip message routing works
✅ Heartbeat tick continues in-progress work without inbound messages
✅ Operational memory persists across server restarts
✅ Safety model design document reviewed and approved

Detailed plan: docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md
Task checklist: docs/plans/2026-03-14-sprint-12-task-checklist.md
```

**Labels**: `sprint::12`, `phase::f`, `runtime`

**Milestone**: Sprint 12

---

## F.1: Channel Message Abstraction (16 points)

### Overview
Every other deliverable depends on unified message routing. Define the `ChannelMessage` type and implement adapters for Discord, Dashboard, and internal channels.

**Status**: 🚀 Critical (Week 1)
**Depends on**: Nothing
**Blocks**: F.2, F.3

---

### F.1.1: Define ChannelMessage type (2 pts)
**Assignee**: @backend
**Description**:
```
Define the ChannelMessage type that normalizes all inbound/outbound messages.

Acceptance Criteria:
✅ Type exported from server/types/channel.ts
✅ Includes routing metadata (threadId, replyToId, mentionedAgents, projectId, mrId)
✅ Has direction (inbound | outbound)
✅ Has messageType (chat | task_assignment | review_comment | status_update)
✅ Type-safe with no `any` types
✅ Well-documented with examples

Files to create:
- server/types/channel.ts

Reference: ARCHITECTURE.md Layer 3 (Agent Runtime) - Channel Abstraction section
```

---

### F.1.2: Implement Discord adapter (inbound) (3 pts)
**Assignee**: @backend
**Description**:
```
Convert Discord webhook messages to ChannelMessage format.

Acceptance Criteria:
✅ Discord messages normalize to ChannelMessage
✅ @mention parsing works (@Agent-Dev-1 extracted to mentionedAgents)
✅ Thread context preserved in routing.threadId
✅ Message source tracked (from user, channel, etc.)
✅ Unit tests cover common Discord message shapes

Files to update:
- server/adapters/discord-adapter.ts (refactor existing)

Files to create:
- server/__tests__/discord-inbound.test.ts

Reference: ARCHITECTURE.md Channel Abstraction - Discord adapter
```

---

### F.1.3: Implement Discord adapter (outbound) (3 pts)
**Assignee**: @backend
**Description**:
```
Convert ChannelMessage to Discord webhooks/API calls.

Acceptance Criteria:
✅ ChannelMessage → Discord webhook POST
✅ Thread routing works (message with routing.threadId goes to correct thread)
✅ @mention prefixes added if routing.mentionedAgents present
✅ Delivery confirmed with response
✅ Error handling for network failures

Files to update:
- server/adapters/discord-adapter.ts (refactor existing)

Reference: ARCHITECTURE.md Channel Abstraction - Discord outbound
```

---

### F.1.4: Implement Dashboard adapter (2 pts)
**Assignee**: @backend
**Description**:
```
Connect Chat UI to agent tick via ChannelMessage.

Acceptance Criteria:
✅ Chat UI messages normalize to ChannelMessage (inbound)
✅ Agent responses dispatch as ChannelMessage (outbound)
✅ SSE delivery for real-time UI updates
✅ Message routing metadata preserved (session, user context)
✅ Round-trip verified in manual testing

Files to update:
- server/adapters/dashboard-adapter.ts (refactor existing)
- server/routes/chat.ts (if needed)

Reference: ARCHITECTURE.md Channel Abstraction - Dashboard adapter
```

---

### F.1.5: Create channel dispatcher (2 pts)
**Assignee**: @backend
**Description**:
```
Route outbound ChannelMessage to correct adapter based on channel type.

Acceptance Criteria:
✅ Function signature: dispatchMessage(msg: ChannelMessage) → Promise<void>
✅ Routes to Discord, Dashboard, GitLab adapters based on msg.channel
✅ Logs all dispatches to OTEL (audit trail)
✅ Delivery confirmation or retry logic
✅ Graceful degradation if adapter unavailable

Files to create:
- server/runtime/channel-dispatcher.ts

Reference: ARCHITECTURE.md Channel Abstraction overview
```

---

### F.1.6: Integration test: Round-trip routing (3 pts)
**Assignee**: @test
**Description**:
```
Verify end-to-end message flow through adapters.

Acceptance Criteria:
✅ Discord → normalize to ChannelMessage → agent loop → normalize to Discord response ✅
✅ Dashboard → ChannelMessage → agent loop → SSE to UI ✅
✅ Thread context preserved end-to-end
✅ Mention parsing works (Discord input → mentionedAgents → routed in output)
✅ All assertions pass

Files to create:
- server/__tests__/channel-abstraction.test.ts (integration)

Run: pnpm test channel
```

---

### F.1.7: Migration guide for legacy PendingMessage (1 pt)
**Assignee**: @docs
**Description**:
```
Document how to migrate existing code from PendingMessage to ChannelMessage.

Acceptance Criteria:
✅ Guide shows before/after code examples
✅ Lists all files that reference PendingMessage
✅ Explains mapping between old and new types
✅ Clear deprecation path

Files to create:
- docs/guides/channel-message-migration.md (or update existing adapter docs)

Reference: Current files in server/adapters/ and server/routes/
```

---

## F.2: Agent Loop v2 with Tool Scaffolding (24 points)

### Overview
Replace the single-call tick loop with a modern ReAct agent loop that supports multi-step work, conversation history, and budget-controlled tool execution.

**Status**: 🚀 Critical (Week 1)
**Depends on**: F.1
**Blocks**: F.3

---

### F.2.1: Define ReAct agent loop interface (2 pts)
**Assignee**: @backend
**Description**:
```
Design the contract for the agent loop: input, output, execution model.

Acceptance Criteria:
✅ Interface AgentLoopInput with: context, systemPrompt, tools, budget
✅ Interface AgentLoopOutput with: finalResponse, toolCalls, tokensUsed
✅ Execution model documented: LLM → tool_call? → execute → repeat
✅ Budget controls: max 10 steps, max 60s, max token usage
✅ Types exported and well-documented

Files to create:
- server/runtime/agent-loop.ts (type definitions)

Reference: ARCHITECTURE.md Layer 3 (Agent Runtime) - Agent Loop section
```

---

### F.2.2: Implement inner loop (LLM + tool handling) (5 pts)
**Assignee**: @backend
**Description**:
```
Implement the core agent loop: LLM call → tool detection → safety pre-check → execution.

Acceptance Criteria:
✅ Call LLM with system prompt + tools
✅ Parse response: text? → break; tool_call? → continue
✅ Safety pre-check (stub, always allows for now)
✅ Execute tool, feed result back to LLM context
✅ Budget enforcement: stop after 10 steps or 60s
✅ Update operational context with each tool call
✅ Timeout handling (force text response if budget exhausted)
✅ OTEL logging for each iteration

Files to create:
- server/runtime/agent-loop.ts (implementation)

Reference: ARCHITECTURE.md Agent Runtime - Agent Loop (step 5 INNER LOOP)
```

---

### F.2.3: Implement tool registration system (3 pts)
**Assignee**: @backend
**Description**:
```
Allow tools to register themselves with the agent loop.

Acceptance Criteria:
✅ Function: registerTool(name, schema, handler, riskLevel)
✅ Tool schema from ZodSchema (type-safe)
✅ Risk metadata on each tool: read | write | destructive
✅ Stub tools: echo, list-tools (for testing)
✅ Tools discoverable at startup
✅ Tool schemas included in LLM system prompt (within token budget)

Files to create:
- server/runtime/tool-registry.ts

Files to update:
- server/runtime/agent-loop.ts (use registry)

Reference: ARCHITECTURE.md Layer 5 (Tools / MCP)
```

---

### F.2.4: Tool safety pre-check scaffold (2 pts)
**Assignee**: @backend
**Description**:
```
Create placeholder for safety checks (always allows for now, ready for Phase G).

Acceptance Criteria:
✅ Hook in inner loop before tool execution
✅ Function: safetyPreCheck(toolName, args) → {allowed: bool, reason: string}
✅ Currently always returns {allowed: true}
✅ Integrated into agent loop (calls this before execution)
✅ Ready to implement real checks in Phase G (F.8 design)

Files to create:
- server/runtime/safety-check.ts (skeleton)

Files to update:
- server/runtime/agent-loop.ts (call safety-check)

Reference: ARCHITECTURE.md Safety Model (Layers 0-2) - to be implemented in Phase G
```

---

### F.2.5: Conversation history in context (3 pts)
**Assignee**: @backend
**Description**:
```
Include last N exchanges from operational memory in LLM system prompt.

Acceptance Criteria:
✅ Load recentHistory from operational context (last 5 exchanges)
✅ Format: [{role: "user", content: "..."}, {role: "assistant", content: "..."}]
✅ Append to system prompt before tool schemas
✅ History bounded: remove oldest if exceeds max tokens
✅ Preserved across multiple tool calls in same loop iteration

Files to update:
- server/runtime/agent-loop.ts (include history in context)
- server/memory/context-assembler.ts (if needed)

Reference: ARCHITECTURE.md Layer 3 - "Conversation history"
```

---

### F.2.6: Budget accounting (2 pts)
**Assignee**: @backend
**Description**:
```
Track token usage per section for debugging and optimization.

Acceptance Criteria:
✅ Track tokens per section: system, knowledge, tools, history
✅ Log breakdown after each agent loop run
✅ OTEL event with {section, tokens, percentage}
✅ Warning if any section > 80% of budget
✅ Per-section tracking visible in agent loop output

Files to update:
- server/runtime/agent-loop.ts (add accounting)
- server/memory/context-assembler.ts (if needed)

Reference: ARCHITECTURE.md Layer 3 - "Token budget"
```

---

### F.2.7: Inner loop tests (unit) (4 pts)
**Assignee**: @test
**Description**:
```
Unit tests for agent loop core logic.

Acceptance Criteria:
✅ Simple response (no tools): agent responds with text
✅ Tool call iteration: LLM → tool → feedback → repeat (3 iterations)
✅ Budget limit: stops after 10 steps
✅ Timeout: stops after 60s
✅ History preservation: older messages removed, recent kept
✅ All tests pass

Files to create:
- server/__tests__/agent-loop.test.ts

Run: pnpm test agent-loop
```

---

### F.2.8: Integration test: Agent loop with stub tools (3 pts)
**Assignee**: @test
**Description**:
```
End-to-end test of agent loop with stub tools.

Acceptance Criteria:
✅ Send task description to agent loop
✅ Agent calls stub echo tool (e.g., "repeat: hello")
✅ Tool returns result, fed back to LLM
✅ Agent generates final response
✅ Final response includes tool output
✅ Operational context updated with tool calls

Files to create/update:
- server/__tests__/agent-loop.test.ts (add integration test)

Run: pnpm test agent-loop
```

---

## F.3: Operational Memory (Work State Persistence) (20 points)

### Overview
Persistent working memory that tracks current tasks, phases, and progress. Enables agent to continue work across ticks without new inbound messages.

**Status**: 🚀 Critical (Week 1 start, Week 2 finish)
**Depends on**: F.2 (can start in parallel with F.2)
**Blocks**: F.4

---

### F.3.1: Define OperationalContext and TaskState types (2 pts)
**Assignee**: @backend
**Description**:
```
Define the operational memory data structures.

Acceptance Criteria:
✅ OperationalContext type with: tasks[], workPhase, nextActions, blockers, carryover, recentHistory
✅ TaskState type with: id, description, source, status, phase, progress, artifacts, timestamps
✅ All fields from unified architecture spec
✅ Proper TypeScript types (no any)
✅ Well-documented with examples

Files to create:
- server/runtime/operational-memory.ts (type definitions)
- server/runtime/task-state.ts (optional, separate file)

Reference: ARCHITECTURE.md Layer 2 (Memory System) - Operational Memory section
```

---

### F.3.2: Implement operational memory store (JSONL) (3 pts)
**Assignee**: @backend
**Description**:
```
Load/save operational context to persistent JSONL storage.

Acceptance Criteria:
✅ Load from data/agents/{agentId}/context.jsonl
✅ Save after each tick (atomic writes)
✅ Handle file creation if doesn't exist
✅ Parse/stringify JSONL format correctly
✅ Timestamp tracking (lastUpdated)
✅ Error handling for file I/O

Files to update:
- server/runtime/operational-memory.ts (add store functions)

Reference: ARCHITECTURE.md - "Storage: data/agents/{agent-id}/context.jsonl"
```

---

### F.3.3: Task assignment from ChannelMessage (2 pts)
**Assignee**: @backend
**Description**:
```
Convert inbound task_assignment message to TaskState.

Acceptance Criteria:
✅ Message with messageType="task_assignment" → new TaskState
✅ TaskState.id unique (UUID or similar)
✅ TaskState.description from message content
✅ TaskState.source preserves full routing info
✅ TaskState.status = "assigned"
✅ TaskState.phase = "exploring"
✅ Saved to operational memory

Files to update:
- server/runtime/operational-memory.ts (add createTask function)
- server/runtime/agent-loop.ts (call createTask on inbound message)

Reference: ARCHITECTURE.md - "Work Arc" diagram
```

---

### F.3.4: Task phase progression (2 pts)
**Assignee**: @backend
**Description**:
```
Update task phase and track phase entry timestamp.

Acceptance Criteria:
✅ Phase transitions: exploring → deciding → implementing → verifying → done
✅ Update phaseStartedAt when phase changes
✅ Status updates tracked in progress[] array
✅ State saved after each transition
✅ Multiple tasks tracked (list in operational memory)

Files to update:
- server/runtime/operational-memory.ts (add updatePhase function)
- server/runtime/agent-loop.ts (call updatePhase)

Reference: ARCHITECTURE.md Layer 3 - Work Arc section
```

---

### F.3.5: Heartbeat tick handler (3 pts)
**Assignee**: @backend
**Description**:
```
Detect and continue in-progress work when no new inbound message arrives.

Acceptance Criteria:
✅ Heartbeat fires every 30s (configurable)
✅ Check operational context for in-progress tasks
✅ If found, trigger agent loop with task context (no new message)
✅ Agent continues work using recent history + phase
✅ Respects 30s interval (don't spam)
✅ Skip if idle (no tasks)

Files to create/update:
- server/runtime/heartbeat.ts (refactor existing)

Reference: ARCHITECTURE.md Layer 3 - "Heartbeat integration"
```

---

### F.3.6: Carryover for cross-session continuity (2 pts)
**Assignee**: @backend
**Description**:
```
When task completes, save summary for next session.

Acceptance Criteria:
✅ Task completion → generate carryover summary
✅ Carryover added to OperationalContext.carryover[]
✅ Includes: task description, key findings, artifacts created
✅ Available in next session's context
✅ Format human-readable (for LLM context)

Files to update:
- server/runtime/operational-memory.ts (add generateCarryover function)
- server/runtime/agent-loop.ts (call on task completion)

Reference: ARCHITECTURE.md - OperationalContext "carryover" field
```

---

### F.3.7: Operational memory load/save tests (3 pts)
**Assignee**: @test
**Description**:
```
Test persistence and retrieval of operational context.

Acceptance Criteria:
✅ Create task → save → restart server → load → task exists
✅ Multiple tasks: create 3 tasks, load all correctly
✅ Phase progression: change phase → save → load → phase updated
✅ Carryover: complete task → carryover available in new session
✅ File format: JSONL with one line per update (append-only safety)

Files to create:
- server/__tests__/operational-memory.test.ts

Run: pnpm test operational-memory
```

---

### F.3.8: Heartbeat integration test (3 pts)
**Assignee**: @test
**Description**:
```
Verify heartbeat continues in-progress work.

Acceptance Criteria:
✅ Create in-progress task
✅ No inbound message for 30s (heartbeat tick)
✅ Heartbeat triggers agent loop
✅ Agent loop uses task context from operational memory
✅ Phase timestamps updated correctly
✅ No double-execution (heartbeat respects last tick time)

Files to create/update:
- server/__tests__/operational-memory.test.ts (add heartbeat test)

Run: pnpm test operational-memory
```

---

## F.4: Homeostasis Wiring to Operational Memory (13 points)

### Overview
Connect homeostasis dimensions to operational memory so guidance adapts based on task phase, duration, and communication patterns.

**Status**: 🔵 Planned (Week 2)
**Depends on**: F.3
**Blocks**: Nothing (but improves agent behavior)

---

### F.4.1: Connect communication_health to lastOutboundAt (2 pts)
**Assignee**: @backend
**Description**:
```
Dimension state reacts to message sending pattern.

Acceptance Criteria:
✅ HIGH: message sent < 5 min ago (cooldown)
✅ HEALTHY: message sent 5m-3h ago
✅ LOW: in-progress task + silent > 3h
✅ Uses OperationalContext.lastOutboundAt
✅ Heuristic: no LLM call needed

Files to update:
- server/engine/homeostasis-engine.ts (update assessCommunicationHealth)

Reference: ARCHITECTURE.md - Dimension 4 (Communication Health)
```

---

### F.4.2: Connect progress_momentum to phase duration (2 pts)
**Assignee**: @backend
**Description**:
```
Detect stuck state when phase doesn't change.

Acceptance Criteria:
✅ LOW: same phase > 2h with HEALTHY knowledge_sufficiency (spinning)
✅ HEALTHY: making progress (< 2h in phase, or phase changed recently)
✅ Uses OperationalContext.phaseEnteredAt
✅ Heuristic: no LLM call needed

Files to update:
- server/engine/homeostasis-engine.ts (update assessProgressMomentum)

Reference: ARCHITECTURE.md - Dimension 3 (Progress Momentum)
```

---

### F.4.3: Connect productive_engagement to task list (2 pts)
**Assignee**: @backend
**Description**:
```
Dimension state reacts to task availability.

Acceptance Criteria:
✅ HEALTHY: assigned or in-progress task exists
✅ LOW: idle + no pending messages + no task
✅ HIGH: multiple tasks waiting (overload signal)
✅ Uses OperationalContext.tasks[]
✅ Heuristic: simple task list check

Files to update:
- server/engine/homeostasis-engine.ts (update assessProductiveEngagement)

Reference: ARCHITECTURE.md - Dimension 5 (Productive Engagement)
```

---

### F.4.4: Connect knowledge_sufficiency to task context (2 pts)
**Assignee**: @backend
**Description**:
```
Retrieval driven by task description, scored against results.

Acceptance Criteria:
✅ Use TaskState.description as retrieval query
✅ Score: retrieved facts count + confidence levels
✅ LOW: no facts found or low confidence
✅ HEALTHY: ≥3 facts with avg confidence > 0.7
✅ HIGH: very high confidence or >10 facts (over-confident?)

Files to update:
- server/engine/homeostasis-engine.ts (update assessKnowledgeSufficiency)
- Connect to fact-retrieval query

Reference: ARCHITECTURE.md - Dimension 1 (Knowledge Sufficiency)
```

---

### F.4.5: Connect certainty_alignment to task phase (1 pt)
**Assignee**: @backend
**Description**:
```
Lower certainty threshold for later phases.

Acceptance Criteria:
✅ Exploring: threshold 0.5 (okay to be uncertain, learning phase)
✅ Deciding: threshold 0.7 (need moderate confidence)
✅ Implementing: threshold 0.8 (need higher confidence)
✅ Verifying: threshold 0.9 (high confidence before finalizing)
✅ Still defaults HEALTHY without L2 LLM call (Phase E behavior)

Files to update:
- server/engine/homeostasis-engine.ts (update assessCertaintyAlignment with phase thresholds)

Reference: ARCHITECTURE.md - Dimension 2 (Certainty Alignment)
```

---

### F.4.6: Connect knowledge_application to phase duration (1 pt)
**Assignee**: @backend
**Description**:
```
Detect analysis paralysis (exploring too long).

Acceptance Criteria:
✅ HIGH: exploring > 90 min with HEALTHY knowledge_sufficiency (time to apply)
✅ HEALTHY: exploring < 90 min, or other phases
✅ Uses OperationalContext.phaseEnteredAt
✅ Heuristic: simple time check

Files to update:
- server/engine/homeostasis-engine.ts (update assessKnowledgeApplication)

Reference: ARCHITECTURE.md - Dimension 6 (Knowledge Application)
```

---

### F.4.7: Integration test: Homeostasis reads operational memory (3 pts)
**Assignee**: @test
**Description**:
```
Verify all dimension assessments use operational context correctly.

Acceptance Criteria:
✅ Create task in exploring phase, < 30 min → HEALTHY progress_momentum
✅ Keep in same phase 2h+ → LOW progress_momentum
✅ Task exists → HEALTHY productive_engagement
✅ No task, idle → LOW productive_engagement
✅ Last message sent 5 min ago → HIGH communication_health
✅ Last message sent 4h ago + in-progress task → LOW communication_health
✅ Phase=implementing for task → threshold 0.8 for certainty_alignment

Files to create:
- server/__tests__/homeostasis-wiring.test.ts

Run: pnpm test homeostasis-wiring
```

---

## F.5: Embedding-Based Retrieval (Qdrant + Hybrid Search) (19 points)

### Overview
Enable vector-based knowledge retrieval with fallback to keyword search. Unlocks scaling to 500+ entries.

**Status**: 🔵 Planned (Week 2)
**Depends on**: F.1 (indirectly, but can work in parallel)
**Blocks**: Nothing (F.6-F.8 independent)

---

### F.5.1: Verify Qdrant running at localhost:6333 (1 pt)
**Assignee**: @infra
**Description**:
```
Ensure Qdrant is operational before implementation.

Acceptance Criteria:
✅ Qdrant health check endpoint responds
✅ Collection "galatea-knowledge" exists
✅ Docker Compose includes Qdrant service
✅ Port 6333 accessible

Files to check:
- docker-compose.yml
- Qdrant health endpoint: curl http://localhost:6333/health

Reference: ARCHITECTURE.md - "Qdrant hybrid search"
```

---

### F.5.2: Implement hybrid retrieval (vector + payload filter) (4 pts)
**Assignee**: @backend
**Description**:
```
Query Qdrant with vector similarity + payload filtering.

Acceptance Criteria:
✅ Function: hybridRetrieve(query: string, limit: 10) → Promise<KnowledgeEntry[]>
✅ Embed query using OpenRouter/Ollama
✅ Search Qdrant: vector similarity + entity/type/about filters
✅ Fallback to keyword retrieval if Qdrant unavailable
✅ Error handling: network, timeout, missing collection
✅ Tested with real queries

Files to create:
- server/memory/qdrant-retrieval.ts

Files to update:
- server/memory/fact-retrieval.ts (add Qdrant option)

Reference: ARCHITECTURE.md Layer 2 (Memory System) - Qdrant retrieval
```

---

### F.5.3: Composite re-ranking score (3 pts)
**Assignee**: @backend
**Description**:
```
Rank results by combined formula.

Acceptance Criteria:
✅ Formula: similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1
✅ Hard rules (type="rule") always included (top of results)
✅ Recency: boost recent entries, decay old ones
✅ Confidence: entries with confidence > 0.8 ranked higher
✅ Source: imported entries ranked higher than extracted
✅ Tested: ranking produces expected order

Files to update:
- server/memory/qdrant-retrieval.ts (add scoring)

Reference: ARCHITECTURE.md - "Composite re-ranking score"
```

---

### F.5.4: Migrate entries to Qdrant (2 pts)
**Assignee**: @backend
**Description**:
```
Load existing JSONL entries into Qdrant index.

Acceptance Criteria:
✅ Load data/memory/entries.jsonl
✅ Compute embeddings for each entry
✅ Create vectors with metadata (entity, type, confidence, source)
✅ Index in Qdrant collection "galatea-knowledge"
✅ Maintain JSONL as source of truth (Qdrant is index only)
✅ Migration script for existing data

Files to create/update:
- server/memory/qdrant-retrieval.ts (add migration)
- scripts/migrate-entries-to-qdrant.ts (optional CLI)

Reference: ARCHITECTURE.md - "Qdrant hybrid search"
```

---

### F.5.5: Hard rules budget reservation (2 pts)
**Assignee**: @backend
**Description**:
```
Ensure critical rules never dropped from context.

Acceptance Criteria:
✅ Rules (type="rule") identified and reserved
✅ Context assembler allocates fixed slots for rules
✅ Rules never truncated when budget exceeded
✅ Other entries dropped first if needed
✅ Hard rules always included in retrieval results

Files to update:
- server/memory/context-assembler.ts (add rule reservation)
- server/memory/fact-retrieval.ts (mark rules as always-include)

Reference: ARCHITECTURE.md Layer 2 - "Hard rules are always included"
```

---

### F.5.6: Qdrant fallback + logging (2 pts)
**Assignee**: @backend
**Description**:
```
Degrade gracefully if Qdrant unavailable.

Acceptance Criteria:
✅ If Qdrant unreachable, fall back to keyword retrieval
✅ Log degradation warning at startup
✅ Continue functioning with reduced recall
✅ OTEL event: {fallback: true, reason: "qdrant unavailable"}
✅ Retry Qdrant on next request (circuit breaker pattern)

Files to update:
- server/memory/qdrant-retrieval.ts (add fallback logic)
- server/memory/fact-retrieval.ts (handle fallback)

Reference: ARCHITECTURE.md - "Qdrant fallback + logging"
```

---

### F.5.7: Retrieval tests (unit + integration) (3 pts)
**Assignee**: @test
**Description**:
```
Test vector retrieval, filtering, and ranking.

Acceptance Criteria:
✅ Vector similarity: query close to entries returns high scores
✅ Entity filtering: query for entity X returns entries about X
✅ Type filtering: query for rules returns only type="rule"
✅ Composite ranking: scores ordered by formula
✅ Hard rules: always in top results
✅ Fallback: when Qdrant down, keyword retrieval works

Files to create:
- server/__tests__/qdrant-retrieval.test.ts

Run: pnpm test qdrant
```

---

### F.5.8: Load test with 500+ entries (2 pts)
**Assignee**: @perf
**Description**:
```
Performance validation at production scale.

Acceptance Criteria:
✅ Retrieval latency < 500ms for 500 entries (p95)
✅ Recall > 80% on gold standard queries
✅ No memory leaks or connection pool exhaustion
✅ Benchmarks logged for future optimization

Files to create:
- scripts/perf/load-test-retrieval.ts

Run: pnpm exec tsx scripts/perf/load-test-retrieval.ts
```

---

## F.6: Confabulation Guard (Post-Extraction Validation) (13 points)

### Overview
Catch LLM hallucinations before bad entries enter the knowledge store. Four validation heuristics + integration into extraction pipeline.

**Status**: 🔵 Planned (Week 2)
**Depends on**: Nothing (independent, integrates into existing pipeline)
**Blocks**: Nothing

---

### F.6.1: Implement entity validation heuristics (2 pts)
**Assignee**: @backend
**Description**:
```
Verify entities appear in source text or are known aliases.

Acceptance Criteria:
✅ For each entity in entry.entities[]
✅ Check if entity appears in entry.evidence (source text)
✅ Check if entity is known alias (from knowledge store)
✅ Flag entries with invented entities
✅ Heuristic: substring matching in evidence

Files to create:
- server/memory/confabulation-guard.ts (add validateEntities)

Reference: ARCHITECTURE.md - "Confabulation Guard" (Gap 13)
```

---

### F.6.2: Implement about.entity validation (2 pts)
**Assignee**: @backend
**Description**:
```
Verify about.entity references known person or "unknown".

Acceptance Criteria:
✅ about.entity must be known person from knowledge store OR "unknown"
✅ Invalid entries: flag or remove about field
✅ Heuristic: simple entity name matching

Files to update:
- server/memory/confabulation-guard.ts (add validateAbout)

Reference: ARCHITECTURE.md - KnowledgeEntry type (about field)
```

---

### F.6.3: Implement confidence distribution check (2 pts)
**Assignee**: @backend
**Description**:
```
Flag uniform 1.0 confidence (sign of overconfidence).

Acceptance Criteria:
✅ Check if all entries have confidence 1.0
✅ Flag or suggest downward adjustment
✅ Heuristic: check distribution (should vary based on source)
✅ Extracted entries: suggest 0.8 if inferred
✅ Imported entries: okay with 1.0

Files to update:
- server/memory/confabulation-guard.ts (add validateConfidence)

Reference: ARCHITECTURE.md - KnowledgeEntry confidence field
```

---

### F.6.4: Implement type distribution check (1 pt)
**Assignee**: @backend
**Description**:
```
Warn if all extracted entries are same type.

Acceptance Criteria:
✅ Check type distribution: fact | preference | rule | procedure | correction | decision
✅ Warn if > 80% of batch same type
✅ Suggest type diversity review

Files to update:
- server/memory/confabulation-guard.ts (add validateTypeDistribution)

Reference: ARCHITECTURE.md - KnowledgeEntry type field
```

---

### F.6.5: Integrate into extraction pipeline (2 pts)
**Assignee**: @backend
**Description**:
```
Guard runs after Knowledge Extractor, before Dedup.

Acceptance Criteria:
✅ Pipeline: Extractor → Guard → Dedup → Store
✅ Guard validates entries, flags/removes bad ones
✅ Logged: which entries failed validation
✅ Continue gracefully (don't crash on bad entry)
✅ OTEL event: {entries_total, entries_valid, entries_flagged}

Files to update:
- server/memory/extraction-pipeline.ts (add guard step)

Reference: ARCHITECTURE.md Layer 4 (Learning Pipelines) - Shadow Learning Pipeline
```

---

### F.6.6: Guard unit tests (2 pts)
**Assignee**: @test
**Description**:
```
Test each validation function independently.

Acceptance Criteria:
✅ Valid extraction passes unchanged
✅ Hallucinated entity flagged
✅ Unknown about.entity removed or flagged
✅ Uniform confidence distribution detected
✅ Type distribution warnings triggered

Files to create:
- server/__tests__/confabulation-guard.test.ts

Run: pnpm test confabulation
```

---

### F.6.7: Integration test: Pipeline with guard (2 pts)
**Assignee**: @test
**Description**:
```
End-to-end extraction with guard validation.

Acceptance Criteria:
✅ Extract from real transcript
✅ Guard validates each entry
✅ Bad entries removed before storage
✅ Good entries stored in knowledge.jsonl
✅ OTEL logs show validation summary

Files to update:
- server/__tests__/confabulation-guard.test.ts (add integration test)
- Or: server/__tests__/extraction-pipeline.test.ts (add guard validation step)

Run: pnpm test extraction or pnpm test confabulation
```

---

## F.7: Token Budget Upgrade (12K + Per-Section Accounting) (11 points)

### Overview
Increase LLM context budget from 4K to 12K tokens. Add per-section accounting for transparency and debugging.

**Status**: 🔵 Planned (Week 2)
**Depends on**: Nothing (independent)
**Blocks**: Nothing

---

### F.7.1: Upgrade token budget to 12K (1 pt)
**Assignee**: @backend
**Description**:
```
Update config and context assembler for new budget.

Acceptance Criteria:
✅ Config: context.maxTokens = 12000
✅ Context assembler respects new limit
✅ No sections truncated unnecessarily

Files to update:
- server/engine/config.yaml (set max_tokens: 12000)
- server/memory/context-assembler.ts (check limits)

Reference: ARCHITECTURE.md - "Token budget: 12K tokens"
```

---

### F.7.2: Implement per-section token accounting (3 pts)
**Assignee**: @backend
**Description**:
```
Track tokens used by each section: identity, rules, guidance, operational, history, tools, knowledge.

Acceptance Criteria:
✅ After assembling context, calculate tokens per section
✅ Log breakdown: {section, tokens, percentage_of_budget}
✅ Format: Human-readable summary in logs
✅ OTEL event with detailed accounting
✅ Identifies which section uses most tokens

Files to update:
- server/memory/context-assembler.ts (add accounting)

Reference: ARCHITECTURE.md Layer 3 - "Token budget accounting"
```

---

### F.7.3: Truncation priority (non-truncatable sections) (2 pts)
**Assignee**: @backend
**Description**:
```
Protect essential sections from truncation.

Acceptance Criteria:
✅ Never truncate: Identity + Rules + Guidance
✅ Truncate first: Knowledge (lowest priority)
✅ Truncate if needed: Tools, History (lower priority)
✅ If budget exceeded, knowledge dropped cleanly

Files to update:
- server/memory/context-assembler.ts (add priority logic)

Reference: ARCHITECTURE.md - "Truncation priority"
```

---

### F.7.4: Budget overage logging (2 pts)
**Assignee**: @backend
**Description**:
```
Warn when approaching or exceeding budget.

Acceptance Criteria:
✅ Log warning if > 90% of budget used
✅ Log error if budget exceeded
✅ Per-section breakdown in warning
✅ Suggests which section to trim
✅ OTEL event for monitoring

Files to update:
- server/memory/context-assembler.ts (add warnings)

Reference: ARCHITECTURE.md - "Budget overage logging"
```

---

### F.7.5: Context assembler tests (budgets) (2 pts)
**Assignee**: @test
**Description**:
```
Test budget enforcement and truncation logic.

Acceptance Criteria:
✅ Sections fit within budget (12K)
✅ Knowledge truncated correctly when budget exceeded
✅ Non-truncatable sections preserved
✅ Accounting accurate (tokens match actual context)
✅ Warnings triggered at 90% threshold

Files to create:
- server/__tests__/token-budget.test.ts

Run: pnpm test token
```

---

### F.7.6: Manual verification: Prompt size tracking (1 pt)
**Assignee**: @manual
**Description**:
```
Verify actual token usage in live system.

Acceptance Criteria:
✅ Send message to agent → check logs
✅ Verify per-section token accounting
✅ Identify budget bottlenecks
✅ All sections fit in 12K

Steps:
1. Enable debug logging: LOG_LEVEL=debug
2. Send a chat message
3. Tail logs for token accounting
4. Verify breakdown shows expected distribution
```

---

## F.8: Safety Model Design (Pre-Implementation) (14 points)

### Overview
Design the 4-layer safety model before Phase G (tool execution). Documentation + architecture, not implementation.

**Status**: 🔵 Planned (Week 2)
**Depends on**: Nothing (design-only)
**Blocks**: Phase G start (needs approval)

---

### F.8.1: Document Layer 0 (LLM built-in guardrails) (2 pts)
**Assignee**: @docs
**Description**:
```
Explain leverage of Claude's native safety.

Acceptance Criteria:
✅ Design doc explains why Layer 0 exists (free, already there)
✅ What it covers: harmful content, basic injection resistance
✅ What it doesn't: domain-specific safety (our git branches, our trust model)
✅ No custom implementation needed

Files to create:
- docs/plans/safety-model.md (F.8.1 section)

Reference: ARCHITECTURE.md Layer 3 Safety - "Layer 0: LLM Guardrails"
```

---

### F.8.2: Document Layer 0.5 (Local guardrail model) (2 pts)
**Assignee**: @docs
**Description**:
```
Design specialized safety classifier on Ollama.

Acceptance Criteria:
✅ Configures which Ollama model (llama-guard, shieldgemma, etc.)
✅ Deployment: runs locally on Ollama, ~50ms latency
✅ Classification: input/output safe/unsafe + category
✅ Why separate: independent weights, catches edge cases
✅ Integration point: pre-LLM inbound, pre-execution outbound

Files to update:
- docs/plans/safety-model.md (F.8.2 section)

Reference: ARCHITECTURE.md - "Layer 0.5: Local Guardrail Model"
```

---

### F.8.3: Document Layer 1 (Homeostasis self_preservation) (2 pts)
**Assignee**: @docs
**Description**:
```
Explain 7th dimension as soft safety barrier.

Acceptance Criteria:
✅ self_preservation dimension definition
✅ What triggers LOW: destructive tools, hard rule conflicts, trust violations, injection patterns
✅ How it interacts: multi-dimension resistance (multiple dims LOW = very strong resistance)
✅ L1 heuristics: tool risk level, hard rule conflict, trust check, injection patterns
✅ Examples: "delete all files" triggers 4 dimensions LOW

Files to update:
- docs/plans/safety-model.md (F.8.3 section)

Reference: ARCHITECTURE.md - Dimension 7 (Self-Preservation) full section
```

---

### F.8.4: Document Layer 2 (Hard guardrails) (2 pts)
**Assignee**: @docs
**Description**:
```
Define deterministic, unjailbreakable constraints.

Acceptance Criteria:
✅ Tool risk classification: read | write | destructive
✅ Hard blocks: rm -rf, DROP TABLE, force push, chmod 777, .env commits
✅ Workspace boundaries: cannot access files outside workspace
✅ Branch protection: cannot push to main/master
✅ Trust insufficient: lower trust = read-only
✅ Pre-LLM check: blocks executed before LLM sees request

Files to update:
- docs/plans/safety-model.md (F.8.4 section)

Reference: ARCHITECTURE.md - "Layer 2: Hard Guardrails"
```

---

### F.8.5: Define trust matrix (2 pts)
**Assignee**: @docs
**Description**:
```
Channel × Identity grid for permission checking.

Acceptance Criteria:
✅ Channels: Dashboard, Discord, GitLab, Unknown
✅ Identities: Admin/PM, Known Developer, Known User, Unknown
✅ Trust levels: FULL, HIGH, MEDIUM, LOW, NONE
✅ Combined: effective trust = min(channel, identity)
✅ Examples: Known PM on unknown webhook = LOW
✅ Map to tool actions: trust level → allowed operations

Files to update:
- docs/plans/safety-model.md (F.8.5 section - trust matrix table)

Reference: ARCHITECTURE.md - "Trust Matrix: Channel + Identity"
```

---

### F.8.6: Define tool risk metadata schema (1 pt)
**Assignee**: @docs
**Description**:
```
Every tool declares its risk profile.

Acceptance Criteria:
✅ Tool schema: name, risk (read|write|destructive), allowlist/blocklist
✅ Examples: file_read (read), git_push (write), rm_rf (destructive)
✅ Safety check uses this metadata
✅ Clear in tool registry

Files to update:
- docs/plans/safety-model.md (F.8.6 section - tool risk schema)

Reference: ARCHITECTURE.md Layer 5 (Tools) - tool risk metadata
```

---

### F.8.7: Document hook integration for Phase G (2 pts)
**Assignee**: @docs
**Description**:
```
How Phase G implements safety checks.

Acceptance Criteria:
✅ PreToolUse hook signature: (toolName, args) → {allowed, reason}
✅ PostToolUse hook signature: (toolName, result) → {valid, reason}
✅ Integration point: CodingToolAdapter calls hooks
✅ Flow: request → hard block check → LLM → PreToolUse → execute → PostToolUse
✅ Clear hook implementation template

Files to create/update:
- docs/plans/safety-model.md (F.8.7 section)
- Or: docs/plans/phase-g-design.md (reference from here)

Reference: ARCHITECTURE.md - 3-layer safety flow diagram
```

---

### F.8.8: Review + approval of safety design (1 pt)
**Assignee**: @PM
**Description**:
```
PM/team signs off on 4-layer model before Phase G starts.

Acceptance Criteria:
✅ Safety model doc complete (F.8.1 through F.8.7)
✅ Team reviews design (async or sync meeting)
✅ Approved by PM + tech lead
✅ No scope creep in Phase G
✅ Document marked "APPROVED" with reviewer signatures

Files to create:
- docs/plans/safety-model.md (final, approved version)

Approval Gate: F.8.8 DONE = Phase G can start
```

---

## Testing & Validation Checkpoints

### Daily (EOD)
- [ ] `pnpm test` — Phase E tests still green (163 tests)
- [ ] No regressions in existing functionality

### Per Deliverable (Before PR)
- [ ] F.1: Discord round-trip verified manually
- [ ] F.2: Stub tool iteration verified (mock echo tool)
- [ ] F.3: Operational memory persists across restart
- [ ] F.4: Homeostasis dimensions use operational context
- [ ] F.5: Retrieval latency < 500ms with 500 entries
- [ ] F.6: Confabulation guard catches hallucinations
- [ ] F.7: Per-section token accounting logged
- [ ] F.8: Safety design reviewed by PM + tech lead

### Sprint End
- [ ] All 8 PRs merged to main
- [ ] All Phase E tests still green
- [ ] Sprint demo: E2E message flow (Discord → tick → Discord)
- [ ] Sprint demo: Heartbeat continues in-progress work
- [ ] Safety design approved + ready for Phase G

---

## Quick Reference: Story Points by Week

| Phase | Total | Week 1 | Week 2 |
|-------|-------|--------|--------|
| F.1 | 16 | 16 | — |
| F.2 | 24 | 24 | — |
| F.3 | 20 | 9 | 11 |
| F.4 | 13 | — | 13 |
| F.5 | 19 | — | 19 |
| F.6 | 13 | — | 13 |
| F.7 | 11 | — | 11 |
| F.8 | 14 | — | 14 |
| **TOTAL** | **130** | **49** | **81** |

**Capacity**: 49 points Week 1 (critical path), 81 points Week 2 (if Week 1 on track)

---

## How to Create Issues in GitLab

### Option 1: Manual Creation
1. Open GitLab project
2. Issues → New Issue
3. Title: "F.1.1: Define ChannelMessage type (2 pts)"
4. Description: Copy from relevant section above
5. Labels: `sprint::12`, `phase::f` + specific label for each deliverable
6. Milestone: Sprint 12

### Option 2: Using glab CLI (once git config fixed)
```bash
glab issue create \
  -t "F.1.1: Define ChannelMessage type (2 pts)" \
  -d "$(cat description.md)" \
  -l sprint::12 -l phase::f \
  -m "Sprint 12"
```

### Option 3: Bulk Import
Create CSV with columns: title, description, labels, milestone
Import via Settings → Integrations → CSV

---

## Notes for Team

- **Phase F** is foundational. Phase G (Work Execution) cannot start until F is complete.
- **No tool execution yet** — F.2 scaffolds structure but only stub tools exist. Real tools come in Phase G.
- **Qdrant** remains disabled in F.5 until tested (fallback to keyword retrieval automatic).
- **Safety design** (F.8) is docs + architecture, not implementation. Implementation in Phase G.
- **Single-agent** throughout. Multi-agent interfaces designed but not instantiated (Phase H).

---

*Created: 2026-03-14*
*For Team*: Use this as template for GitLab issue creation
*Reference*: docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md (detailed spec)
