# Beta Simulation: Wiring Galatea End-to-End

**Date**: 2026-03-11
**Status**: Design — validated through brainstorming
**Prerequisite**: Phase G (work execution) — 90% complete
**Validates**: Full Galatea architecture with real users via Discord

---

## Strategic Context: Reynolds Simulation Levels

From Alastair Reynolds' Revelation Space, adapted as a product ladder:

| Level | Definition | Galatea Equivalent | Status |
|-------|-----------|-------------------|--------|
| **Gamma** | Fictitious personality, precision tasks, never self-aware | Shadow learning + runbooks + retrieval + CLAUDE.md | Done (`claude-shadow-learn`) |
| **Beta** | Behavioral model of a real person, predicts reactions, Turing-compliant | Gamma + homeostasis + heartbeat + operational memory + channels | ~70% built |
| **Alpha** | Full consciousness upload, genuinely sentient | Out of scope | — |

**Key insight**: The market buys gamma (OpenClaw, Claude Code, Cursor). Nobody has beta. The jump from gamma to beta is not more knowledge — it's self-regulation (homeostasis) and autonomous behavior (heartbeat). These are foundational, not plugins.

**Independent validation**: Goertzel's "Hands Without a Brain" critique, OpenClaw's Thinking Agents Manifesto, and OpenAI's deliberate choice to build stateless agents all confirm the gap is real.

---

## Goal

Wire the existing Galatea architecture end-to-end so that:
1. An agent receives Discord messages
2. Homeostasis assesses the situation
3. The agent does real work via Claude Code (coding, research, review, admin)
4. The agent responds on Discord
5. Completed work feeds back into the knowledge store

**Validation**: Two personas emerge from the general system:
- **Beki** (beta Kirill) — developer agent, works on a test repo
- **Besa** (beta Sasha) — PM agent, researches, creates tasks, reviews work

A real PM will interact with Beki/Besa via Discord to validate the architecture.

---

## What Exists (Audit: 2026-03-11)

### Production-Ready (tested, 76 test files, 7 integration suites)

| Layer | Component | Location |
|-------|-----------|----------|
| Brain | Homeostasis L0-L1 (7 dimensions, heuristics, caching) | `server/engine/homeostasis-engine.ts` |
| Brain | Homeostasis L2 (LLM semantic, optional) | `server/engine/homeostasis-engine.ts` |
| Memory | Full extraction pipeline (signal → heuristic → cloud LLM → consolidate) | `server/memory/` |
| Memory | Knowledge store (JSONL + dedup + decay + archival) | `server/memory/knowledge-store.ts` |
| Memory | Fact retrieval (3-pass: entity → keyword → vector stub) | `server/memory/fact-retrieval.ts` |
| Memory | Context assembler (priority truncation + guidance injection) | `server/memory/context-assembler.ts` |
| Memory | Curation queue, feedback loop, decision trace | `server/memory/` |
| Memory | Consolidation to CLAUDE.md + skill generation | `server/memory/artifact-generator.ts` |
| Runtime | Tick loop + heartbeat (30s configurable) | `server/agent/tick.ts`, `heartbeat.ts` |
| Runtime | Agent loop (ReAct, budget-controlled, max steps) | `server/agent/agent-loop.ts` |
| Runtime | Operational memory (tasks, phases, history, blockers) | `server/agent/operational-memory.ts` |
| Runtime | Coding adapter (Claude Code SDK delegation + work arc) | `server/agent/coding-adapter/` |
| Safety | Tool-call safety (workspace, branch, destructive patterns) | `server/engine/homeostasis-engine.ts` |
| Infra | Multi-provider (Ollama + OpenRouter + Claude Code, with fallback) | `server/providers/` |
| Infra | Ollama queue with circuit breaker | `server/providers/ollama-queue.ts` |
| Infra | Discord bot + dispatcher + mention parsing | `server/discord/` |
| Infra | API routes (14 endpoints) | `server/routes/` |
| Infra | OTEL event store + Langfuse plugin | `server/observation/` |
| Eval | Golden dataset (4 devs, 98 items), 3 strategy comparisons | `experiments/extraction/` |

### Scaffolding / Disabled

