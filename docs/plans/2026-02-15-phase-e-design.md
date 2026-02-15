# Phase E: Launch & Observe

**Date**: 2026-02-15
**Status**: Design — awaiting approval
**Branch**: TBD (will use git worktree)
**Builds on**: Phase D (Formalize + Close the Loop)

**Goal**: Make Galatea usable and observable. Close every loop: shadow learning feeds knowledge, tick responds using it, dashboard shows what's happening, Discord provides a real channel. No more CLI-only testing.

**Principle**: "Complete, not prototype." Ship fewer features, but each one works end-to-end with tests.

---

## What Phase E Delivers

| Track | What | Why |
|-------|------|-----|
| 0. Phase D cleanup | Flip 4 test todos, fix rough edges | Clean foundation |
| 1. Agent plumbing | Message API, heartbeat, dispatcher, debug overrides | The loop needs wiring |
| 2. L2 assessment | LLM-based certainty_alignment + knowledge_application | 2/6 dimensions are stubs |
| 3. Memory decay | Confidence reduction over time, archival | Knowledge store grows unbounded |
| 4. Context compression | Abstract interface + sliding window impl | History blows context window (T3 gap) |
| 5. Claude Code provider fix | Fix CLI auth, remove fake API key, health check | Provider is broken at runtime |
| 6. Command center | 5 dashboard views in TanStack Start | Can't debug what you can't see |
| 7. Discord connector | Bot for inbound/outbound messaging | Real channel for the agent |

**What Phase E does NOT include:**
- L3 meta-assessment (needs L2 experience first)
- Memory consolidation / CLAUDE.md promotion (Phase F)
- SKILL.md auto-generation (Phase F)
- L4 strategic analysis (Phase F)
- LLM-based context summarization (Phase F — sliding window is enough for now)
- Config editing in UI (read-only for Phase E)

---

## Dependency Graph

```
Track 0: Phase D Cleanup (independent)

Track 1: Agent Plumbing ──→ Track 7: Discord Connector
                        ──→ Track 6: Command Center (agent status view needs plumbing APIs)

Track 2: L2 Assessment (independent, but visible in Track 6 dashboard)

Track 3: Memory Decay (independent, but visible in Track 6 knowledge browser)

Track 4: Context Compression (independent, used by chat.logic.ts)

Track 5: Claude Code Provider Fix (independent)

Track 6: Command Center (depends on Track 1 APIs existing)

Track 7: Discord Connector (depends on Track 1 message API + dispatcher)
```

**Parallelizable**: Tracks 0-5 are independent. Track 6 needs Track 1 APIs. Track 7 needs Track 1 + Track 6 tested.

**Build order**: 0 → (1, 2, 3, 4, 5 in parallel) → 6 → 7

---

## Directory Structure (new/modified files)

```
server/
├── agent/
│   ├── tick.ts                          # MODIFY — use dispatcher, decay trigger
│   ├── agent-state.ts                   # MODIFY — extend PendingMessage with metadata
│   ├── heartbeat.ts                     # NEW — scheduler
│   ├── dispatcher.ts                    # NEW — route responses by channel
│   └── types.ts                         # MODIFY — PendingMessage.metadata
├── context/
│   ├── compressor.ts                    # NEW — ContextCompressor interface
│   ├── sliding-window.ts               # NEW — SlidingWindowCompressor
│   └── __tests__/
│       └── sliding-window.test.ts       # NEW
├── engine/
│   ├── homeostasis-engine.ts            # MODIFY — add L2 assessors
│   ├── config.yaml                      # MODIFY — add decay, compression, discord config
│   └── config.ts                        # MODIFY — add new config sections
├── memory/
│   ├── knowledge-store.ts               # MODIFY — add lastRetrievedAt tracking
│   ├── fact-retrieval.ts                # MODIFY — update lastRetrievedAt on retrieval
│   ├── decay.ts                         # NEW — confidence decay + archival
│   └── __tests__/
│       └── decay.test.ts                # NEW
├── providers/
│   ├── claude-code.ts                   # MODIFY — fix auth model
│   └── config.ts                        # MODIFY — remove fake API key validation
├── discord/
│   ├── bot.ts                           # NEW — Discord.js client
│   ├── handlers.ts                      # NEW — message → pending, tick → reply
│   └── __tests__/
│       └── bot.test.ts                  # NEW
├── functions/
│   └── chat.logic.ts                    # MODIFY — add compression before LLM call
├── routes/api/agent/
│   ├── messages.post.ts                 # NEW — queue inbound message
│   ├── status.get.ts                    # NEW — agent state + homeostasis
│   ├── knowledge.get.ts                 # NEW — knowledge entries with search/filter
│   ├── trace.post.ts                    # NEW — run retrieval trace
│   ├── config.get.ts                    # NEW — current config values
│   └── debug/
│       └── homeostasis.post.ts          # NEW — dimension override
└── __tests__/integration/
    └── layer1-chat.test.ts              # MODIFY — flip todos
    └── layer2-extraction.test.ts        # MODIFY — flip todos

app/routes/
├── agent/
│   ├── index.tsx                        # NEW — agent status dashboard
│   ├── knowledge.tsx                    # NEW — knowledge browser
│   ├── trace.tsx                        # NEW — pipeline trace viewer
│   ├── config.tsx                       # NEW — config viewer
│   └── chat.tsx                         # NEW — direct messaging
```

