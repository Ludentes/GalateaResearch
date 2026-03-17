# Galatea Unified Architecture & Roadmap

**Date**: 2026-02-21
**Status**: Draft v3 — updated post-Phase F with Coding Tool Adapter decision
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

### Limitations Resolved by Phase F

The tick loop was a request-response handler pretending to be an agent loop. Phase F resolved these structural blockers:

| Limitation (Phase A-E) | Resolution (Phase F) |
|---|---|
| Processes one message, calls LLM once, returns text | F.2: ReAct agent loop with multi-turn tool calls, budget controls |
| No conversation history between ticks | F.3: Operational memory persists last 5 exchanges across ticks |
| No tool execution infrastructure | F.2: Tool scaffolding with `registerTool()`, ZodSchema validation |
| No outbound delivery | F.1: Channel abstraction + dispatcher to Discord/dashboard |
| 4K token budget too tight | F.7: 12K budget with per-section accounting |
| Chat UI and tick loop completely separate | F.1: Both unified under ChannelMessage |
| PendingMessage too thin for routing | F.1: Replaced by ChannelMessage with full routing metadata |

### Remaining Limitations Post-Phase F

- **No actual coding execution** — tool scaffolding exists but only stub tools are registered
- **No GitLab integration** — no webhook normalization, no MR creation
- **Single-agent only** — interfaces designed for multi-agent but only one agent runs
- **Extraction pipeline blind to agent actions** — reads user transcripts, not agent work output

### Open Gaps

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 11 | **Session model unclear** — no definition of session boundaries | High | Resolved (F.1, F.3) |
| 12 | **Work execution model missing** — agent can't do things, only talk | Critical | Partially resolved — loop exists, coding tool adapter needed (G.1) |
| 13 | **LLM hallucination** — local models need strict prompts + validation | High | Partially resolved — confabulation guard (F.6), extraction eval |
| 14 | **Tick loop is not an agent loop** — no tools, no history, no multi-step | Critical | Resolved (F.2, F.3) |
| 15 | **No channel abstraction** — no outbound delivery, no unified message routing | High | Resolved (F.1) |
| 16 | **Extraction blind to agent actions** — pipeline reads chat, not tool outputs | High | Designed — SDK transcripts feed existing pipeline (G.5) |

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
┌──────────────────────────────────────────────────────────────────────────┐
│                          GALATEA UNIFIED                                  │
│                                                                          │
│  ┌──────────────┐   ┌───────────────────┐   ┌────────────────────────┐ │
│  │   BRAIN      │   │   RUNTIME         │   │   HANDS                │ │
│  │              │   │                   │   │                        │ │
│  │ Homeostasis  │◄─►│ Agent Loop        │──►│ CodingToolAdapter      │ │
│  │ 7 dimensions │   │ - Tick handler    │   │ ┌────────────────────┐ │ │
│  │ L0-L2        │   │ - Goal-level      │   │ │ Claude Code SDK    │ │ │
│  │              │   │   delegation      │   │ │ + PreToolUse hooks │ │ │
│  │ Long-term    │   │                   │   │ │   (homeostasis)    │ │ │
│  │ Memory       │◄─►│ Operational Mem   │   │ └────────────────────┘ │ │
│  │ entries.jsonl │   │ - Task state      │   │ ┌────────────────────┐ │ │
│  │              │   │ - Work phases     │   │ │ Future adapters:   │ │ │
│  │ Qdrant       │   │ - Conversation    │   │ │ Cursor, KiloCode   │ │ │
│  │ (retrieval)  │   │   history         │   │ └────────────────────┘ │ │
│  │              │   │                   │   │                        │ │
│  │ Slow Loop    │   │  Fast Loop        │   │ Channel Dispatch       │ │
│  │ (learning)   │   │  (execution)      │──►│ Discord / GitLab       │ │
│  │ days/weeks   │   │  minutes          │   │ Dashboard              │ │
│  └──────────────┘   └───────────────────┘   └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

The **Runtime** is the new foundational layer. It replaces the current tick loop with an actual agent loop that supports multi-turn execution, tool calling, conversation history, and outbound message dispatch. This must exist before work execution (Phase G) can begin.

### The Coding Tool Adapter Pattern

**Key decision (post-Phase F):** Galatea does NOT reimplement file editing, git, shell, or web search. Coding tools are behind a pluggable adapter interface. The first implementation uses Claude Code Agent SDK.