| Component | State |
|-----------|-------|
| Confabulation guard | Stub (1 function) |
| Vector retrieval (Qdrant) | Implemented, disabled (`use_vector: false`) |
| Batch dedup (LLM) | Implemented, disabled (`enabled: false`) |
| Homeostasis L3-L4 | Stubs only |

---

## Knowledge Architecture Decision

### Problem: MD→struct→MD is lossy

The extraction pipeline (heuristics: 37.8% recall, cloud LLM: ~95% recall) degrades human-curated knowledge. A precise note like "Alex over-engineers abstractions, tends to add 'just in case' props" gets split into fragments that lose nuance and connection. The human-curated MD file is the highest quality artifact — running it through extraction makes it worse.

### Decision: Two-layer knowledge, human MD is source of truth

```
LAYER 1: Human-curated MD files (source of truth)
  patterns/*.md    — domain rules, preferences, procedures
  entities/*.md    — people, services, state
  team/*.yaml      — teammate profiles (W.13)
  ↓
  Read directly by agent context assembly
  Never round-tripped through extraction pipeline

LAYER 2: Structured store (staging + processing)
  entries.jsonl    — fed by extraction pipeline from transcripts
  ↓
  Extraction → dedup → consolidation → suggestions
  ↓
  Human promotes good suggestions to Layer 1 MD files
  Does NOT overwrite human-curated files
```

### What this means

- **Agent reads MD files directly** — same as Claude Code reads CLAUDE.md. Shadow-learn's `patterns/` + `entities/` format adopted.
- **Structured store handles new knowledge from transcripts** — extraction pipeline produces candidates, human reviews and promotes.
- **Nothing is lost** — human-curated content is never degraded by LLM extraction.
- **Existing infrastructure is preserved** — extraction pipeline, dedup, consolidation, decay all still work on Layer 2. They become the "suggestion engine" rather than the source of truth.
- **Shadow-learn output format is the interface** — multi-file (`patterns/*.md`, `entities/*.md`) rather than single `CLAUDE.md`. Team already uses this.

### What we keep from the structured store

| Feature | Status | Role |
|---------|--------|------|
| Extraction pipeline | Keep | Processes transcripts → suggests new entries |
| Dedup / consolidation | Keep | Filters suggestions before human review |
| Decay | Keep | Ages out stale suggestions |
| Feedback tracking | Keep | Tracks which entries help/harm (future) |
| Fact retrieval | **Defer** | Not needed while MD files fit in context |
| Artifact generator | **Adapt** | Output shadow-learn format instead of single CLAUDE.md |

---

## What's Missing: Three Tiers

### Tier 1: Wire What Exists

These are the connections between existing components that aren't plugged together in production.

#### W.1: Discord Inbound → Tick Pending Queue

**Problem**: Discord handler parses messages and classifies them (chat / task_assignment), but doesn't enqueue them for the tick loop to process.

**Solution**: Discord handler calls `agentState.addPendingMessage(channelMessage)` on receipt. Heartbeat tick picks up pending messages via `agentState.getPendingMessages()`.

**Reference Scenario**: Trace 4 (PM assigns task via Discord → agent picks up on next tick).

#### W.2: Tick Response → Discord Outbound

**Problem**: Tick produces a response string but doesn't route it back to Discord.

**Solution**: Dispatcher already has handler registry. Wire Discord outbound handler. Tick calls `dispatch(outboundMessage)` after producing a response. Response includes routing info (thread ID, reply-to) from the inbound ChannelMessage.

**Reference Scenario**: Trace 4 (agent posts "MR ready for #101" in Discord).

#### W.3: Fix ARCHITECTURE.md Implementation Status

**Problem**: Implementation status table has 6 wrong entries, 11 missing entries, inconsistent dimension counts (6 vs 7).

**Solution**: Update table to reflect actual state. Add missing components. Fix "6 dimensions" → "7 dimensions" everywhere. Add "Last updated" field.

#### W.4: Fix Test Suite

**Problem**: 15 test failures — PostgreSQL connection refused (port 15432) + confabulation guard logic error.

**Solution**: Fix confabulation guard stub. Ensure test suite can run without PostgreSQL (mock or skip DB-dependent tests).

### Tier 2: Generalize the Model