---

## Track 0: Phase D Cleanup

**Files**: Integration test files (layer1, layer2)

4 integration tests currently marked `it.todo()` that test code already working:
- Layer 1: "retrieves MQTT facts when message mentions MQTT"
- Layer 1: "does NOT retrieve Alina's user model for developer chat"
- Layer 2: "extracted facts appear in next chat"
- Layer 2: "superseded entries filtered from context"

Change `it.todo()` → `it()`, run, verify green. Fix any assertion issues.

---

## Track 1: Agent Plumbing

### 1a. Message Ingestion API

**File**: `server/routes/api/agent/messages.post.ts`

```typescript
// POST /api/agent/messages
// Body: { from: string, channel: string, content: string, metadata?: Record<string, string> }
// Returns: { queued: true, message: PendingMessage }
```

Calls `addPendingMessage()` from agent-state.ts. Any channel connector (UI, Discord, curl) uses this same endpoint.

### 1b. PendingMessage Extension

**File**: `server/agent/types.ts`

Add `metadata` field for channel-specific routing:

```typescript
interface PendingMessage {
  from: string
  channel: string
  content: string
  receivedAt: string
  metadata?: Record<string, string>  // e.g., { discordChannelId: "123" }
}
```

### 1c. Response Dispatcher

**File**: `server/agent/dispatcher.ts`

After tick() returns a TickResult with `action_target: { channel, to }`, the dispatcher routes:

```typescript
interface ChannelHandler {
  send(target: ActionTarget, response: string, metadata?: Record<string, string>): Promise<void>
}

const handlers: Record<string, ChannelHandler> = {
  ui: uiHandler,       // store in agent state, SSE push
  discord: discordHandler,  // send via Discord bot client
  api: apiHandler,     // no-op (already returned in response)
}
```

Pluggable — Discord handler registered when bot starts, UI handler always available.

### 1d. Heartbeat Scheduler

**File**: `server/agent/heartbeat.ts`

```typescript
export function startHeartbeat(intervalMs: number): NodeJS.Timeout
export function stopHeartbeat(): void
```

- Calls `tick("heartbeat")` every N ms (default 30s, from config.yaml)
- Smart skip: no pending messages AND all dimensions HEALTHY → skip tick (save LLM calls)
- Dispatches response via dispatcher
- Starts on server startup, stops on shutdown
- Configurable: `heartbeat.enabled`, `heartbeat.interval_ms`, `heartbeat.skip_when_idle`

### 1e. Debug Overrides

**File**: `server/routes/api/agent/debug/homeostasis.post.ts`

```typescript
// POST /api/agent/debug/homeostasis
// Body: { dimension: Dimension, state: DimensionState, ttlMs?: number }
// Injects value into L0 cache with TTL (default: 5 minutes)
```

Reuses existing `updateCache()` from homeostasis-engine.ts. After TTL expires, normal assessment resumes. Exported `updateCache` and `clearCache` for debug use.

### 1f. Activity Log

**File**: `server/agent/agent-state.ts` (extend)

Add `activityLog: TickResult[]` to agent state. Keep last 50 entries. Each tick appends its result. Dashboard reads this for the activity feed.

---

## Track 2: L2 Homeostasis Assessment

**File**: `server/engine/homeostasis-engine.ts`