**Why:** Claude Code already has battle-tested Read/Write/Edit/Bash/Grep/Glob with context management, error recovery, and retry logic. Reimplementing these as custom MCP tools would take months with worse quality. Other coding tools (Cursor, KiloCode) provide similar capabilities.

```typescript
interface CodingToolAdapter {
  query(options: {
    prompt: string              // Goal-level task description
    systemPrompt: string        // Galatea identity + knowledge + guidance
    workingDirectory: string    // Project workspace
    hooks?: {
      preToolUse?: PreToolUseHook[]    // Homeostasis safety checks
      postToolUse?: PostToolUseHook[]  // Audit + knowledge extraction
      stop?: StopHook[]                // Completion verification
    }
    claudeMdPath?: string       // Path to generated CLAUDE.md
    timeout?: number
  }): AsyncIterable<CodingSessionMessage>

  isAvailable(): Promise<boolean>
}
```

**Ownership boundary:**

| Galatea Owns | Adapter Provides |
|---|---|
| Tick loop and work arc decisions | File read/write/edit |
| Memory (long-term, operational, episodic) | Git operations |
| Homeostasis (all 7 dimensions) | Shell execution |
| Safety checks (via hooks injected into adapter) | Code search/navigation |
| Context assembly (knowledge → system prompt) | Web search |
| Knowledge extraction (from session transcripts) | Context window management |
| Task routing and prioritization | Multi-file editing |
| Artifact generation (CLAUDE.md, skills, subagents) | Tool permission handling |

**Two loops at different speeds:**

- **Fast loop (minutes):** Task arrives → Galatea assembles context → `adapter.query()` with hooks → result + transcript → extract knowledge → report back
- **Slow loop (days/weeks):** Galatea shadows sessions (user + agent) → detects patterns → generates artifacts (CLAUDE.md, `.claude/skills/*.md`, `.claude/agents/*.md`) → these improve the fast loop over time

The slow loop's output is consumed natively by Claude Code. No custom integration needed — `.claude/` is the standard configuration directory.

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

**Goal**: The agent can do things, not just talk. Via the Coding Tool Adapter pattern.

**Prerequisite**: Phase F's agent loop, channel abstraction, safety design, and hooks/subagents research.

**Key insight**: Galatea does NOT build coding tools. It delegates to Claude Code Agent SDK via an adapter interface, injecting homeostasis checks as PreToolUse hooks.

| # | Deliverable | Why | Scenarios Addressed |
|---|------------|-----|---------------------|
| G.1 | **CodingToolAdapter interface + Claude Code SDK adapter** — define adapter interface, implement first adapter using `@anthropic-ai/claude-agent-sdk`, wire `query()` into agent loop where stub tools currently live | Replaces need to build MCP tools for file/git/shell. Claude Code already has Read/Write/Edit/Bash/Grep/Glob. | Trace 4, 6, Scenario 4.2 |
| G.2 | **PreToolUse hook integration with homeostasis** — implement hook callbacks that call homeostasis engine before each tool call within SDK session. Maps Layer 2 hard guardrails (workspace boundaries, branch protection, command allowlist) to PreToolUse deny/allow decisions. | Safety checks run WITHIN the coding session, not just at tick level. Every Bash, Edit, Write call passes through homeostasis. | All traces |
| G.3 | **Goal-level work arc** — agent loop delegates GOALS to adapter, not individual steps. Work arc: receive task → assemble context → `adapter.query("Implement X", {hooks, claudeMd})` → monitor result → extract knowledge. Galatea decides WHAT; adapter decides HOW. | Step-by-step orchestration is fragile and slow. Goal-level delegation leverages the coding tool's own planning. | Trace 4, 8 |
| G.4 | **GitLab integration** — read issues, fetch MR diffs, create MRs, process review comments, get pipeline status. Webhook/polling → ChannelMessage normalization. (Galatea-level, not delegated to adapter.) | Trace 5: agent handles feedback. Scenario 4.3: code review. | Trace 5, Scenario 4.3 |
| G.5 | **Session transcript → extraction pipeline** — feed SDK session transcripts to the same extraction pipeline used for user shadow learning. Tool call logs become input for knowledge entries. | The extraction pipeline already exists. SDK transcripts are structurally identical to Claude Code JSONL files we already process. | Trace 5, Scenario 4.2, Memory Scenario 8a |
| G.6 | **Task routing** — parse Discord mentions (@Agent-Dev-1), route to correct agent's operational memory. Dashboard task assignment UI. | Scenario 4.1: PM assigns tasks via Discord. | Scenario 4.1 |
| G.7 | **Artifact generation** — generate CLAUDE.md sections, `.claude/skills/*.md` files, and `.claude/agents/*.md` subagent definitions from learned patterns. Consumed natively by Claude Code in future sessions. | The slow loop's output. Patterns detected over days/weeks become artifacts that improve future task execution. | Phase 1, Scenario 4.4 |