What the Beki/Besa validation revealed about gaps in the existing design.

#### W.5: Two-Level Task Model (Interaction vs Task)

**Problem**: Current TaskState is heavyweight — phases, progress, artifacts. But "check if Beki finished #101" is a 30-second Q&A that doesn't warrant a TaskState.

**Solution**: The LLM + homeostasis decides whether something is an interaction (single-tick, respond and done) or a task (multi-tick, tracked). No explicit classification by the user.

- **Interaction**: knowledge_sufficiency reaches HEALTHY after one retrieval or tool call → respond → done. No TaskState created.
- **Task**: knowledge_sufficiency starts LOW, or work requires multiple steps → create TaskState, track phases.

**Gherkin**:

```gherkin
Feature: Two-level task model

  Scenario: Quick question handled as interaction
    Given a Discord message "@Beki what auth library do we use?"
    When the tick processes this message
    And knowledge retrieval returns "Team uses Clerk for auth"
    Then the agent responds directly without creating a TaskState
    And homeostasis assessment shows knowledge_sufficiency: HEALTHY

  Scenario: Work request creates a task
    Given a Discord message "@Beki implement user settings screen for #101"
    When the tick processes this message
    Then a TaskState is created with type "coding" and status "assigned"
    And the agent delegates to the coding adapter
    And progress is tracked across ticks

  Scenario: PM quick status check
    Given a Discord message "@Besa is MR !42 merged?"
    When the tick processes this message
    Then the agent runs `glab mr view 42` via coding adapter
    And responds with status without creating a TaskState

  Scenario: PM research request creates a task
    Given a Discord message "@Besa research push notification options"
    When the tick processes this message
    Then a TaskState is created with type "research"
    And the agent uses web search and file write tools
    And produces a document artifact
```

#### W.6: TaskState Type Field

**Problem**: Current TaskState assumes coding. PM work is different — research, review, admin, communication.

**Solution**: Add `type` field that drives adapter behavior:

```typescript
interface TaskState {
  id: string
  description: string
  source: {
    channel: "discord" | "gitlab" | "dashboard" | "internal"
    threadId?: string
    issueId?: string        // Optional — PM work often has no issue
    messageId?: string
  }
  type: "coding" | "research" | "review" | "admin" | "communication"
  status: "assigned" | "in_progress" | "blocked" | "done"
  phase: "exploring" | "deciding" | "implementing" | "verifying"
  sessions: string[]        // Claude Code session IDs
  progress: string[]
  artifacts: Artifact[]
  phaseStartedAt: string
  toolCallCount: number
}
```

**Behavior by type**:
- `coding` → Claude Code with file/git/shell tools, produces branches + MRs
- `research` → Claude Code with web search + file write, produces docs
- `review` → Claude Code reads diff + comments on GitLab
- `admin` → Claude Code runs glab commands, produces issues/updates
- `communication` → Respond in Discord, minimal or no Claude Code

**Gherkin**:

```gherkin
Feature: Task type drives behavior

  Scenario: Coding task uses full tool set
    Given a TaskState with type "coding"
    When the agent delegates to the coding adapter
    Then allowedTools includes file, git, shell operations
    And the system prompt includes coding-specific knowledge

  Scenario: Research task produces documents
    Given a TaskState with type "research"
    When the agent delegates to the coding adapter
    Then allowedTools includes web search and file write
    And artifacts include document type entries
    And no branch or MR is created

  Scenario: Review task reads and comments
    Given a TaskState with type "review"
    When the agent delegates to the coding adapter
    Then the agent reads the MR diff via glab
    And comments are posted to GitLab
    And the original task (someone else's) is not modified

  Scenario: Admin task manages GitLab issues
    Given a TaskState with type "admin"
    When the PM asks to create sprint tasks
    Then the agent creates GitLab issues via glab
    And artifacts include issue type entries with URLs
```

#### W.7: General Artifact Type

**Problem**: Current artifacts are strings (file paths, MR references). PM work produces documents, issues, comments.

**Solution**:

```typescript
interface Artifact {
  type: "branch" | "mr" | "document" | "issue" | "comment" | "commit"
  path?: string           // For documents: file path
  url?: string            // For GitLab: issue/MR URL
  description: string
}
```

