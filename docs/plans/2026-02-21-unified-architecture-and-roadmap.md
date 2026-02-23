# Galatea Unified Architecture & Roadmap

**Date**: 2026-02-21
**Status**: Draft v2 — rewritten after independent review
**Context**: Synthesizes Psychological Architecture, current implementation (Phase A-E), KNOWN_GAPS, Reference Scenarios, OpenClaw research, and a 3-agent adversarial review into a unified vision and build plan.

---

## Where We Are

### Implemented (Phases A-E)

| Capability | Status | Quality |
|-----------|--------|---------|
| Shadow learning pipeline (extract from transcripts) | Done | 57% accuracy (gemma3:12b, v3 prompt) |
| Knowledge store (JSONL, typed entries, entities, about) | Done | 192 entries from 3 sessions |
| Homeostasis engine (6 dimensions, L0-L2) | Done | L1 heuristics + L2 LLM assessment |
| Fact retrieval (entity + keyword matching) | Done | Works for ~200 entries |
| Tick loop (self-model → homeostasis → channels → action) | Done | Single-message, single-LLM-call, no tools |
| Context assembler (knowledge + guidance → system prompt) | Done | 4K token budget, char-based estimation |
| Memory lifecycle (decay, archival, consolidation to CLAUDE.md) | Done | Ebbinghaus-style, rule exemptions |
| Context compression (sliding window) | Done | Keeps first + newest messages |
| Command center (6 API endpoints, 5 dashboard views) | Done | Status, knowledge, trace, config, chat |
| Discord connector (inbound/outbound) | Done | Not wired to server lifecycle |
| OTEL event emission | Done | Chat + extraction events |
| Claude Code provider (CLI auth) | Done | No fake API key needed |
| Heartbeat scheduler | Done | Configurable, idle-skip |
| Extraction eval infrastructure | Done | Gold-standard 52 items, Langfuse |

### Honest Assessment of Current Limitations

The tick loop is a **request-response handler pretending to be an agent loop**:

- Processes **one message**, calls the LLM **once**, returns **text**
- **No conversation history** between ticks — each tick sees a single message
- **No tool execution** infrastructure — `generateText()` has no tools parameter
- **No outbound delivery** — tick returns JSON but nothing sends it to any channel
- **4K token budget** already tight before adding operational memory or tool schemas
- Chat UI and tick loop are **completely separate code paths** that don't interact
- `PendingMessage` carries only `{from, channel, content, receivedAt}` — too thin for routing

These are not bugs. They were fine for Phases A-E (shadow learning, knowledge extraction, homeostasis assessment). But they are **structural blockers for work execution**.

### Open Gaps

| # | Gap | Severity |
|---|-----|----------|
| 11 | **Session model unclear** — no definition of session boundaries | High |
| 12 | **Work execution model missing** — agent can't do things, only talk | Critical |
| 13 | **LLM hallucination** — local models need strict prompts + validation | High |
| 14 | **Tick loop is not an agent loop** — no tools, no history, no multi-step | Critical |
| 15 | **No channel abstraction** — no outbound delivery, no unified message routing | High |
| 16 | **Extraction blind to agent actions** — pipeline reads chat, not tool outputs | High |

### What Reference Scenarios Demand — Full Audit