**Success criteria:**
- Agent receives task on Discord → `adapter.query()` creates files, runs tests, commits, pushes, creates MR
- PreToolUse hook blocks: push to main, rm -rf, commands outside workspace (within SDK session)
- Agent handles MR review feedback (GitLab comment → new `adapter.query()` with feedback context → re-push)
- SDK session transcript fed to extraction pipeline → agent's work appears in knowledge store
- Work arc visible in dashboard (goal delegated, adapter session active, result received)
- Web search works for unknown topics (Trace 6) — via Claude Code's built-in WebSearch
- Generated CLAUDE.md contains learned preferences from shadow sessions
- At least one skill file generated from high-confidence procedure entries
- Pipeline status check after push (Scenario 4.2 step 6)

### Phase G Requirements (BDD-style)

#### G.1 CodingToolAdapter + Claude Code SDK Adapter

```gherkin
Feature: Coding tool adapter delegates execution to Claude Code SDK
  Galatea delegates coding tasks to the CodingToolAdapter,
  which wraps the Claude Code Agent SDK.

  Scenario: Simple task delegation
    Given a task "Create a new file hello.ts with console.log('hello')"
    And the Claude Code SDK adapter is available
    When the agent loop delegates to the adapter
    Then adapter.query() is called with the task as prompt
    And the assembled context is passed as system prompt
    And the working directory is set to the agent's workspace
    And the session runs to completion
    And the adapter returns the session transcript and result

  Scenario: Adapter injects CLAUDE.md
    Given Galatea has generated a CLAUDE.md with learned preferences
    When adapter.query() is called
    Then claudeMdPath points to the generated CLAUDE.md
    And Claude Code loads it as project context
    And the preferences influence coding decisions

  Scenario: Adapter not available
    Given the Claude Code SDK is not installed or API key missing
    When the agent loop attempts to delegate
    Then adapter.isAvailable() returns false
    And the agent reports the blocker via channel dispatch
    And the task remains in operational memory as "blocked"

  Scenario: SDK session timeout
    Given a timeout of 300 seconds is configured
    When the SDK session exceeds 300 seconds
    Then the session is terminated
    And partial results (transcript so far) are captured
    And the task status remains "in_progress" with carryover notes
```

#### G.2 PreToolUse Hook Integration with Homeostasis

```gherkin
Feature: Homeostasis safety checks run within SDK sessions
  Every tool call in a Claude Code session passes through
  Galatea's homeostasis engine via PreToolUse hooks.

  Scenario: Safe tool call allowed
    Given a PreToolUse hook is registered for Bash|Edit|Write
    When Claude Code calls Write("src/profile.tsx", content)
    Then the hook calls POST /api/v1/safety/check
    And the path is within workspace — Layer 2 allows
    And self_preservation is HEALTHY — Layer 1 allows
    And the hook returns allow
    And the file is written

  Scenario: Destructive command blocked
    Given a PreToolUse hook is registered for Bash
    When Claude Code calls Bash("rm -rf /")
    Then the hook calls POST /api/v1/safety/check
    And Layer 2 command pattern matches BLOCKED_PATTERNS
    And the hook returns deny with reason
    And Claude Code sees the denial and adjusts approach

  Scenario: Protected branch push blocked
    Given a PreToolUse hook is registered for Bash
    When Claude Code calls Bash("git push origin main")
    Then the hook checks branch protection
    And "main" is in PROTECTED_BRANCHES
    And the hook returns deny
    And Claude Code adjusts to push to feature branch

  Scenario: Hook failure — fail-open for reads
    Given the homeostasis API is temporarily unavailable
    When Claude Code calls Read("src/profile.tsx")
    Then the hook times out (5s) and returns allow
    And a warning is logged

  Scenario: Hook failure — fail-closed for writes
    Given the homeostasis API is temporarily unavailable
    When Claude Code calls Bash("git push --force")
    Then the hook times out and returns deny
    And a warning is logged
```