#### W.8: Agent Spec Format

**Problem**: Agent configuration is scattered across config.yaml, preprompts DB, and hardcoded paths.

**Solution**: A single YAML spec per agent that defines identity + thresholds + workspace + trust. This is also the exportable persona format (Phase H compatibility).

```yaml
agent:
  id: "beki"
  name: "Beki"
  role: "Mobile developer"
  domain: "Expo / React Native"

workspace: "/home/newub/w/test-project"
allowed_branches: ["feature/*", "fix/*"]

thresholds:
  certainty_alignment:
    context: "Architecture questions require higher certainty — ask PM"
  communication_health:
    context: "Update every ~2 hours during active work"

hard_blocks:
  - "push directly to main"
  - "commit secrets"
  - "execute commands outside workspace"

trust:
  identities:
    - entity: "sasha"
      level: "full"
  channels:
    discord: "high"
    dashboard: "full"
  default_identity_trust: "none"

# Knowledge store path — can be shared or per-agent
knowledge_store: "data/memory/entries.jsonl"
# Operational memory — always per-agent
operational_memory: "data/agents/beki/context.jsonl"
```

Second spec for Besa:

```yaml
agent:
  id: "besa"
  name: "Besa"
  role: "Project Manager"
  domain: "Product management, research, task coordination"

workspace: "/home/newub/w/test-project"
allowed_branches: ["docs/*", "feature/*"]

thresholds:
  certainty_alignment:
    context: "Research conclusions need evidence — don't guess"
  communication_health:
    context: "Respond promptly, batch status updates"

hard_blocks:
  - "push directly to main"
  - "commit secrets"
  - "merge MRs without review"

trust:
  identities:
    - entity: "sasha"
      level: "full"
    - entity: "beki"
      level: "high"
  channels:
    discord: "high"
    dashboard: "full"
  default_identity_trust: "none"

knowledge_store: "data/memory/entries.jsonl"  # Shared with Beki
operational_memory: "data/agents/besa/context.jsonl"
```

**Phase H compatibility**: Persona export = copy agent spec + filtered knowledge entries. No separate export mechanism needed.

#### W.9: Session Resume Per Task

**Problem**: Fresh Claude Code session per tick is expensive. ContextForge experience shows session resume gives ~90% cost reduction.

**Solution**: Store Claude Code session_id in TaskState. Resume within the same task. New task = new session. Invalidate if system prompt changes significantly.

```typescript
interface TaskState {
  // ... existing fields
  claudeSessionId?: string    // Resume across ticks
}
```

**Rules** (from ContextForge experience doc):
1. System prompt must match on resume — if homeostasis guidance changes significantly, clear session
2. Don't resend conversation history on resume — SDK has it cached
3. Invalidate on task phase change (exploring → implementing) since context shifts
4. On resume failure, clear session_id and retry fresh

**Gherkin**:

```gherkin
Feature: Session resume per task

  Scenario: Multi-tick task resumes session
    Given a TaskState in "implementing" phase with claudeSessionId "session-abc"
    When the next tick fires
    Then the coding adapter resumes session "session-abc"
    And only the new prompt is sent (not full history)

  Scenario: Phase change invalidates session
    Given a TaskState transitioning from "exploring" to "implementing"
    Then claudeSessionId is cleared
    And the next tick starts a fresh session

  Scenario: Session resume failure falls back to fresh
    Given a TaskState with claudeSessionId "session-expired"
    When the coding adapter fails to resume
    Then claudeSessionId is cleared
    And a fresh session is started with full context
    And progress from carryover is included in the prompt
```

### Tier 3: Complete Phase G Original Gaps

#### W.10: Work-to-Knowledge

**Problem**: When a task completes, progress and artifacts should become knowledge entries. Currently, only transcript → extraction exists (G.5). But structured "I completed X and produced Y" knowledge is not created.

**Solution**: On task completion (status → "done"), create KnowledgeEntries from progress[] and artifacts[]:

```typescript
// task.progress = ["Created branch feature/settings", "Implemented settings screen", "Added tests", "Created MR !45"]
// task.artifacts = [{type: "mr", url: "...", description: "Settings screen"}, {type: "branch", ...}]

// → KnowledgeEntry type: "fact"
//   content: "Completed: implement settings screen. Created app/settings.tsx, MR !45"
//   source: "task:task-123"
//   about: {entity: "beki", type: "agent"}

// → KnowledgeEntry type: "procedure" (if 3+ steps)
//   content: "Steps to implement a screen: 1. Create branch 2. Implement with NativeWind 3. Add tests 4. Create MR"
//   source: "task:task-123"
```

**Reference Scenario**: Trace 4 step 8 ("work-to-knowledge: create KnowledgeEntries from completed task"), Trace 10 (pattern generates skill from repeated procedures).

**Gherkin**:

```gherkin
Feature: Work-to-knowledge pipeline

  Scenario: Completed coding task creates knowledge entries
    Given a TaskState with status "done" and 4 progress entries
    When the work-to-knowledge pipeline runs
    Then a fact entry is created summarizing the completed work
    And the entry source is "task:{task-id}"
    And the entry about is {entity: agent-id, type: "agent"}

  Scenario: Repeated procedures promote to skill
    Given 3+ completed tasks with similar progress steps
    When the artifact generator runs
    Then a skill file is generated from the repeated pattern
    And the skill confidence is >= 0.85

  Scenario: Failed task creates self-observation
    Given a TaskState with status "done" but outcome "partial"
    When the work-to-knowledge pipeline runs
    Then a correction entry is created noting what went wrong
    And the entry about is {entity: agent-id, type: "agent"}
```

#### W.11: GitLab via glab CLI

**Problem**: Original plan (G.4) designed a GitLab channel adapter. Overkill for v1.

**Solution**: No adapter. Claude Code uses `glab` CLI directly through its shell tool. Agent spec includes `glab` in the system prompt context so Claude Code knows it's available.

Add to agent spec:
```yaml
tools_context: |
  You have access to the glab CLI for GitLab operations:
  - `glab issue list` — list issues
  - `glab issue view <id>` — view issue details
  - `glab mr create` — create merge request
  - `glab mr list` — list merge requests
  - `glab issue update <id> --label "in-progress"` — update issue status
```

GitLab webhooks (inbound MR comments, CI status) are Phase H scope. For now, agents poll or are told about GitLab events via Discord.

#### W.12: Fleet Control Dashboard & Homeostasis Observability

**Problem**: No way to answer "why did the agent do this?" Current dashboard shows real-time homeostasis state but doesn't persist assessments, link decisions to causes, or support multiple agents. Operational health (subscription limits, token burn, memory status) is invisible. Without this, debugging agent behavior during Beki/Besa validation is guesswork.

**Inspiration**: OpenAI Symphony's fleet control — but Symphony monitors stateless task workers. Galatea agents have internal cognitive state, so the dashboard must show *why* an agent acted, not just *what* it did.

**Solution**: Unified dashboard with three zoom levels + a persisted tick decision record.

##### Tick Decision Record

Every tick persists one structured record — the atomic unit of observability:

```typescript
interface TickDecisionRecord {
  tickId: string                    // UUID, propagates to all downstream ops
  agentId: string
  timestamp: string                 // ISO 8601

  // What triggered this tick
  trigger: {
    type: "message" | "heartbeat" | "internal"
    source?: string                 // "discord:sasha", "gitlab:webhook", etc.
    content?: string                // First 200 chars of message if applicable
  }

  // Homeostasis snapshot at tick start
  homeostasis: Record<string, {
    state: "LOW" | "HEALTHY" | "HIGH"
    method: "cached" | "computed" | "llm"
  }>

  // What guidance fired
  guidance: string[]                // ["ask before acting", "update status"]

  // Routing decision
  routing: {
    level: "interaction" | "task"
    taskType?: "coding" | "research" | "review" | "admin" | "communication"
    taskId?: string                 // If task created or continued
    reasoning: string               // LLM's one-line explanation
  }

  // Execution
  execution: {
    adapter: "claude-code" | "direct-response" | "none"
    sessionResumed: boolean
    sessionId?: string
    toolCalls: number
    durationMs: number
  }

  // Resources
  resources: {
    inputTokens: number
    outputTokens: number
    subscriptionUsage5h: number     // % at tick end
  }

  // Outcome
  outcome: {
    action: "respond" | "delegate" | "ask" | "idle" | "extract"
    response?: string               // First 200 chars
    artifactsCreated: string[]      // ["branch:feature/settings", "comment:!42#note_1"]
    knowledgeEntriesCreated: number
    taskPhaseChanged?: string       // "exploring → implementing"
  }
}
```