| Scenario | What's Missing | Severity |
|----------|---------------|----------|
| Phase 1: Shadow Learning | Episodic memory (temporal sequences), clarifying questions (Trace 2) | Medium |
| Phase 2: Export Persona | No export mechanism, no privacy filtering, no skill proficiency scores | Medium |
| Phase 3: Company Deploy | No multi-agent instantiation, no shared/private memory partition | Medium |
| Phase 4: Multi-Agent Work | No work execution, no task routing from Discord mentions | Critical |
| Trace 2: Clarifying Questions | No learning_confidence metric, no interpretation candidates, no UI | Medium |
| Trace 4: Execute Task | No tools, no multi-step work, no outbound message dispatch | Critical |
| Trace 5: Handle Feedback | No GitLab integration, no webhook→operational memory flow, no self-observation | Critical |
| Trace 6: Unknown Situation | No web search tool (agent can't "research briefly") | High |
| Trace 7: Idle Agent | No communication cooldown (HIGH state), no cross-agent MR discovery | High |
| Trace 8: Guardrail | No time-per-phase tracking (can't detect "researching for 2 hours") | High |
| Memory Scenario 7: Promotion | No episode counting, no promotion triggers, no observation→fact chain | Medium |
| Memory Scenario 8: Cognitive Models | No self-model updates from mistakes, no evidence_for/against on theories | Medium |
| Memory Scenario 10: Token Budget | No composite ranking score (similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1) | High |
| Memory Scenario 12: Daily Rituals | No scheduled interactions, no temporal facts with valid_until | Low |
| Memory Scenario 13: Procedures | No success_rate tracking, no procedure step updates from failures | Medium |

---

## The Insight: Brain + Hands + Runtime

Goertzel's critique of OpenClaw: "Amazing hands for a brain that doesn't yet exist."

Galatea's situation is the inverse: **We have the brain (homeostasis + memory + models) but not the hands (work execution).**

But the deeper insight from three failed phase transitions: **You can't bolt hands onto a brain that was built to think in single turns.** The tick loop, context assembler, and channel system all assume one-shot request-response. Adding operational memory on top of this foundation doesn't fix the structural problem — it papers over it.

The unified architecture needs three things, but they must be built **bottom-up**, not layered on:

```
┌───────────────────────────────────────────────────────────────────┐
│                      GALATEA UNIFIED                              │
│                                                                   │
│  ┌─────────────┐   ┌──────────────────┐   ┌───────────────────┐ │
│  │   BRAIN     │   │   RUNTIME        │   │   HANDS           │ │
│  │             │   │                  │   │                   │ │
│  │ Homeostasis │◄─►│ Agent Loop       │──►│ Tool Execution    │ │
│  │ 6 dimensions│   │ - Multi-turn     │   │ MCP tools         │ │
│  │ L0-L2       │   │ - Tool calls     │   │ File/Git/Shell    │ │
│  │             │   │ - History        │   │ Web search        │ │
│  │ Long-term   │   │ - Work arcs      │   │                   │ │
│  │ Memory      │◄─►│ Operational Mem  │   │ Channel Dispatch  │ │
│  │ entries.jsonl│   │ - Task state     │──►│ Discord/GitLab    │ │
│  │             │   │ - Phase tracking │   │ Dashboard         │ │
│  │ Qdrant      │   │ - Conversation   │   │                   │ │
│  │ (retrieval) │   │   history        │   │ Safety Layer      │ │
│  └─────────────┘   └──────────────────┘   │ Pre/post filters  │ │
│                                           └───────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

The **Runtime** is the new foundational layer. It replaces the current tick loop with an actual agent loop that supports multi-turn execution, tool calling, conversation history, and outbound message dispatch. This must exist before work execution (Phase G) can begin.

---

## Unified Architecture

### Three Memory Tiers

| Tier | Purpose | Storage | Lifecycle |
|------|---------|---------|-----------|
| **Long-term** (semantic) | What the agent knows | `entries.jsonl` + Qdrant index | Extract → dedup → decay → archive → consolidate |
| **Operational** (working) | What the agent is doing | `agent-context.jsonl` | Load at tick → update per step → persist across sessions |
| **Episodic** (session) | What happened | Session transcripts + work logs | Accumulate → extract → reference |

#### Long-term Memory (exists, extend)

The current `KnowledgeEntry` system with 6 types, confidence, entities, about field, supersession, decay.

**Extension needed:** Composite retrieval ranking. Memory Scenario 10 specifies:
```
score = similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1
```

Qdrant provides vector similarity; recency, confidence, and source weighting are computed as a re-ranking step after vector search. Hard rules are always included (budget reserved, never dropped).

#### Operational Memory (new)

The missing layer. A structured scratchpad that tracks current work and persists across sessions.

```typescript
interface OperationalContext {
  // What am I working on?
  tasks: TaskState[]

  // What phase am I in?
  workPhase: "idle" | "exploring" | "deciding" | "implementing" | "verifying" | "blocked"

  // What do I need to do next?
  nextActions: string[]

  // What's blocking me?
  blockers: string[]

  // Cross-session continuity
  carryover: string[]

  // Conversation history (persisted across ticks)
  recentHistory: { role: "user" | "assistant"; content: string; timestamp: string }[]

  // Time tracking per phase (for Trace 8 guardrails)
  phaseEnteredAt: string

  // Last outbound message time (for Trace 7 communication cooldown)
  lastOutboundAt: string

  // Updated at end of each tick
  lastUpdated: string
}

interface TaskState {
  id: string
  description: string
  source: ChannelMessage          // Full routing info for responses
  status: "assigned" | "in_progress" | "blocked" | "done"
  phase: "exploring" | "deciding" | "implementing" | "verifying"
  progress: string[]              // What I've done so far
  artifacts: string[]             // Files created/modified, MRs, etc.
  phaseStartedAt: string          // When current phase began
  toolCallCount: number           // How many tool calls in this task
}
```

**How it connects to homeostasis:**
- `productive_engagement` reads `tasks` — has work? → HEALTHY
- `progress_momentum` reads `phaseEnteredAt` — stuck in same phase too long? → LOW
- `knowledge_sufficiency` reads `tasks[].description` for retrieval queries
- `communication_health` reads `lastOutboundAt` — just messaged? → HIGH (cooldown). Long silence? → LOW
- `knowledge_application` reads phase duration — researching too long? → HIGH ("time to apply")
- `self_preservation` reads tool risk level + trust matrix + hard rule conflicts — about to do something destructive? → LOW

#### Episodic Memory (partially exists, extend)

Session transcripts exist but the extraction pipeline is **blind to agent actions**. Two problems:

1. **Pipeline reads chat text, not tool outputs.** When the agent creates files, runs commands, commits code — none of this enters the knowledge store.
2. **Completed tasks evaporate.** Once `TaskState.status = "done"`, the progress and artifacts are only in operational memory. If operational memory is cleaned up, the knowledge is lost.

**Fix:** When a task transitions to "done", convert its `progress[]` and `artifacts[]` to KnowledgeEntries directly. This is structured data — no LLM needed:

```typescript
// Task completion → knowledge entries
function taskToKnowledge(task: TaskState): KnowledgeEntry[] {
  return [
    {
      type: "fact",
      content: `Completed: ${task.description}. Artifacts: ${task.artifacts.join(", ")}`,
      confidence: 1.0,
      source: `task:${task.id}`,
      entities: extractEntitiesFromArtifacts(task.artifacts),
    },
    // If task had notable progress steps, create procedure entry
    ...(task.progress.length >= 3 ? [{
      type: "procedure" as const,
      content: task.progress.join("\n"),
      confidence: 0.7,
      source: `task:${task.id}`,
    }] : []),
  ]
}
```

### Channel Abstraction (new — foundational)

The current system has no unified message handling. Chat UI streams directly, tick returns JSON to nobody, Discord connector isn't wired. This must be fixed before any scenario involving the agent communicating works.

```typescript
interface ChannelMessage {
  id: string
  channel: "discord" | "dashboard" | "gitlab" | "internal"
  direction: "inbound" | "outbound"

  // Routing metadata for round-trip delivery
  routing: {
    threadId?: string           // Discord thread, GitLab MR discussion
    replyToId?: string          // Message being replied to
    mentionedAgents?: string[]  // @Agent-Dev-1 parsing
    projectId?: string          // GitLab project
    mrId?: string               // GitLab MR number
  }

  from: string
  content: string
  messageType: "chat" | "task_assignment" | "review_comment" | "status_update"
  receivedAt: string
  metadata: Record<string, unknown>
}
```

**Inbound flow:** Channel adapter → normalize to `ChannelMessage` → add to pending queue
**Outbound flow:** Tick produces `ChannelMessage` → dispatcher routes to correct channel adapter → delivery confirmation

The channel abstraction replaces the current `PendingMessage` type. Each channel adapter (Discord, dashboard, GitLab) converts to/from `ChannelMessage`.

### Agent Loop (new — replaces tick loop)

The current tick processes one message, calls the LLM once, returns text. This is replaced with an actual agent loop that supports multi-turn tool execution:

```
Agent Loop (per tick):
┌─────────────────────────────────────────────────────────┐
│ 1. Load operational context                              │
│ 2. Check for pending work:                               │
│    - New inbound messages? → Process highest priority     │
│    - In-progress task? → Continue work arc                │
│    - Nothing? → Idle assessment                           │
│ 3. Assemble context (knowledge + operational + history)   │
│ 4. INNER LOOP (ReAct pattern, max N steps):              │
│    ┌──────────────────────────────────────────────┐      │
│    │ a. Call LLM with tools                        │      │
│    │ b. If LLM returns text → break (final answer) │      │
│    │ c. If LLM returns tool_call:                  │      │
│    │    - Safety check (pre-filter)                │      │
│    │    - Execute tool                             │      │
│    │    - Safety check (post-filter)               │      │
│    │    - Feed result back to LLM                  │      │
│    │    - Update operational context               │      │
│    │ d. Budget check (max steps, max tokens, timeout)│    │
│    └──────────────────────────────────────────────┘      │
│ 5. Dispatch response via channel abstraction              │
│ 6. Save operational context                               │
│ 7. If task completed → generate knowledge entries          │
└─────────────────────────────────────────────────────────┘
```

**Key design decisions:**

| Decision | Choice | Why |
|----------|--------|-----|
| One tick = one step or many? | **Inner loop with budget** — up to N tool calls per tick | One-tool-per-tick at 30s heartbeat = 5+ minutes for simple task. Too slow. |
| Heartbeat drives work? | **Yes** — heartbeat ticks check operational memory for in-progress tasks | Without this, multi-step arcs stall when no inbound message arrives |
| Conversation history? | **Last 5 exchanges persisted in operational context** | Agent needs memory across ticks for coherent work arcs |
| Token budget? | **Raise to 12K**, add per-section accounting | 4K can't fit identity + knowledge + tools + history + operational context |
| Context updates mid-tick? | **No** — assembled once at tick start | Simplicity. If needed, add context refresh at step N/2. |

### Homeostasis (exists, extend)

The 6 dimensions are correct and validated. Extensions for operational memory:

| Dimension | Current Input | + Operational Memory |
|-----------|--------------|---------------------|
| knowledge_sufficiency | Retrieved facts vs query | + task context for better retrieval |
| progress_momentum | Repeated messages (Jaccard) | + `phaseEnteredAt` — stuck in "exploring" for 2h? |
| communication_health | Time since last inbound message | + `lastOutboundAt` — HIGH when just messaged (cooldown) |
| productive_engagement | Has messages / active task | + operational task list |
| certainty_alignment | L2 LLM assessment | + task phase (implementing with LOW certainty?) |
| knowledge_application | L2 LLM assessment | + phase duration (too much exploring vs implementing?) |

No new dimensions. The operational memory gives existing dimensions the data they need.

### Knowledge Lifecycle (exists, extend)

Current: Extract → Dedup → Retrieve → Decay → Archive → Consolidate

**Add: Confabulation Guard** (post-extraction validation)

Cheap heuristic checks on LLM extraction output:
- Entities in extraction must appear in source text (or be known aliases)
- `about.entity` must reference a known person or "unknown" (not invented names)
- Confidence shouldn't be uniformly 1.0 across all entries
- Type distribution check (not everything should be "fact")

**Add: Embedding-based retrieval** (upgrade from keyword matching)

1. Compute embeddings via Ollama (nomic-embed-text, already used for dedup)
2. Store in Qdrant (`galatea-knowledge` collection) — already running locally (`localhost:6333`)
3. Hybrid retrieval: Qdrant vector similarity + payload filtering (entity, type, about)
4. Re-rank with composite score: `similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1`
5. Hard rules always included (budget reserved, never dropped)

Why Qdrant over SQLite-vec: Qdrant is already running (2+ months), provides native hybrid search with payload filtering, REST API keeps integration simple.

**Add: Work-to-knowledge pipeline** (agent actions → knowledge store)

The extraction pipeline only reads transcripts. Agent actions during work execution must also produce knowledge:
- Task completion → fact + procedure entries (structured, no LLM)
- Tool outputs logged as events → available for future extraction
- Self-observations from mistakes (Trace 5: "I tend to miss null checks")

### Safety Model (new — must be designed before tools)

Four layers of defense, inspired by OpenClaw but adapted:

**Layer 0: LLM built-in guardrails** — Claude and frontier models ship with safety. We leverage, not rebuild.

**Layer 0.5: Local guardrail model (Ollama)** — A dedicated safety classifier (Llama Guard, ShieldGemma, or similar) running locally. Classifies inbound messages and outbound tool calls as safe/unsafe. Different model, different weights — independent from the frontier model's blind spots. ~50ms latency, fully local, no data leaves machine.

**Layer 1: Homeostasis (`self_preservation`)** — 7th dimension of self-regulation. Fires when actions violate the agent's sense of healthy functioning. Combined with the other 6 dimensions, creates emergent multi-dimensional resistance.

**Layer 2: Hard guardrails (deterministic)**

Tool risk classification:
```typescript
type ToolRisk = "read" | "write" | "destructive"

// read: file reads, searches, status checks — always allowed
// write: file writes, git commits, messages — allowed within workspace
// destructive: force push, delete branch, rm -rf — requires approval
```

Pre/post execution filters:
- Pre: Check tool name + args against allowlist/blocklist
- Pre: Reject prompt injection patterns in tool inputs
- Post: Validate tool output is within expected bounds
- Post: Log all tool invocations to audit trail (OTEL events)

Workspace boundaries:
- Agent operates within a designated workspace directory
- Git operations restricted to feature branches (never main/master)
- Shell commands restricted to safe set (build, test, lint — not curl, wget, rm -rf /)

The safety model design document must exist before tool implementation begins. Tool interfaces must carry risk metadata.

### Session Model (addresses Gap 11)

A session = a conversation in a channel. The operational memory handles cross-session continuity.

```
Session boundaries:
- Discord: Each DM thread or channel conversation
- Dashboard chat: Each browser session
- Extraction: Each Claude Code JSONL file
- GitLab: Each MR or issue thread
- Tick: Continuous (sessions don't bound ticks)
```

Session metadata stored in operational context, not in session definition.

---

## Revised Roadmap

### Phase E: Complete (current)

**Status**: ~95% done, manual verification in progress.

**Action**: Update ROADMAP.md to mark Phase E complete. Commit and merge.

### Phase F: Agent Runtime v2 (next — 2 weeks)

**Goal**: Replace the request-response tick loop with an actual agent runtime. The foundation that prevents restart #4.

**Principle**: Design for multi-agent, implement for single-agent. Use interfaces and IDs, avoid hardcoded singleton paths.

| # | Deliverable | Why | Scenarios Addressed |
|---|------------|-----|---------------------|
| F.1 | **Channel abstraction** — `ChannelMessage` type with routing metadata, inbound normalization, outbound dispatch to Discord + dashboard | Every scenario requires the agent to communicate. Without this, tick output goes nowhere. | Trace 4-8, Scenario 4.1-4.5 |
| F.2 | **Agent loop v2** — replace single-call tick with ReAct inner loop. Tool call scaffolding (empty tools, but infrastructure). Conversation history (last 5 exchanges in operational context). Budget controls (max steps, timeout). | Current tick can't do multi-step work. Must exist before Phase G. | Trace 4, 5, 8 |
| F.3 | **Operational memory** — `agent-context.jsonl` with TaskState, work phases, phase timestamps, cross-session carryover, conversation history | Agent needs to know what it's doing, track time per phase, persist across restarts | Trace 7, 8, Scenario 4.2 |
| F.4 | **Homeostasis wiring** — connect operational memory to all 6 dimensions. Add `lastOutboundAt` for communication cooldown. Add phase duration for guardrails. | Trace 7 needs communication HIGH state. Trace 8 needs time tracking. | Trace 7, 8 |
| F.5 | **Embedding retrieval** — Qdrant collection, hybrid vector + payload filtering, composite re-ranking score | Scale retrieval beyond 200 entries, improve recall for paraphrased queries | Memory Scenario 10 |
| F.6 | **Confabulation guards** — post-extraction validation heuristics | Gap 13: catch hallucinated entities and types | Memory Scenario 14, 15 |
| F.7 | **Token budget upgrade** — raise to 12K, per-section accounting, log what gets truncated | 4K can't fit identity + knowledge + tools + history + operational context | Memory Scenario 10 |
| F.8 | **Safety model design** — 4-layer model: Layer 0 (LLM built-in, leverage ecosystem), Layer 0.5 (local Ollama guardrail model — Llama Guard/ShieldGemma for input/output safety classification), Layer 1 (`self_preservation` dimension, 7th homeostasis dim), Layer 2 (hard guardrails: trust matrix, workspace boundaries, branch restrictions). Document trust levels, tool risk classification. | Must inform G.1 tool interface design. Safety is not a feature — it's a constraint on tool design. | Trace 4, 5 |

**What Phase F does NOT include:**
- Actual tool execution (Phase G — but the scaffolding is here)
- GitLab integration (Phase G)
- Multi-agent (Phase H — but interfaces designed for it)
- SKILL.md generation (deferred — not foundational)
- Export persona (deferred — requires stable architecture)
- Promotion pipeline (deferred — episodic memory can wait)

**Success criteria:**
- Agent loop can call stub tools (e.g., `echo` tool) and iterate
- Outbound messages actually arrive in Discord / dashboard
- Agent tracks task state across ticks (assign → in_progress → done)
- Heartbeat ticks continue in-progress work without new inbound messages
- Conversation history persists across ticks (agent remembers last 5 exchanges)
- Communication cooldown prevents spam (Trace 7: HIGH state blocks re-messaging)
- Phase duration tracking detects over-research (Trace 8: 2h in "exploring")
- Retrieval works for 500+ entries with >80% recall on gold-standard
- Confabulation guard catches >50% of hallucinated entities
- Operational context persists across server restarts
- Per-section token accounting visible in logs
- Safety design document reviewed and approved

**Validation approach:**
- Replay Traces 4-8 against the new runtime with stub tools
- Verify channel round-trip: Discord message → tick → Discord response
- Verify work arc: assign task → heartbeat drives progress → completion
- Load test with 500 synthetic entries in Qdrant

### Phase F Requirements (BDD-style)

#### F.1 Channel Abstraction

```gherkin
Feature: Channel message normalization
  All inbound messages from any channel are normalized to ChannelMessage
  and all outbound responses are dispatched back through the originating channel.

  Scenario: Discord message becomes ChannelMessage
    Given a Discord message "@galatea implement user profile" in #mobile-dev
    When the Discord adapter processes the message
    Then a ChannelMessage is created with channel="discord"
    And routing.mentionedAgents contains "galatea"
    And messageType is "task_assignment"
    And the message is added to the agent's pending queue

  Scenario: Dashboard chat becomes ChannelMessage
    Given a user types "What do you know about NativeWind?" in the dashboard chat
    When the dashboard adapter processes the message
    Then a ChannelMessage is created with channel="dashboard"
    And messageType is "chat"

  Scenario: Outbound dispatch to Discord
    Given the agent loop produces a ChannelMessage with channel="discord"
    And routing.threadId is "thread-123"
    When the dispatcher routes the message
    Then the message is sent to Discord thread "thread-123"
    And the ChannelMessage is logged to OTEL events

  Scenario: Outbound dispatch to dashboard
    Given the agent loop produces a ChannelMessage with channel="dashboard"
    When the dispatcher routes the message
    Then the message appears in the dashboard chat UI via SSE

  Scenario: Round-trip routing preserves context
    Given a Discord message arrives from "mary" in thread "sprint-42"
    When the agent processes and responds
    Then the response is dispatched to Discord thread "sprint-42"
    And the response references the original message ID
```

#### F.2 Agent Loop v2

```gherkin
Feature: ReAct agent loop with tool scaffolding
  The agent loop replaces the single-call tick with an inner loop
  that supports tool calls, conversation history, and budget controls.

  Scenario: Simple response (no tools)
    Given a pending message "How do you feel about TypeScript?"
    When the agent loop runs a tick
    Then the LLM is called with system prompt + message
    And the LLM returns a text response
    And the response is dispatched via the channel abstraction
    And operational context is saved

  Scenario: Tool call iteration (stub tool)
    Given a pending message "What files are in the project?"
    And an "echo" stub tool is registered
    When the agent loop runs a tick
    And the LLM returns a tool_call for "echo"
    Then the tool is executed
    And the result is fed back to the LLM
    And the LLM produces a final text response
    And operational context records the tool call

  Scenario: Budget limit stops inner loop
    Given an in-progress task requiring many tool calls
    And the budget is set to max 5 steps
    When the inner loop reaches step 5 without a text response
    Then the loop is forced to produce a text response
    And the operational context saves progress for continuation

  Scenario: Timeout stops inner loop
    Given an in-progress task
    And the timeout is set to 30 seconds
    When a tool call takes longer than 30 seconds
    Then the loop is terminated
    And the agent reports the timeout in its response
    And the task status remains "in_progress" for retry

  Scenario: Conversation history across ticks
    Given the agent responded "I'll create the profile screen" in tick N
    When tick N+1 runs for the same task
    Then the system prompt includes the previous exchange
    And the LLM has context of what was said before

  Scenario: History is bounded
    Given 10 exchanges have occurred across ticks
    When the agent loop assembles context
    Then only the last 5 exchanges are included in the system prompt
    And older exchanges are dropped (FIFO)
```

#### F.3 Operational Memory

```gherkin
Feature: Operational memory persists task state across ticks and restarts
  The agent tracks what it's working on, what phase it's in,
  and what happened recently. This persists across ticks and server restarts.

  Scenario: Task assignment creates TaskState
    Given a ChannelMessage with messageType="task_assignment"
    And content "Implement user profile screen"
    When the agent processes the message
    Then a TaskState is created with status="assigned"
    And source contains the original ChannelMessage routing
    And the task appears in operational context

  Scenario: Task progresses through phases
    Given a task with status="in_progress" and phase="exploring"
    When the agent decides it has enough knowledge
    Then the task phase changes to "deciding"
    And phaseStartedAt is updated to now

  Scenario: Heartbeat continues in-progress work
    Given a task with status="in_progress"
    And no new inbound messages
    When a heartbeat tick fires
    Then the agent loop picks up the in-progress task
    And continues the work arc from where it left off

  Scenario: Operational context persists across server restart
    Given a task with status="in_progress" and progress=["created file", "ran tests"]
    When the server restarts
    And the next tick fires
    Then the task is loaded from agent-context.jsonl
    And status is still "in_progress"
    And progress contains ["created file", "ran tests"]
    And carryover notes are available

  Scenario: Multiple tasks tracked simultaneously
    Given task-1 with status="in_progress" and task-2 with status="assigned"
    When the agent loop runs
    Then it processes task-1 first (in_progress > assigned priority)
    And task-2 remains in the queue

  Scenario: Completed task populates carryover
    Given a task with status transitions to "done"
    When operational context is saved
    Then carryover contains a summary of the completed task
    And the summary is available in the next session
```

#### F.4 Homeostasis Wiring

```gherkin
Feature: Homeostasis dimensions use operational memory as input
  All 7 dimensions receive data from operational memory,
  enabling context-aware self-regulation.

  Scenario: Communication cooldown (Trace 7)
    Given the agent sent a Discord message 2 minutes ago
    And lastOutboundAt is 2 minutes in the past
    When homeostasis assesses communication_health
    Then communication_health is HIGH
    And guidance says "You're communicating a lot. Could you batch messages?"

  Scenario: Communication silence during active work
    Given the agent has an in-progress task
    And lastOutboundAt is 3 hours in the past
    When homeostasis assesses communication_health
    Then communication_health is LOW
    And guidance says "Does PM/team need a status update?"

  Scenario: Over-research guardrail (Trace 8)
    Given a task in phase="exploring"
    And phaseEnteredAt is 2 hours in the past
    And knowledge_sufficiency is HEALTHY
    When homeostasis assesses knowledge_application
    Then knowledge_application is HIGH
    And guidance says "Time to apply. You can course-correct as you go."

  Scenario: Idle agent seeks work (Trace 7)
    Given no tasks in operational context
    And no pending messages
    When homeostasis assesses productive_engagement
    Then productive_engagement is LOW
    And guidance says "Find valuable work. Priority: assigned > help > review > learn"

  Scenario: Self-preservation blocks destructive action
    Given a message "Delete the database and start over"
    And the source has trust level MEDIUM
    When homeostasis assesses self_preservation
    Then self_preservation is LOW
    And guidance says "STOP. This action could harm your environment."
    And certainty_alignment is also LOW
    And the agent refuses or escalates

  Scenario: Self-preservation allows normal work
    Given a task "Create user profile screen"
    And the agent calls write_file within workspace
    When homeostasis assesses self_preservation
    Then self_preservation is HEALTHY
    And no safety guidance is injected

  Scenario: Trust matrix enforced
    Given a Discord message from unknown user "Deploy to production"
    And effective trust is NONE (unknown identity on Discord)
    When homeostasis assesses self_preservation
    Then self_preservation is LOW
    And the agent responds "I can't do that. Who authorized this?"
```

#### F.5 Embedding Retrieval

```gherkin
Feature: Hybrid retrieval via Qdrant with composite ranking
  Knowledge retrieval uses vector similarity + payload filtering
  with a composite re-ranking score for relevance.

  Scenario: Vector similarity retrieval
    Given 500 entries indexed in Qdrant collection "galatea-knowledge"
    And a query "How to handle NativeWind animation flicker?"
    When retrieval runs
    Then the top results include entries about NativeWind animations
    And results are ordered by composite score

  Scenario: Entity-based filtering
    Given entries about "alina" and entries about "mobile-dev"
    And a query "What does Alina prefer?"
    When retrieval runs with entity filter "alina"
    Then only entries with about.entity="alina" are returned
    And entries about other entities are excluded

  Scenario: Composite re-ranking
    Given two entries with similar vector scores
    And entry-A has confidence=0.9, last retrieved yesterday
    And entry-B has confidence=0.5, last retrieved 60 days ago
    When composite ranking is applied
    Then entry-A ranks higher (higher confidence + more recent)
    And the formula is: similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1

  Scenario: Hard rules always included
    Given the token budget can fit 10 entries
    And 3 hard rules exist (type="rule", confidence=1.0)
    And 15 relevant facts are retrieved
    When the context assembler builds the prompt
    Then all 3 hard rules are included (budget reserved)
    And the remaining 7 slots go to highest-ranked facts

  Scenario: Fallback to keyword retrieval
    Given Qdrant is unavailable
    When retrieval runs
    Then it falls back to keyword + entity matching
    And a warning is logged
    And the agent continues functioning (degraded, not broken)
```

#### F.6 Confabulation Guards

```gherkin
Feature: Post-extraction validation catches hallucinated content
  After LLM extraction, heuristic checks validate the output
  before entries are stored.

  Scenario: Hallucinated entity rejected
    Given a transcript mentioning "Alice" and "PostgreSQL"
    When extraction produces an entry with entity "Bob"
    And "Bob" does not appear in the source text
    Then the entry is flagged as potential hallucination
    And the entity "Bob" is removed or the entry is dropped

  Scenario: Invented about.entity rejected
    Given known people are ["alina", "paul", "mary"]
    When extraction produces about.entity="jennifer"
    And "jennifer" does not appear in the source text
    Then the about field is removed (entry kept, about cleared)

  Scenario: Uniform confidence detected
    Given extraction produces 8 entries
    And all 8 have confidence=1.0
    When the confabulation guard checks distribution
    Then a warning is logged: "Uniform confidence 1.0 — likely hallucination"
    And confidences are adjusted downward (e.g., inferred entries → 0.7)

  Scenario: Type distribution check
    Given extraction produces 10 entries
    And all 10 have type="fact"
    When the confabulation guard checks distribution
    Then a warning is logged: "All entries are type=fact — may be misclassified"

  Scenario: Valid extraction passes unchanged
    Given extraction produces entries with entities matching source text
    And about.entity references known people
    And confidence varies between 0.5 and 0.95
    When the confabulation guard runs
    Then all entries pass validation unchanged
```

#### F.7 Token Budget Upgrade

```gherkin
Feature: 12K token budget with per-section accounting
  The context assembler manages a larger budget with visibility
  into how tokens are allocated across sections.

  Scenario: Sections fit within 12K budget
    Given identity preprompts use 800 tokens
    And hard rules use 400 tokens
    And homeostasis guidance uses 200 tokens
    And operational context uses 600 tokens
    And conversation history uses 1000 tokens
    And tool definitions use 1500 tokens
    And retrieved knowledge uses 3000 tokens
    When the context assembler builds the prompt
    Then total is ~7500 tokens (within 12K budget)
    And all sections are included without truncation

  Scenario: Knowledge truncated when budget exceeded
    Given non-truncatable sections (identity + rules) use 2000 tokens
    And operational context + history + tools use 4000 tokens
    And retrieved knowledge candidates total 8000 tokens
    When the context assembler builds the prompt
    Then knowledge is truncated to fit remaining ~6000 tokens
    And lowest-ranked entries are dropped first
    And dropped entries are logged with their scores

  Scenario: Per-section accounting logged
    When the context assembler builds the prompt
    Then a log entry shows token usage per section:
      | Section | Tokens | % of Budget |
      | identity | 800 | 6.7% |
      | rules | 400 | 3.3% |
      | ... | ... | ... |
    And the total is visible in OTEL trace data

  Scenario: Non-truncatable sections never dropped
    Given identity + rules + guidance total 11K tokens (near budget)
    When the context assembler builds the prompt
    Then identity, rules, and guidance are all included
    And knowledge + procedures are heavily truncated
    And a warning is logged: "Non-truncatable sections consume 92% of budget"
```

#### F.8 Safety Model Design

```gherkin
Feature: Four-layer safety model designed and documented
  The safety model is documented before tool implementation begins.
  Layer 0 (LLM) is leveraged, Layer 0.5 (local guardrail model) is configured,
  Layer 1 (homeostasis) is implemented, Layer 2 (hard guardrails) is designed
  for Phase G implementation.

  Scenario: Safety design document exists
    Given Phase F is complete
    Then a safety design document exists at docs/plans/safety-model.md
    And it defines: tool risk levels (read/write/destructive)
    And it defines: trust matrix (channel × identity)
    And it defines: hard blocks (workspace, branches, commands, secrets)
    And it defines: how self_preservation L1 heuristic works
    And it defines: how Layer 0 (LLM guardrails) is leveraged
    And it defines: how Layer 0.5 (local guardrail model) classifies inputs/outputs

  Scenario: Local guardrail model is configured
    Given Ollama is running locally
    When a guardrail model is pulled (e.g., llama-guard, shieldgemma)
    Then the model is available at the configured Ollama endpoint
    And the agent can classify input text as safe/unsafe with a category
    And classification latency is under 100ms
    And no data leaves the local machine

  Scenario: Guardrail model classifies inbound and outbound
    Given the guardrail model is running
    When an inbound message contains harmful content
    Then the classifier returns unsafe + category before the agent LLM sees it
    When the agent requests a tool call with suspicious arguments
    Then the classifier re-checks outbound content before execution

  Scenario: self_preservation dimension is implemented
    Given the homeostasis engine has 7 dimensions
    When a tick runs with a destructive tool request
    Then self_preservation is assessed at L1
    And L1 checks: tool risk, hard rule conflicts, trust level
    And the result influences the system prompt guidance

  Scenario: Trust matrix is configured
    Given the agent spec includes trust configuration
    When a message arrives from "unknown" on "discord"
    Then effective trust is NONE
    And self_preservation guidance reflects the trust gap

  Scenario: Tool risk metadata schema exists
    Given the safety design document is complete
    Then tool interfaces include a "risk" field
    And the schema is: { name: string, risk: "read"|"write"|"destructive", ... }
    And Phase G can implement tools using this schema
```

### Phase G: Work Execution (following — 2 weeks)

**Goal**: The agent can do things, not just talk.

**Prerequisite**: Phase F's agent loop, channel abstraction, and safety design.

| # | Deliverable | Why | Scenarios Addressed |
|---|------------|-----|---------------------|
| G.1 | **Tool implementation** — MCP tools with risk metadata: file ops (read/write), git (branch/commit/push), shell (build/test/lint), web search | Reference Scenario Phase 4: agent executes tasks. Web search for Trace 6 "research briefly". | Trace 4, 6, Scenario 4.2 |
| G.2 | **Safety implementation** — local guardrail model integration (Ollama, Layer 0.5), pre/post filters, workspace boundaries, audit trail (OTEL events for tool calls), approval flow for destructive ops | From Phase F design. Can't let agent run arbitrary commands. Guardrail model classifies inbound/outbound. | All traces |
| G.3 | **Work arc** — homeostasis-driven explore→decide→implement→verify cycle. Heartbeat advances in-progress work. | Trace 4: agent receives and executes multi-step task | Trace 4, 8 |
| G.4 | **GitLab integration** — read issues, fetch MR diffs, create MRs, process review comments, get pipeline status. Webhook/polling → ChannelMessage normalization. | Trace 5: agent handles feedback. Scenario 4.3: code review. | Trace 5, Scenario 4.3 |
| G.5 | **Work-to-knowledge pipeline** — task completion → knowledge entries. Self-observations from mistakes. Tool output logging for future extraction. | Extraction pipeline is blind to agent actions. Without this, agent has amnesia about its own work. | Trace 5, Scenario 4.2, Memory Scenario 8a |
| G.6 | **Task routing** — parse Discord mentions (@Agent-Dev-1), route to correct agent's operational memory. Dashboard task assignment UI. | Scenario 4.1: PM assigns tasks via Discord | Scenario 4.1 |

**Success criteria:**
- Agent receives task on Discord, creates file, runs tests, commits, pushes, creates MR
- Agent handles MR review feedback (GitLab comment → fix → re-push)
- Agent creates self-observation after mistake ("I tend to miss null checks")
- Agent's completed work appears in knowledge store (not just operational memory)
- Safety boundaries prevent: push to main, rm -rf, commands outside workspace
- Work arc visible in dashboard (phase transitions, progress, tool calls)
- Web search works for unknown topics (Trace 6)
- Pipeline status check after push (Scenario 4.2 step 6)

### Phase H: Persona + Multi-Agent (later — 2-3 weeks)

**Goal**: Export learned persona, deploy multiple agents.

**Prerequisite**: Phase F designed for multi-agent (interfaces + IDs), Phase G working for single agent.

| # | Deliverable | Why | Scenarios Addressed |
|---|------------|-----|---------------------|
| H.1 | **Per-agent state** — agent ID on all state files, per-agent operational memory, per-agent workspace | Currently single `state.json`, single `entries.jsonl`. Multi-agent requires partition. | Trace 3, Scenario 4.1 |
| H.2 | **Shared + private memory** — shared knowledge namespace (imported persona), private episodic memory per agent | Scenario 4.2: agents share semantic memories but have own episodes | Trace 3, Scenario 4.2-4.5 |
| H.3 | **Persona export** — semantic + procedural + rules + thresholds + skill proficiency + privacy filtering | Reference Scenario Phase 2. Must filter episodic data, track provenance. | Phase 2 |
| H.4 | **Persona import** — create agent from exported spec. UI for PM to instantiate agents. | Reference Scenario Phase 3. PM creates 3 agents from one persona. | Trace 3 |
| H.5 | **Agent registry** — who's available, what skills, current status. Enables cross-agent MR discovery (Trace 7). | Trace 7: idle agent checks if teammates need help | Trace 7, Scenario 4.3 |
| H.6 | **Cross-agent pattern detection** — track patterns across agents (e.g., "Dev-1 misses null checks") | Memory Scenario 5: cross-agent learning | Memory Scenario 5 |

**Success criteria:**
- Export persona with privacy filtering (no raw episodes)
- Import persona → 3 agents, each with shared knowledge + own state
- Agents coordinate on startup (Trace 3: avoid spam)
- Idle agent discovers teammate's MR and reviews it
- Cross-agent pattern detected within 3 occurrences

### Deferred (with rationale)

| Item | Why Deferred | When Needed |
|------|-------------|-------------|
| SKILL.md auto-generation | Not foundational. Can happen any time after procedures exist. | When we have 10+ high-confidence procedures |
| Promotion pipeline (episode→observation→fact→procedure) | Complex, requires episodic memory infrastructure. Current direct extraction works. | When we observe that direct extraction misses patterns that need multiple observations |
| Clarifying questions (Trace 2) | Requires UI, learning_confidence metric, interpretation candidates. Nice to have, not blocking. | After Phase G, when shadow learning quality is the bottleneck |
| Scheduled interactions / daily rituals | Requires temporal facts with `valid_until`, scheduled triggers. | When deployed in a team setting with daily cadence |
| Procedure success_rate tracking | Requires agent to use procedures and track outcomes. Needs work execution first. | Phase G+, when agent has been executing procedures |
| Evidence-based theory tracking | `evidence_for/against` arrays on entries. Complex, current `confidence` + `supersededBy` works. | When simple supersession proves insufficient |
| Relationship model (trust_level) | No data to drive it until multi-agent + sustained interaction. | Phase H+ |
| L3/L4 meta-assessment | YAGNI until L2 proves insufficient | After sustained production use |

---

## Architecture Principles

1. **Homeostasis is the unifying principle.** Don't add subsystems — add dimensions or connect existing dimensions to new data sources.

2. **Memory with lifecycle.** Every piece of knowledge has confidence, can decay, can be superseded, can be consolidated. No immortal facts except hard rules.

3. **File-based storage + vector search.** JSONL for structured data, Markdown for human-readable artifacts. Qdrant for embeddings/retrieval (already running locally).

4. **Ecosystem leverage.** Claude Code for coding, MCP for tools, AI SDK for LLM abstraction. Galatea owns homeostasis + memory + operational context + agent loop.

5. **Strict prompts, schema enforcement.** Never trust the LLM to "figure it out." Structure embodies desired behavior.

6. **Working memory bridges knowing and doing.** The operational context connects the brain (homeostasis + long-term memory) to the hands (tool execution).

7. **Design for multi-agent, implement for single-agent.** Use agent IDs, avoid singleton paths. Interfaces should support multiple agents even when Phase F/G only run one. This prevents Phase H from requiring a rewrite.

8. **Safety before tools.** Design the trust model before implementing the tool layer. Tool interfaces carry risk metadata. Safety is not a feature — it's a constraint on the tool design.

9. **The agent must remember its own actions.** Work outputs (files created, commands run, MRs opened) must enter the knowledge store. An agent that forgets what it did is useless across sessions.

---

## Key Differences from OpenClaw

| Aspect | OpenClaw | Galatea |
|--------|----------|---------|
| Memory writes | Agent decides (auto-flush) | Pipeline extracts + task completion → entries |
| Self-regulation | Binary Thinking Clock | 6-dimension homeostasis with L0-L2 |
| Knowledge structure | Flat Markdown | Typed entries with entities, about, confidence |
| Forgetting | None (manual archival) | Automatic decay + archival |
| Quality assurance | Trust the model | Eval datasets + strict prompts + confabulation guards |
| Working memory | Unstructured `active-context.md` | Structured `OperationalContext` with TaskState |
| Work execution | Direct tool calls (reactive) | Homeostasis-driven work arc (explore→decide→implement→verify) |
| Channel routing | 15+ adapters via gateway | `ChannelMessage` abstraction with typed routing metadata |
| Safety | Session-scoped trust + weekly audit | Tool risk classification + pre/post filters + workspace boundaries |
| Agent's self-knowledge | None | Work-to-knowledge pipeline: agent remembers what it did |

---

## Risk Register: What Could Still Go Wrong

| Risk | Mitigation | Phase |
|------|-----------|-------|
| ReAct inner loop makes ticks too long (minutes) | Budget controls: max 10 steps, 60s timeout per tick. Long tasks span multiple ticks via operational memory. | F.2 |
| Token budget still too tight at 12K | Per-section accounting will show exactly where tokens go. Adjust based on data, not guesses. | F.7 |
| Qdrant adds operational complexity | Already running, already maintained. If it dies, fall back to keyword retrieval (degrade, don't fail). | F.5 |
| Safety design delays Phase G | Time-boxed: 2-3 days for design doc. Doesn't need to be perfect, needs to exist. | F.8 |
| Phase H requires rethinking F/G assumptions | Principle 7 (design for multi-agent). Use agent IDs everywhere. Avoid `data/agent/state.json` — use `data/agents/{id}/state.json`. | F, G |
| Local LLM quality insufficient for tool decisions | Use frontier model (Claude) for tool-use ticks, local model for assessment ticks. Matches OpenClaw's System 1/2 pattern. | G |

---

*Synthesized from: PSYCHOLOGICAL_ARCHITECTURE.md, ROADMAP.md, KNOWN_GAPS.md, REFERENCE_SCENARIOS.md, OpenClaw research (2026-02-21), 3-agent adversarial review (2026-02-21)*