#### G.3 Goal-Level Work Arc

```gherkin
Feature: Agent delegates goals, not steps, to the coding tool
  The agent loop determines WHAT to do and delegates HOW to the adapter.

  Scenario: Task becomes adapter query
    Given a task "Implement user profile screen with edit functionality"
    And knowledge retrieval returns NativeWind preference and null-check rule
    When the agent loop processes the task
    Then it assembles a goal-level prompt including retrieved knowledge
    And delegates to adapter.query() with the full prompt
    And does NOT break the task into individual file operations

  Scenario: Multi-step task in single adapter session
    Given a task requiring file creation, testing, and git operations
    When delegated to the adapter
    Then the entire work arc runs within one SDK session
    And Galatea does not intervene between tool calls
    And only PreToolUse hooks provide guardrails within the session

  Scenario: Adapter result triggers Galatea-level actions
    Given a coding task completed by the adapter
    When the adapter returns success
    Then Galatea creates the MR via GitLab integration (Galatea-level)
    And posts status in Discord (Galatea-level)
    And feeds transcript to extraction pipeline
    And updates operational memory: task → "done"
```

#### G.5 Session Transcript → Extraction Pipeline

```gherkin
Feature: SDK session transcripts feed the extraction pipeline
  The same pipeline used for shadow learning processes adapter transcripts.

  Scenario: Transcript contains tool calls
    Given an SDK session that created 3 files and ran tests
    When the session transcript is fed to the extraction pipeline
    Then knowledge entries are created from the session
    And entries include entities from files touched

  Scenario: Self-observation from mistake
    Given the adapter session failed a test, then fixed the code
    When the transcript is processed
    Then a self-observation entry is created
    And the relevant fact is reinforced (confidence +0.05)
```

#### G.7 Artifact Generation

```gherkin
Feature: Slow loop generates Claude Code artifacts from learned patterns

  Scenario: CLAUDE.md generated from knowledge
    Given 10+ hard rules and 20+ high-confidence preferences in knowledge store
    When the artifact generator runs
    Then a CLAUDE.md file is generated at .claude/CLAUDE.md
    And it contains all hard rules as "## Rules" section
    And high-confidence preferences as "## Preferences" section

  Scenario: Skill file generated from procedure
    Given a procedure "Create Expo screen" with confidence >= 0.9
    And the procedure has been used 3+ times
    When the artifact generator runs
    Then a skill file is created at .claude/skills/create-expo-screen.md
    And it contains the procedure steps as instructions
    And it has YAML frontmatter with name, description, trigger

  Scenario: Subagent definition from specialization
    Given an agent has accumulated review-specific knowledge
    And 5+ review procedures with high success rates
    When the artifact generator runs
    Then a subagent definition is created at .claude/agents/code-reviewer.md
    And it has appropriate tool restrictions (Read, Grep, Glob only)
```

### Phase H: Persona + Multi-Agent (later — 2-3 weeks)

**Goal**: Export learned persona, deploy multiple agents.

**Prerequisite**: Phase F designed for multi-agent (interfaces + IDs), Phase G working for single agent.

| # | Deliverable | Why | Scenarios Addressed |
|---|------------|-----|---------------------|
| H.1 | **Per-agent state** — agent ID on all state files, per-agent operational memory, per-agent workspace | Currently single `state.json`, single `entries.jsonl`. Multi-agent requires partition. | Trace 3, Scenario 4.1 |
| H.2 | **Shared + private memory** — shared knowledge namespace (imported persona), private episodic memory per agent | Scenario 4.2: agents share semantic memories but have own episodes | Trace 3, Scenario 4.2-4.5 |
| H.3 | **Persona export** — export = package the `.claude/` directory: CLAUDE.md (preferences, rules, identity), `skills/*.md` (procedures), `agents/*.md` (subagent definitions), plus filtered knowledge entries. The `.claude/` directory IS the persona. | Claude Code consumes `.claude/` natively. No custom format needed. | Phase 2 |
| H.4 | **Persona import** — import = copy packaged `.claude/` to new workspace + load knowledge entries into new agent's store. PM creates agent by importing a persona package. | Reference Scenario Phase 3. PM creates 3 agents from one persona. | Trace 3 |
| H.5 | **Agent registry** — who's available, what skills, current status. Enables cross-agent MR discovery (Trace 7). | Trace 7: idle agent checks if teammates need help | Trace 7, Scenario 4.3 |
| H.6 | **Cross-agent pattern detection** — track patterns across agents (e.g., "Dev-1 misses null checks") | Memory Scenario 5: cross-agent learning | Memory Scenario 5 |