### Design

Two dimensions get LLM-based assessment:

**certainty_alignment**: "Does the agent's confidence match its action?"
- Input: current message, recent history, retrieved facts, current action
- LLM prompt asks: "Given what you know and what you're about to do, is your confidence appropriate?"
- Returns: LOW (uncertain but acting), HEALTHY (confidence matches stakes), HIGH (over-asking)

**knowledge_application**: "Is the agent balancing learning and doing?"
- Input: recent history, ratio of research-type vs action-type messages
- LLM prompt asks: "Is the agent researching too much or acting without learning?"
- Returns: LOW (acting blind), HEALTHY (learn-then-do), HIGH (analysis paralysis)

### Implementation

```typescript
async function assessL2Semantic(
  ctx: AgentContext,
  dimension: "certainty_alignment" | "knowledge_application",
  model: LanguageModel,
): Promise<DimensionState> {
  const prompt = buildL2Prompt(dimension, ctx)
  const result = await generateText({ model, prompt, maxTokens: 50 })
  return parseL2Result(result.text)  // extract LOW/HEALTHY/HIGH
}
```

- Uses Ollama (glm-4.7-flash) — fast, free, local
- Falls back to HEALTHY if Ollama unavailable (existing behavior, no regression)
- `assessment_method` changes from "computed" to "llm" when L2 runs
- L0 cache respects existing TTLs (1min certainty, 5min knowledge_application)
- Config: `homeostasis.l2.enabled`, `homeostasis.l2.model`, `homeostasis.l2.max_tokens`

### Prompt Design

Keep prompts minimal. The LLM assesses ONE dimension per call, returns ONE word (LOW/HEALTHY/HIGH) with brief reasoning. No complex structured output — just text parsing.

```
You are assessing an AI agent's psychological state.

Dimension: certainty_alignment
Question: Does the agent's confidence match its action?

Context:
- Current message: {message}
- Retrieved facts: {factCount} facts available
- Recent actions: {recentActions}

Respond with exactly one of: LOW, HEALTHY, HIGH
Then briefly explain why (1 sentence).
```

### Testing

- Mock LLM responses → verify state transitions
- Verify fallback to HEALTHY when Ollama down
- Verify cache behavior (L0 returns cached L2 result within TTL)
- Evaluation tests: extend homeostasis-evaluation.test.ts with L2 scenarios

---

## Track 3: Memory Decay

**File**: `server/memory/decay.ts`

### Design

Confidence decays for entries not retrieved recently. Based on Ebbinghaus forgetting curve (Reference Scenario 9).

**Formula**: `newConfidence = confidence × decay_factor ^ days_since_last_retrieval`

**Exemptions**: Entries with type "rule" never decay (hard rules are permanent).

**Archival**: When confidence drops below threshold, entry is archived (not deleted).

### New Field: lastRetrievedAt

**File**: `server/memory/types.ts`

```typescript
interface KnowledgeEntry {
  // ... existing fields ...
  lastRetrievedAt?: string  // ISO 8601, updated on retrieval
}
```

**File**: `server/memory/fact-retrieval.ts`

After `retrieveRelevantFacts()` returns entries, update `lastRetrievedAt` for matched entries. Batch write to store.

### Decay Job

```typescript
export async function runDecay(storePath: string): Promise<DecayResult> {
  const entries = await readEntries(storePath)
  const now = Date.now()
  const cfg = getDecayConfig()

  const updated: KnowledgeEntry[] = []
  const archived: KnowledgeEntry[] = []

  for (const entry of entries) {
    if (entry.type === "rule") continue  // exempt
    if (entry.supersededBy) continue     // already dead

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince = (now - lastRetrieved) / (1000 * 60 * 60 * 24)

    if (daysSince < cfg.decay_start_days) continue  // grace period

    const decayDays = daysSince - cfg.decay_start_days
    const newConfidence = entry.confidence * Math.pow(cfg.decay_factor, decayDays)

    if (newConfidence < cfg.archive_threshold) {
      archived.push({ ...entry, archivedAt: new Date().toISOString() })
    } else {
      updated.push({ ...entry, confidence: newConfidence })
    }
  }

  // Write back
  await writeEntries([...unchanged, ...updated, ...archived], storePath)
  return { decayed: updated.length, archived: archived.length }
}
```