Storage: `data/observations/ticks/{agentId}.jsonl` — one file per agent, append-only.

The `tickId` is the correlation key — propagates into `emitEvent()` calls, Claude Code delegation, and knowledge extraction so the full chain is traceable from one ID.

##### Dashboard: Three Zoom Levels

**Level 1 — Fleet Overview** (`/agent/fleet`)

Grid of agent cards. Each card shows:
- Agent name + role (from spec YAML)
- Traffic light: overall health = worst homeostasis dimension
- Current activity: "implementing #101" / "idle" / "researching auth options"
- Last tick timestamp
- Mini sparkline of homeostasis trend (last ~20 ticks)
- Subscription usage bar (5-hour window %, from OAuth endpoint)
- Token burn rate (tokens/hour for current task)
- Memory status: knowledge store entry count + last extraction timestamp

Glance and know if something needs attention. Green = fine, yellow = check, red = intervene.

**Level 2 — Agent Detail** (`/agent/fleet/:agentId`)

Extends current agent status page with:
- **Decision timeline** — vertical list of recent ticks, each showing: trigger → homeostasis snapshot → guidance → action taken
- **Active task** with progress entries and artifacts
- **Resources panel**: subscription usage (5h + 7d windows with reset times), cumulative tokens for active task, session resume savings estimate
- **Memory panel**: knowledge store stats (total entries, by type, last ingestion, pending curation count), operational memory size, last decay run

**Level 3 — Tick Detail** (expandable from timeline)

Click any tick to see full causal chain:
1. What triggered this tick (message from Sasha? heartbeat? internal?)
2. Homeostasis assessment at tick start (all 7 dims + method)
3. Which guidance rules fired and why
4. LLM's routing decision (interaction vs task, which adapter) with reasoning
5. What Claude Code did (tool calls, duration, tokens)
6. Whether session was resumed or fresh (and why — "fresh: phase changed" vs "resumed: session-abc")
7. Outcome (response sent, artifact created, task phase changed)
8. Knowledge entries created/retrieved during this tick
9. Token cost for this specific tick (input/output breakdown)

This is the answer to "why did Beki ask instead of coding?"

##### Key Failure Modes Surfaced

| Symptom at Fleet Level | Drill-down reveals |
|---|---|
| Agent card turns red | Which dimension is unhealthy, since when (sparkline) |
| Subscription bar near 100% | Token attribution — which task burned the budget |
| "Idle" for too long | Heartbeat ticks firing but no pending messages, or stuck task |
| Memory count growing fast | Extraction running but no curation, pending queue backing up |
| Agent asking too much | certainty_alignment consistently LOW → guidance always fires "ask first" |

**Gherkin**:

```gherkin
Feature: Fleet control dashboard

  Scenario: Fleet overview shows all agents
    Given agents "beki" and "besa" are registered
    When the operator opens /agent/fleet
    Then both agents appear as cards with homeostasis traffic lights
    And subscription usage is shown on both cards (same account)

  Scenario: Drill into agent decision timeline
    Given agent "beki" has processed 10 ticks
    When the operator clicks on Beki's card
    Then the decision timeline shows 10 entries
    And each entry shows trigger → homeostasis → action

  Scenario: Explain why agent asked instead of acting
    Given Beki received "@Beki refactor the auth module"
    And certainty_alignment was LOW at tick start
    And guidance fired "ask before acting on architecture changes"
    When the operator expands this tick in the timeline
    Then the causal chain shows: message → certainty LOW → "ask first" guidance → agent asked clarifying question

  Scenario: Subscription limit approaching
    Given subscription 5-hour usage is at 85%
    When the operator views the fleet overview
    Then the subscription bar is yellow on all agent cards
    And a warning is visible: "85% of 5h budget used, resets at {time}"

  Scenario: Memory status shows stale extraction
    Given last extraction ran 48 hours ago
    When the operator views agent detail for Beki
    Then memory panel shows "Last extraction: 48h ago" in yellow
```