**Success criteria:**
- Export persona with privacy filtering (no raw episodes)
- Import persona → 3 agents, each with shared knowledge + own state
- Agents coordinate on startup (Trace 3: avoid spam)
- Idle agent discovers teammate's MR and reviews it
- Cross-agent pattern detected within 3 occurrences

### Phase H Requirements (BDD-style)

#### H.3 Persona Export

```gherkin
Feature: Export persona as .claude/ directory package

  Scenario: Export includes generated artifacts
    Given an agent with CLAUDE.md, 3 skill files, and 1 subagent definition
    When persona export is triggered
    Then the export package contains .claude/CLAUDE.md, skills/*.md, agents/*.md
    And filtered knowledge entries as knowledge-export.jsonl

  Scenario: Privacy filtering on export
    Given knowledge entries include episodic memories with user names
    When persona export runs
    Then episodic entries are excluded or anonymized
    And semantic entries (facts, procedures, rules) are included

  Scenario: Export is self-contained
    Given the exported package
    When imported into a fresh workspace with no prior Galatea state
    Then Claude Code can load the .claude/ directory and function
    And the knowledge entries can populate a new store
```

#### H.4 Persona Import

```gherkin
Feature: Import persona creates new agent from package

  Scenario: Import creates working agent
    Given an exported persona package
    When PM imports it into /workspace/new-project/
    Then .claude/ directory is created with all artifacts
    And knowledge entries are loaded into the new agent's store
    And the agent can immediately use skills and preferences

  Scenario: Three agents from one persona
    Given one exported persona package
    When PM creates Agent-Dev-1, Agent-Dev-2, Agent-Dev-3
    Then each gets a copy of .claude/ in their workspace
    And each gets the shared knowledge entries
    And each has independent operational memory (empty)
```

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

4. **Ecosystem leverage.** Coding tools (Claude Code, Cursor, etc.) are pluggable adapters behind `CodingToolAdapter`. Galatea owns the loop and memory; coding tools are interchangeable.

5. **Strict prompts, schema enforcement.** Never trust the LLM to "figure it out." Structure embodies desired behavior.

6. **Working memory bridges knowing and doing.** The operational context connects the brain (homeostasis + long-term memory) to the hands (tool execution).

7. **Design for multi-agent, implement for single-agent.** Use agent IDs, avoid singleton paths. Interfaces should support multiple agents even when Phase F/G only run one. This prevents Phase H from requiring a rewrite.

8. **Safety before tools.** Design the trust model before implementing the tool layer. Tool interfaces carry risk metadata. Safety is not a feature — it's a constraint on the tool design.

9. **The agent must remember its own actions.** Work outputs (files created, commands run, MRs opened) must enter the knowledge store. An agent that forgets what it did is useless across sessions.

10. **Two loops — fast and slow.** The fast loop (minutes) executes tasks via the coding tool adapter. The slow loop (days/weeks) learns from all sessions — user shadow + agent execution — and generates artifacts that improve the fast loop.

11. **Delegate execution, own safety.** Galatea delegates coding to battle-tested tools but injects homeostasis safety checks within those sessions via hooks. Safety is never delegated.

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
| Tool execution | Direct MCP tool calls built in-house | Goal-level delegation via CodingToolAdapter + PreToolUse hooks |
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
| Claude Code SDK limitations (context window, tool failures) | Adapter interface allows fallback. Partial transcript captured on failure. Retry with narrowed scope. | G.1 |
| Hook latency impacts coding speed | Homeostasis API must respond in <100ms. Cache trust decisions. Fail-open for read tools, fail-closed for write/destructive. | G.2 |
| SDK transcript format changes between versions | Pin SDK version. Extraction pipeline uses flexible parsing. | G.5 |

---

*Synthesized from: PSYCHOLOGICAL_ARCHITECTURE.md, ROADMAP.md, KNOWN_GAPS.md, REFERENCE_SCENARIOS.md, OpenClaw research (2026-02-21), 3-agent adversarial review (2026-02-21)*