### Trigger

Called from tick() after processing messages. Not every tick — configurable interval (default: once per hour). Tracked via `lastDecayRun` in agent state.

### Config

```yaml
memory:
  decay:
    enabled: true
    decay_start_days: 30        # grace period before decay begins
    decay_factor: 0.95          # per-day multiplier after grace period
    archive_threshold: 0.3      # archive below this confidence
    run_interval_minutes: 60    # how often to run decay check
    exempt_types: ["rule"]      # types that never decay
```

### Testing

- Entry created 60 days ago, never retrieved → confidence decays
- Entry retrieved yesterday → no decay
- Rule entry → exempt, never decays
- Entry below threshold → archived with `archivedAt` field
- Grace period respected (no decay within first 30 days)

---

## Track 4: Context Compression

### Abstract Interface

**File**: `server/context/compressor.ts`

```typescript
export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export interface CompressedContext {
  messages: Message[]
  dropped: number
  summary?: string          // optional summary of dropped content
  tokensUsed: number
}

export interface ContextCompressor {
  compress(
    messages: Message[],
    budgetTokens: number,
  ): Promise<CompressedContext>
}
```

### Sliding Window Implementation

**File**: `server/context/sliding-window.ts`

```typescript
export class SlidingWindowCompressor implements ContextCompressor {
  async compress(messages: Message[], budgetTokens: number): Promise<CompressedContext> {
    // 1. Estimate tokens per message (content.length / chars_per_token)
    // 2. Always keep first message (establishes context)
    // 3. Fill from newest to oldest until budget exhausted
    // 4. Drop middle messages that don't fit
    // 5. Return kept messages + stats
  }
}
```

**Token estimation**: Simple `content.length / 4` (configurable chars_per_token). Good enough for budgeting — exact counting isn't needed.

### Wiring into Chat

**File**: `server/functions/chat.logic.ts`

Before sending to LLM:

```typescript
const compressor = getCompressor()  // from config: "sliding_window"
const totalBudget = getModelBudget(modelName)  // from config per model
const systemTokens = estimateTokens(systemPrompt)
const reserveTokens = totalBudget * config.context.compression.reserve_ratio
const historyBudget = totalBudget - systemTokens - reserveTokens

const compressed = await compressor.compress(history, historyBudget)
// Use compressed.messages instead of raw history
```

### Config

```yaml
context:
  compression:
    strategy: "sliding_window"    # or "summarizing" (Phase F)
    chars_per_token: 4
    reserve_ratio: 0.10           # 10% for response generation
    model_budgets:
      "glm-4.7-flash:latest": 8192
      "gpt-oss:latest": 8192
      "sonnet": 200000
      default: 8192
```

### Future Strategies (not Phase E)

- `SummarizingCompressor` — LLM summarizes dropped messages
- `ZonedCompressor` — ContextForgeTS-style zone allocation
- `HybridCompressor` — sliding window + periodic summarization

### Testing

- 10 messages, budget fits 5 → keeps first + last 4, drops middle 5
- Budget fits all → no compression
- Empty history → returns empty
- Single message → always kept
- Token estimation within 20% of actual

---

## Track 5: Claude Code Provider Fix

**Files**: `server/providers/claude-code.ts`, `server/providers/config.ts`

### Changes

1. **Remove `ANTHROPIC_API_KEY` requirement** — the provider uses CLI auth (`claude login`), not API keys. The env var validation is misleading.

2. **Add CLI health check** to `checkSelfModel()`:

```typescript
// Instead of checking for ANTHROPIC_API_KEY:
async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    // Check if claude CLI is installed and authenticated
    const result = await execAsync("claude --version", { timeout: 5000 })
    return result.exitCode === 0
  } catch {
    return false
  }
}
```

3. **Update config validation** — Claude Code provider requires no env vars, just CLI authentication.

4. **Better error messages** — if provider selected but CLI not authenticated, throw descriptive error: "Claude Code provider requires `claude login`. Run it first."

5. **Update tests** — remove API key validation tests, add CLI detection tests.

6. **Update `.env.example`** — remove `ANTHROPIC_API_KEY` line, add comment about `claude login`.

---

## Track 6: Command Center

5 views in existing TanStack Start app using shadcn/ui.

### API Endpoints