---

## Reference Scenarios: New Additions

These extend the existing REFERENCE_SCENARIOS.md to cover Beki/Besa validation.

### Trace 12: PM Assigns Research Task (Besa)

```
Sasha in Discord: "@Besa research auth options for the mobile app,
                    write up a comparison doc"

Besa receives message:
  → ChannelMessage { type: "task_assignment", channel: "discord" }

Tick fires:
  → Homeostasis: knowledge_sufficiency LOW (no auth research in store)
  → Guidance: "Research or ask"
  → LLM decides: this is a research task, not a quick question
  → TaskState created: { type: "research", status: "assigned" }

Besa delegates to Claude Code:
  → systemPrompt includes: identity + knowledge + "you have web search"
  → prompt: "Research auth options for Expo mobile app. Compare Clerk,
     Firebase Auth, Auth0. Write comparison to docs/research/auth-comparison.md"
  → Claude Code: web searches, reads docs, writes markdown file
  → Session completes with artifact: {type: "document", path: "docs/research/auth-comparison.md"}

Post-processing:
  → Task status → "done"
  → Work-to-knowledge: fact created "Researched auth options: Clerk recommended
    for Expo due to SDK quality and pricing"
  → Discord response: "Research complete. Comparison doc at docs/research/auth-comparison.md.
    Summary: Clerk recommended for Expo projects."
  → glab: no issue movement (no issue linked)
```

### Trace 13: PM Creates Sprint Tasks (Besa)

```
Sasha: "@Besa create tasks for sprint 12: user settings, push notifications,
         dark mode. Assign all to Beki."

Besa:
  → TaskState: { type: "admin", status: "assigned" }
  → Delegates to Claude Code with glab access
  → Claude Code runs:
    - glab issue create --title "User settings screen" --assignee beki --label sprint-12
    - glab issue create --title "Push notifications" --assignee beki --label sprint-12
    - glab issue create --title "Dark mode toggle" --assignee beki --label sprint-12
  → Artifacts: [{type: "issue", url: "...#102"}, {type: "issue", url: "...#103"}, {type: "issue", url: "...#104"}]
  → Discord: "Created 3 issues for sprint 12: #102, #103, #104. All assigned to Beki."
```

### Trace 14: Quick Status Check (Interaction, Not Task)

```
Sasha: "@Besa is MR !42 merged?"

Besa:
  → Tick processes message
  → LLM + homeostasis: this is a quick question, not a task
  → Delegates to Claude Code: `glab mr view 42 --output json`
  → Gets status: "merged"
  → Responds directly: "Yes, MR !42 was merged 2 hours ago."
  → No TaskState created. No artifacts. Single tick.
```

### Trace 15: Mid-Task Scope Change

```
Sasha: "@Beki implement user settings, issue #101"
Beki: "On it. Creating branch feature/user-settings."

  ... 45 minutes, Beki works across 3 ticks with session resume ...

Sasha: "@Beki also needs dark mode toggle"

Beki:
  → Existing TaskState found for #101
  → Scope change appended to description
  → claudeSessionId cleared (requirements changed)
  → New Claude Code session with carryover:
    "Continuing work on #101. Settings screen implemented.
     New requirement: add dark mode toggle."
  → Continues implementation
```

### Trace 16: Besa Reviews Beki's Work

```
Sasha: "@Besa review Beki's MR !42"

Besa:
  → TaskState: { type: "review", status: "assigned" }
  → Delegates to Claude Code:
    - glab mr view 42 --patch (gets diff)
    - Reads diff, checks against knowledge (null checks, test coverage)
    - glab mr note 42 --message "Missing null check on user.email, line 47"
  → Artifacts: [{type: "comment", url: "...!42#note_1"}]
  → Discord: "Review complete for !42. One issue found: missing null check.
    Comment posted on the MR."
  → Work-to-knowledge: "Reviewed MR !42. Found null check issue on user.email"
```

---

## Implementation Order