```
GET  /api/agent/status          → { homeostasis, pendingMessages, lastTick, activityLog }
GET  /api/agent/knowledge       → { entries[], stats }  (query params: search, entity, type, showSuperseded)
POST /api/agent/trace           → { results[], trace: PipelineTrace }  (body: { query, entity? })
GET  /api/agent/config          → { sections: { retrieval, signal, dedup, ... } }
POST /api/agent/messages        → { queued: true, message }  (from Track 1)
POST /api/agent/debug/homeostasis → { updated: true }  (from Track 1)
```

### View 1: Agent Status (`/agent`)

Main dashboard:

- **Homeostasis gauges**: 6 dimensions as colored indicators (green=HEALTHY, yellow=LOW, red=HIGH). Shows assessment method (computed/llm/cached) and cache TTL remaining.
- **Debug controls**: Dropdown per dimension to force LOW/HIGH/HEALTHY with TTL selector. "Force tick" button.
- **Pending messages**: List with from/channel/time. Count badge.
- **Last tick result**: Action taken, response preview, facts used count, timing.
- **Activity log**: Scrollable list of recent tick results (last 50 from agent state).

### View 2: Knowledge Browser (`/agent/knowledge`)

- **Table**: All entries — columns: type, content (truncated), confidence, entities, source, about.
- **Search**: Full-text filter across content and entities.
- **Entity filter**: Dropdown from `distinctEntities()`. Select "alina" → see everything about Alina.
- **Type filter**: Tabs for fact/preference/rule/procedure/correction/decision.
- **Superseded toggle**: Show/hide superseded entries (default: hidden).
- **Archived toggle**: Show/hide archived entries (from decay).
- **Stats bar**: Total entries, by type count, entity count, archived count.
- **Confidence indicators**: Visual bar showing confidence level. Decaying entries show faded styling.

### View 3: Pipeline Trace (`/agent/trace`)

- **Query input**: Text field + optional entity field.
- **Run trace button**: POSTs to `/api/agent/trace`.
- **Stage waterfall**: Visual display of each stage (filter_superseded → entity_match → keyword_match → limit) with entry counts in/out.
- **Per-entry detail**: Expandable rows showing why each entry passed or was filtered, with similarity scores and keyword overlap values.
- **Auto-diagnosis**: When 0 results, shows diagnosis (no entities found, no keywords, keyword mismatch with closest entries).

### View 4: Config Viewer (`/agent/config`)

- **Grouped display**: Sections matching config.yaml (retrieval, signal, dedup, homeostasis, memory, context, stop_words).
- **Per-value display**: Key, current value, inline documentation from YAML comments.
- **Read-only** for Phase E. Future: editable fields + `resetConfigCache()`.

### View 5: Direct Messages (`/agent/chat`)

- **Chat interface**: Input field, send button.
- **Send**: POSTs to `/api/agent/messages` with `{ from: "dashboard", channel: "ui", content }`.
- **Response display**: Shows tick result when agent processes the message. Includes: action, response text, homeostasis state at time of processing, facts used.
- **Different from `/chat/$sessionId`**: That's direct LLM chat. This goes through the full tick() pipeline (homeostasis assessment, fact retrieval, action decision).

### Navigation

Add "Agent" link to main nav alongside existing chat. Agent views use nested routing under `/agent/*`.

---

## Track 7: Discord Connector

**File**: `server/discord/bot.ts`

### Inbound (Discord → Agent)

- Bot listens for DMs and @mentions in configured channels
- On message: `POST /api/agent/messages` with:
  ```json
  {
    "from": "username",
    "channel": "discord",
    "content": "message text",
    "metadata": {
      "discordChannelId": "123456",
      "discordMessageId": "789012",
      "discordGuildId": "345678"
    }
  }
  ```
- Ignores own messages and other bots
- Optional guild/channel filter from config

### Outbound (Agent → Discord)

- Dispatcher calls Discord handler when `action_target.channel === "discord"`
- Sends reply to channel ID from `metadata.discordChannelId`
- Typing indicator while tick is processing

### Running

- Same server process — bot client starts alongside Nitro
- `DISCORD_BOT_TOKEN` env var (or config.yaml)
- Graceful: no token = no bot start, everything else works, no hard dependency
- Reconnection handling for dropped WebSocket

### Config