```
TIER 1: Wire what exists
  W.1  Discord inbound → tick pending queue
  W.2  Tick response → Discord outbound
  W.3  Fix ARCHITECTURE.md
  W.4  Fix test suite failures

TIER 2: Generalize the model
  W.5  Two-level task model (interaction vs task)
  W.6  TaskState type field + behavior routing
  W.7  General Artifact type
  W.8  Agent spec format (YAML)
  W.9  Session resume per task

TIER 3: Complete Phase G gaps + Observability
  W.10 Work-to-knowledge pipeline
  W.11 GitLab via glab CLI (system prompt context)
  W.12 Fleet control dashboard & homeostasis observability
  W.13 Teammate ontology (team directory + context injection)

VALIDATION:
  Deploy Beki + Besa on test project
  PM (Sasha) uses Discord to assign work
  Run Traces 12-16 manually
  Use fleet dashboard to debug agent behavior
  Evaluate: Does the architecture hold?
```

### Dependencies

```
W.1 ──► W.2 (inbound before outbound)
W.5 ──► W.6 (model before types)
W.6 ──► W.7 (types before artifacts)
W.8 ──► W.9 (spec before session management)
W.12 depends on W.8 (agent IDs from spec) + tick loop (W.1/W.2)
W.13 depends on W.1 (identity resolution needs inbound messages)

W.1+W.2 ──► VALIDATION (wiring must work)
W.5-W.9 ──► VALIDATION (model must exist)
W.10+W.11 ──► VALIDATION (nice to have, can validate without)
W.12 ──► VALIDATION (essential for debugging — build before validation)
```

**Parallelizable**: W.1+W.2 (wiring) || W.5-W.7 (model) || W.3+W.4 (fixes) || W.8 (spec) || W.13 (team directory)

**Note on W.12 priority**: W.12 is in Tier 3 by scope but should be built *before* validation starts. The tick decision record (backend) can ship with Tier 1 wiring. The dashboard UI can follow in Tier 3. Without observability, validating Beki/Besa means reading JSONL files by hand.

**Note on W.13 priority**: W.13 is lightweight (YAML files + identity resolver + context injection) and should be ready before validation. The team directory is prerequisite for realistic Beki/Besa scenarios — without it, the agent can't distinguish Sasha's questions from Kirill's directives.

---

## Phase H Compatibility

| Phase H Deliverable | How This Design Prepares |
|---|---|
| Persona export | Agent spec (W.8) IS the exportable persona. Export = spec + filtered knowledge. |
| Multi-agent instantiation | Agent IDs everywhere. Per-agent operational memory. Shared knowledge store. |
| Agent registry | Agent specs in `data/agents/*/spec.yaml`. Registry = scan directory. |
| Cross-agent patterns | Shared knowledge store. Work-to-knowledge (W.10) tags entries with agent source. |
| Relationship model | Trust in agent spec. Interaction history in knowledge store. Data accumulates. |

**No contradictions with Phase H.** Everything built here is additive and forward-compatible.

---

## What This Validates

If Beki and Besa work:
- **Homeostasis drives behavior** (not just decorates responses)
- **Heartbeat enables autonomy** (agent continues between messages)
- **Knowledge store is useful** (agent retrieves and applies learned facts)
- **Work-to-knowledge compounds** (agent gets smarter over time)
- **Task model generalizes** (developer + PM, coding + research + review)
- **Safety hooks work in production** (not just tests)
- **Fleet control enables debugging** (can trace any decision to its cause)
- **The Reynolds beta level is achievable** with this architecture

---

## Documents to Update

| Document | Action |
|----------|--------|
| `docs/ARCHITECTURE.md` | Fix implementation status table (W.3), add new components |
| `docs/ROADMAP.md` | Full rewrite — current state says Phase E/F are "Concept" |
| `docs/REFERENCE_SCENARIOS.md` | Add Traces 12-16 |
| `docs/KNOWN_GAPS.md` | Update gap status based on audit |
| `docs/CHANGELOG.md` | Add Phase F completion, Phase G progress, this design |

---

*Created: 2026-03-11*
*Context: Brainstorming session — Reynolds simulation framework, Beki/Besa validation personas, full architecture audit*
*Builds on: Phase G work execution plan, OpenClaw/Harness research, ContextForge Agent SDK experience*