```yaml
discord:
  enabled: true
  # token from DISCORD_BOT_TOKEN env var
  allowed_guilds: []       # empty = all guilds
  allowed_channels: []     # empty = all channels + DMs
  respond_to_dms: true
  respond_to_mentions: true
```

### Testing

- Mock discord.js Client
- Simulate inbound message → verify queued as PendingMessage with correct metadata
- Simulate tick response → verify bot sends to correct channel
- Verify bot ignores own messages
- Verify graceful startup without token

---

## Config Additions (config.yaml)

```yaml
# Add to existing config.yaml:

memory:
  decay:
    enabled: true
    decay_start_days: 30
    decay_factor: 0.95
    archive_threshold: 0.3
    run_interval_minutes: 60
    exempt_types: ["rule"]

context:
  compression:
    strategy: "sliding_window"
    chars_per_token: 4
    reserve_ratio: 0.10
    model_budgets:
      "glm-4.7-flash:latest": 8192
      "gpt-oss:latest": 8192
      "sonnet": 200000
      default: 8192

heartbeat:
  enabled: true
  interval_ms: 30000
  skip_when_idle: true

homeostasis:
  l2:
    enabled: true
    model: "glm-4.7-flash:latest"
    max_tokens: 50

discord:
  enabled: false
  respond_to_dms: true
  respond_to_mentions: true
  allowed_guilds: []
  allowed_channels: []
```

---

## Testing Strategy

### New Tests

| Track | Test File | What |
|-------|-----------|------|
| 0 | layer1-chat.test.ts | Flip 4 todos to green |
| 0 | layer2-extraction.test.ts | Flip todos to green |
| 1 | agent/heartbeat.test.ts | Scheduler fires, smart skip works |
| 1 | agent/dispatcher.test.ts | Routes to correct handler |
| 1 | routes/messages.post.test.ts | Queues message correctly |
| 2 | engine/homeostasis-l2.test.ts | L2 assessment, fallback, cache |
| 3 | memory/decay.test.ts | Decay formula, archival, exemptions |
| 4 | context/sliding-window.test.ts | Compression, budget, edge cases |
| 5 | providers/claude-code.test.ts | CLI detection, error messages |
| 7 | discord/bot.test.ts | Inbound/outbound, mock client |

### Integration Tests

- Send message via API → heartbeat fires → agent responds → response dispatched
- Extract knowledge → wait for decay interval → verify confidence reduced
- Long chat session → verify compression kicks in → no context overflow

### Existing Tests

All 163+ existing tests must continue passing. No regressions.

---

## Success Criteria

After Phase E:

- [ ] Talk to Galatea on Discord, get knowledge-informed response
- [ ] Send direct message via dashboard, see tick result with homeostasis + facts
- [ ] All 6 homeostasis dimensions produce real assessments (L1 computed or L2 LLM)
- [ ] Override a dimension to LOW in dashboard, see guidance appear in next tick
- [ ] Browse knowledge store in UI — search by entity, filter by type
- [ ] Run pipeline trace in UI — see why facts were/weren't retrieved
- [ ] View current config values with documentation in UI
- [ ] Watch entry confidence decay over days in knowledge browser
- [ ] Long chat session doesn't crash (compression prevents context overflow)
- [ ] Claude Code provider works with `claude login` (no fake API key)
- [ ] Heartbeat runs automatically, skips when idle
- [ ] 170+ tests passing (163 + 4 flipped + new tests)

---

## What's Ready for Phase F

After Phase E, the following are functional:
- **Full agent loop**: message → tick → retrieve → assess → respond → dispatch
- **All 6 dimensions**: L1 computed (4) + L2 LLM (2), observable in dashboard
- **Memory lifecycle**: extraction → retrieval → decay → archival (no consolidation yet)
- **Context management**: system prompt budget + history compression
- **Two channels**: Dashboard direct messages + Discord
- **Debugging**: Pipeline trace, config viewer, dimension overrides, activity log

Phase F will add:
- Memory consolidation (high-confidence → CLAUDE.md promotion)
- SKILL.md auto-generation (3+ repeated procedures)
- L3 meta-assessment (arbitrate L1 vs L2 disagreement)
- L4 strategic analysis (cross-session patterns)
- LLM-based context summarization (upgrade from sliding window)
- Heartbeat dashboard (real-time dimension visualization)
- Safety boundaries (knowledge store poisoning guard)
- Contradiction resolution (advanced supersession)
