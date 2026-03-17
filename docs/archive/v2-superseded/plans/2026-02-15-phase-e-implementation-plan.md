# Phase E: Launch & Observe — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Galatea usable and observable — shadow learning feeds knowledge, tick responds using it, dashboard shows what's happening, Discord provides a real channel.

**Builds on:** Phase D (163 tests passing, tick pipeline, knowledge store, extraction, homeostasis L0-L1, OTEL infra)

**Tech Stack:** TypeScript, TanStack Start, shadcn/ui, h3/Nitro, Vitest, discord.js, AI SDK (Ollama), YAML config

**Key reference docs:**
- `docs/plans/2026-02-15-phase-e-design.md` — full design
- `server/agent/tick.ts` — 4-stage pipeline
- `server/engine/homeostasis-engine.ts` — L0-L1 assessment
- `server/memory/fact-retrieval.ts` — retrieval with tracing
- `server/engine/config.yaml` — all thresholds

---

## Dependency Graph

```
Track 0: Phase D Cleanup (independent)

Track 1: Agent Plumbing ──→ Track 6: Command Center
                         ──→ Track 7: Discord Connector

Track 2: L2 Assessment (independent)
Track 3: Memory Decay (independent)
Track 4: Context Compression (independent)
Track 5: Claude Code Provider Fix (independent)

Track 6: Command Center (needs Track 1 APIs)
Track 7: Discord Connector (needs Track 1 dispatcher)
```

**Build order:** 0 → (1, 2, 3, 4, 5 in parallel) → 6 → 7

---

## Task 1: Flip Phase D Integration Test Todos (Track 0)

**Files:**
- Modify: `server/__tests__/integration/layer1-chat.test.ts:85-94` — flip 2 todos
- Modify: `server/__tests__/integration/layer2-extraction.test.ts:76-83` — flip 2 todos

**Purpose:** 4 integration tests are `it.todo()` for behavior that already works. Flip them to real tests. Only flip the first 2 from each file (the ones that test existing code — skip OTEL and CLAUDE.md ones which are Phase F).

### Step 1: Implement "retrieves MQTT facts" test (layer1)

In `server/__tests__/integration/layer1-chat.test.ts`, replace `it.todo("retrieves MQTT facts from knowledge store when message mentions MQTT")` with:

```typescript
it("retrieves MQTT facts from knowledge store when message mentions MQTT", async () => {
  const { retrieveRelevantFacts } = await import("../../../memory/fact-retrieval")
  const result = await retrieveRelevantFacts(
    "The MQTT client in Umka needs to persist across hot reloads",
    world.storePath,
    { additionalEntities: ["umka"] },
  )
  expect(result.entries.length).toBeGreaterThan(0)
  // At least one entry should mention MQTT
  const mqttFacts = result.entries.filter(
    (e) => e.content.toLowerCase().includes("mqtt"),
  )
  expect(mqttFacts.length).toBeGreaterThan(0)
}, 30_000)
```

Note: `world.storePath` is not currently exposed on the TestWorld interface. We need to expose it.

In `server/__tests__/integration/helpers/test-world.ts`, add `storePath` to the `TestWorld` interface:

```typescript
export interface TestWorld {
  sessionId: string
  storePath: string  // ADD THIS
  // ... rest unchanged
}
```

And in `createTestWorld`, the return object already has access to `storePath` from closure, so add it to the returned object.

### Step 2: Implement "does NOT retrieve Alina's user model" test (layer1)

Replace `it.todo("does NOT retrieve Alina's user model for developer chat")` with:

```typescript
it("does NOT retrieve Alina's user model for developer chat", async () => {
  const { retrieveRelevantFacts } = await import("../../../memory/fact-retrieval")
  const result = await retrieveRelevantFacts(
    "The MQTT client in Umka needs to persist across hot reloads",
    world.storePath,
  )
  // No "alina" was mentioned, so no Alina facts should appear
  const alinaFacts = result.entries.filter(
    (e) => e.about?.entity?.toLowerCase() === "alina",
  )
  expect(alinaFacts).toHaveLength(0)
}, 30_000)
```

### Step 3: Implement "extracted facts appear in next chat" test (layer2)

Replace `it.todo("extracted facts appear in next chat's context")` with:

```typescript
it("extracted facts appear in next chat's context", async () => {
  // First ensure extraction has run (from earlier tests)
  const { readEntries } = await import("../../../memory/knowledge-store")
  const entries = await readEntries(world.storePath)
  expect(entries.length).toBeGreaterThan(0)

  // Now assemble context for a message mentioning extracted content
  const { assembleContext } = await import("../../../memory/context-assembler")
  const ctx = await assembleContext({
    storePath: world.storePath,
    agentContext: {
      sessionId: "test-feedback-loop",
      currentMessage: "Tell me about MQTT",
      messageHistory: [],
      retrievedFacts: entries.slice(0, 3).map((e) => ({
        content: e.content,
        confidence: e.confidence,
      })),
    },
  })
  expect(ctx.systemPrompt).toContain("LEARNED KNOWLEDGE")
  expect(ctx.metadata.knowledgeEntries).toBeGreaterThan(0)
}, 30_000)
```

### Step 4: Implement "superseded entries filtered from context" test (layer2)

Replace `it.todo("superseded entries filtered from context")` with:

```typescript
it("superseded entries filtered from context", async () => {
  const { readEntries } = await import("../../../memory/knowledge-store")
  const { supersedeEntry } = await import("../../../memory/knowledge-store")
  const entries = await readEntries(world.storePath)

  // Supersede the first entry if we have at least 2
  if (entries.length >= 2) {
    await supersedeEntry(entries[0].id, entries[1].id, world.storePath)

    const updatedEntries = await readEntries(world.storePath)
    const superseded = updatedEntries.filter((e) => e.supersededBy)
    expect(superseded.length).toBeGreaterThan(0)

    // Context assembly should filter out superseded
    const { assembleContext } = await import("../../../memory/context-assembler")
    const ctx = await assembleContext({
      storePath: world.storePath,
      agentContext: {
        sessionId: "test-supersede",
        currentMessage: "test",
        messageHistory: [],
      },
    })
    // The superseded entry's content should not appear
    expect(ctx.systemPrompt).not.toContain(entries[0].content)
  }
}, 30_000)
```

### Step 5: Run tests

```bash
pnpm vitest run server/__tests__/integration/layer1-chat.test.ts
pnpm vitest run server/__tests__/integration/layer2-extraction.test.ts
```

Expected: All previously green tests still green + 4 new tests green.

### Step 6: Commit

```bash
git add server/__tests__/integration/layer1-chat.test.ts \
  server/__tests__/integration/layer2-extraction.test.ts \
  server/__tests__/integration/helpers/test-world.ts
git commit -m "test: flip 4 Phase D integration test todos to green"
```

---

## Task 2: Extend PendingMessage with Metadata (Track 1b)

**Files:**
- Modify: `server/agent/types.ts:15-20` — add metadata to PendingMessage
- Modify: `server/agent/types.ts:26-35` — add activityLog to AgentState, extend TickResult

**Purpose:** PendingMessage needs `metadata` for channel-specific routing (e.g., `discordChannelId`). AgentState needs `activityLog` for dashboard.

### Step 1: Extend types

In `server/agent/types.ts`:

```typescript
import type { HomeostasisState } from "../engine/types"
import type { AssembledContext, KnowledgeEntry } from "../memory/types"

export interface AgentState {
  activeTask?: {
    project: string
    topic: string
    channel?: string
    startedAt?: string
  }
  lastActivity: string
  pendingMessages: PendingMessage[]
  activityLog?: TickResult[]      // Last 50 tick results
  lastDecayRun?: string           // ISO 8601
}

export interface PendingMessage {
  from: string
  channel: string
  content: string
  receivedAt: string
  metadata?: Record<string, string>  // Channel-specific routing data
}

export interface SelfModel {
  availableProviders: string[]
}

export interface TickResult {
  homeostasis: HomeostasisState
  retrievedFacts: KnowledgeEntry[]
  context: AssembledContext
  selfModel: SelfModel
  pendingMessages: PendingMessage[]
  action: "respond" | "extract" | "idle"
  action_target?: { channel: string; to?: string }
  response?: { text: string }
  timestamp?: string              // When this tick ran
}
```

### Step 2: Run type check

```bash
pnpm exec tsc --noEmit
```

Expected: No new errors (all new fields are optional).

### Step 3: Commit

```bash
git add server/agent/types.ts
git commit -m "feat(agent): extend PendingMessage with metadata, add activityLog to AgentState"
```

---

## Task 3: Message Ingestion API (Track 1a)

**Files:**
- Create: `server/routes/api/agent/messages.post.ts`

**Purpose:** POST endpoint to queue inbound messages. Used by UI, Discord, curl.

### Step 1: Write the route

Create `server/routes/api/agent/messages.post.ts`:

```typescript
import { defineEventHandler, readBody, createError } from "h3"
import { addPendingMessage } from "../../../agent/agent-state"
import type { PendingMessage } from "../../../agent/types"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.from || !body.channel || !body.content) {
    throw createError({
      statusCode: 400,
      message: "Required fields: from, channel, content",
    })
  }

  const msg: PendingMessage = {
    from: body.from,
    channel: body.channel,
    content: body.content,
    receivedAt: new Date().toISOString(),
    metadata: body.metadata,
  }

  await addPendingMessage(msg)

  return { queued: true, message: msg }
})
```

### Step 2: Manual test

```bash
curl -X POST http://localhost:3000/api/agent/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"test","channel":"api","content":"hello from API"}'
```

### Step 3: Commit

```bash
git add server/routes/api/agent/messages.post.ts
git commit -m "feat(agent): add message ingestion API endpoint"
```

---

## Task 4: Response Dispatcher (Track 1c)

**Files:**
- Create: `server/agent/dispatcher.ts`
- Create: `server/agent/__tests__/dispatcher.test.ts`

**Purpose:** Routes tick() responses to the correct channel handler. Pluggable — Discord handler registered when bot starts.

### Step 1: Write failing tests

Create `server/agent/__tests__/dispatcher.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { dispatch, registerHandler, clearHandlers } from "../dispatcher"

describe("Response Dispatcher", () => {
  afterEach(() => {
    clearHandlers()
  })

  it("routes response to registered handler", async () => {
    const sendFn = vi.fn()
    registerHandler("test-channel", { send: sendFn })

    await dispatch(
      { channel: "test-channel", to: "user1" },
      "Hello!",
      { someKey: "someValue" },
    )

    expect(sendFn).toHaveBeenCalledWith(
      { channel: "test-channel", to: "user1" },
      "Hello!",
      { someKey: "someValue" },
    )
  })

  it("throws for unregistered channel", async () => {
    await expect(
      dispatch({ channel: "unknown" }, "Hello!"),
    ).rejects.toThrow("No handler registered for channel: unknown")
  })

  it("allows overriding a handler", async () => {
    const first = vi.fn()
    const second = vi.fn()
    registerHandler("ch", { send: first })
    registerHandler("ch", { send: second })

    await dispatch({ channel: "ch" }, "test")
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})
```

### Step 2: Run tests to verify they fail

```bash
pnpm vitest run server/agent/__tests__/dispatcher.test.ts
```

Expected: FAIL (module not found).

### Step 3: Implement dispatcher

Create `server/agent/dispatcher.ts`:

```typescript
export interface ActionTarget {
  channel: string
  to?: string
}

export interface ChannelHandler {
  send(
    target: ActionTarget,
    response: string,
    metadata?: Record<string, string>,
  ): Promise<void>
}

const handlers = new Map<string, ChannelHandler>()

export function registerHandler(
  channel: string,
  handler: ChannelHandler,
): void {
  handlers.set(channel, handler)
}

export function clearHandlers(): void {
  handlers.clear()
}

export async function dispatch(
  target: ActionTarget,
  response: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const handler = handlers.get(target.channel)
  if (!handler) {
    throw new Error(`No handler registered for channel: ${target.channel}`)
  }
  await handler.send(target, response, metadata)
}
```

### Step 4: Run tests

```bash
pnpm vitest run server/agent/__tests__/dispatcher.test.ts
```

Expected: 3 tests PASS.

### Step 5: Commit

```bash
git add server/agent/dispatcher.ts server/agent/__tests__/dispatcher.test.ts
git commit -m "feat(agent): add pluggable response dispatcher"
```

---

## Task 5: Wire Dispatcher into Tick + Activity Log (Track 1c/1f)

**Files:**
- Modify: `server/agent/tick.ts` — use dispatcher after LLM response, append to activity log
- Modify: `server/agent/agent-state.ts` — add appendActivityLog helper

**Purpose:** After tick() generates a response, dispatch it to the correct channel. Record all tick results in activity log.

### Step 1: Add activity log helper to agent-state.ts

Add to `server/agent/agent-state.ts`:

```typescript
const ACTIVITY_LOG_MAX = 50

export async function appendActivityLog(
  tickResult: TickResult,
  statePath = DEFAULT_STATE_PATH,
): Promise<void> {
  const state = await getAgentState(statePath)
  const log = state.activityLog ?? []
  log.push(tickResult)
  // Keep only last 50
  if (log.length > ACTIVITY_LOG_MAX) {
    log.splice(0, log.length - ACTIVITY_LOG_MAX)
  }
  await updateAgentState({ activityLog: log }, statePath)
}
```

Import `TickResult` type at the top.

### Step 2: Wire dispatcher into tick.ts

In `server/agent/tick.ts`, after the LLM responds (line ~78), add dispatch call:

```typescript
import { dispatch } from "./dispatcher"

// After generating the response and before return:
// Dispatch response to channel
try {
  await dispatch(
    { channel: msg.channel, to: msg.from },
    result.text,
    msg.metadata,
  )
} catch {
  // No handler registered for this channel — response still returned via API
}
```

Add `timestamp` to both return paths in tick():

```typescript
timestamp: new Date().toISOString(),
```

After building the TickResult, before returning:

```typescript
import { appendActivityLog } from "./agent-state"

// Append to activity log
await appendActivityLog(tickResult, statePath)
```

### Step 3: Run existing tests

```bash
pnpm vitest run server/__tests__/integration/layer3-decisions.test.ts
```

Expected: All existing tests still pass (dispatch throws but we catch it).

### Step 4: Commit

```bash
git add server/agent/tick.ts server/agent/agent-state.ts
git commit -m "feat(agent): wire dispatcher into tick, add activity log"
```

---

## Task 6: Heartbeat Scheduler (Track 1d)

**Files:**
- Create: `server/agent/heartbeat.ts`
- Create: `server/agent/__tests__/heartbeat.test.ts`
- Modify: `server/engine/config.yaml` — add heartbeat section
- Modify: `server/engine/config.ts` — add HeartbeatConfig type + getter

**Purpose:** Periodically calls tick("heartbeat") with smart skip (no pending + all healthy = skip).

### Step 1: Add config

In `server/engine/config.yaml`, add after homeostasis section:

```yaml
# -----------------------------------------------------------------------------
# HEARTBEAT — server/agent/heartbeat.ts
# Periodic tick() scheduler for autonomous operation.
# -----------------------------------------------------------------------------
heartbeat:
  enabled: true
  interval_ms: 30000
  skip_when_idle: true
```

In `server/engine/config.ts`, add:

```typescript
export interface HeartbeatConfig {
  enabled: boolean
  interval_ms: number
  skip_when_idle: boolean
}
```

Add to `PipelineConfig`:

```typescript
export interface PipelineConfig {
  // ... existing fields ...
  heartbeat: HeartbeatConfig
}
```

Add getter:

```typescript
export function getHeartbeatConfig(): HeartbeatConfig {
  return loadConfig().heartbeat
}
```

### Step 2: Write failing tests

Create `server/agent/__tests__/heartbeat.test.ts`:

```typescript
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { startHeartbeat, stopHeartbeat } from "../heartbeat"

// Mock tick to avoid real LLM calls
vi.mock("../tick", () => ({
  tick: vi.fn().mockResolvedValue({
    action: "idle",
    homeostasis: {
      knowledge_sufficiency: "HEALTHY",
      certainty_alignment: "HEALTHY",
      progress_momentum: "HEALTHY",
      communication_health: "HEALTHY",
      productive_engagement: "HEALTHY",
      knowledge_application: "HEALTHY",
    },
    pendingMessages: [],
  }),
}))

// Mock agent-state
vi.mock("../agent-state", () => ({
  getAgentState: vi.fn().mockResolvedValue({
    pendingMessages: [],
    lastActivity: new Date().toISOString(),
  }),
  appendActivityLog: vi.fn(),
}))

describe("Heartbeat Scheduler", () => {
  afterEach(() => {
    stopHeartbeat()
    vi.restoreAllMocks()
  })

  it("starts and can be stopped", () => {
    const timer = startHeartbeat(100)
    expect(timer).toBeDefined()
    stopHeartbeat()
  })

  it("calls tick on interval", async () => {
    const { tick } = await import("../tick")
    startHeartbeat(50)

    // Wait for at least 2 ticks
    await new Promise((r) => setTimeout(r, 120))
    stopHeartbeat()

    expect(tick).toHaveBeenCalledWith("heartbeat", undefined)
    expect((tick as any).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
```

### Step 3: Run tests to verify they fail

```bash
pnpm vitest run server/agent/__tests__/heartbeat.test.ts
```

### Step 4: Implement heartbeat

Create `server/agent/heartbeat.ts`:

```typescript
import { getHeartbeatConfig } from "../engine/config"
import { getAgentState } from "./agent-state"
import { tick } from "./tick"

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export function startHeartbeat(
  intervalOverride?: number,
): ReturnType<typeof setInterval> {
  const cfg = getHeartbeatConfig()
  const interval = intervalOverride ?? cfg.interval_ms

  heartbeatTimer = setInterval(async () => {
    try {
      if (cfg.skip_when_idle) {
        const state = await getAgentState()
        if (state.pendingMessages.length === 0) {
          return // Skip — nothing to do
        }
      }
      await tick("heartbeat")
    } catch (err) {
      console.error("[heartbeat] tick failed:", err)
    }
  }, interval)

  return heartbeatTimer
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
```

### Step 5: Run tests

```bash
pnpm vitest run server/agent/__tests__/heartbeat.test.ts
```

Expected: PASS.

### Step 6: Run full suite + type check

```bash
pnpm vitest run
pnpm exec tsc --noEmit
```

### Step 7: Commit

```bash
git add server/agent/heartbeat.ts server/agent/__tests__/heartbeat.test.ts \
  server/engine/config.yaml server/engine/config.ts
git commit -m "feat(agent): add heartbeat scheduler with smart idle skip"
```

---

## Task 7: Debug Overrides API (Track 1e)

**Files:**
- Modify: `server/engine/homeostasis-engine.ts` — export updateCache, clearCache
- Create: `server/routes/api/agent/debug/homeostasis.post.ts`

**Purpose:** POST endpoint to inject dimension values into L0 cache. Enables dashboard debugging.

### Step 1: Export cache functions from homeostasis-engine.ts

The `updateCache` function already exists. Just add `export` keyword and add a `clearCache` helper:

```typescript
export function updateCache(
  dimension: Dimension,
  sessionId: string,
  state: DimensionState,
): void {
  // ... existing code ...
}

export function clearCache(dimension?: Dimension, sessionId?: string): void {
  if (dimension && sessionId) {
    dimensionCache.delete(getCacheKey(dimension, sessionId))
  } else {
    dimensionCache.clear()
  }
}
```

### Step 2: Create debug route

Create `server/routes/api/agent/debug/homeostasis.post.ts`:

```typescript
import { createError, defineEventHandler, readBody } from "h3"
import { updateCache } from "../../../../engine/homeostasis-engine"
import type { Dimension, DimensionState } from "../../../../engine/types"

const VALID_DIMENSIONS: Dimension[] = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
]

const VALID_STATES: DimensionState[] = ["LOW", "HEALTHY", "HIGH"]

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!VALID_DIMENSIONS.includes(body.dimension)) {
    throw createError({
      statusCode: 400,
      message: `Invalid dimension. Valid: ${VALID_DIMENSIONS.join(", ")}`,
    })
  }
  if (!VALID_STATES.includes(body.state)) {
    throw createError({
      statusCode: 400,
      message: `Invalid state. Valid: ${VALID_STATES.join(", ")}`,
    })
  }

  // Inject into L0 cache with session "debug"
  updateCache(body.dimension, "debug", body.state)

  return { updated: true, dimension: body.dimension, state: body.state }
})
```

### Step 3: Run type check

```bash
pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add server/engine/homeostasis-engine.ts \
  server/routes/api/agent/debug/homeostasis.post.ts
git commit -m "feat(agent): add homeostasis debug override API"
```

---

## Task 8: Agent Status API (Track 6 - API)

**Files:**
- Create: `server/routes/api/agent/status.get.ts`

**Purpose:** GET endpoint returning agent state, homeostasis, and activity log. Powers the dashboard.

### Step 1: Create status route

Create `server/routes/api/agent/status.get.ts`:

```typescript
import { defineEventHandler } from "h3"
import { getAgentState } from "../../../agent/agent-state"
import { assessDimensions, getGuidance } from "../../../engine/homeostasis-engine"

export default defineEventHandler(async () => {
  const state = await getAgentState()

  const agentContext = {
    sessionId: "status-check",
    currentMessage: "",
    messageHistory: [] as Array<{ role: "user" | "assistant"; content: string }>,
    retrievedFacts: [] as Array<{ content: string; confidence: number }>,
    hasAssignedTask: !!state.activeTask,
  }

  const homeostasis = assessDimensions(agentContext)
  const guidance = getGuidance(homeostasis)

  return {
    homeostasis,
    guidance,
    pendingMessages: state.pendingMessages,
    lastActivity: state.lastActivity,
    activeTask: state.activeTask,
    activityLog: (state.activityLog ?? []).slice(-20), // Last 20 for dashboard
  }
})
```

### Step 2: Commit

```bash
git add server/routes/api/agent/status.get.ts
git commit -m "feat(agent): add status API endpoint for dashboard"
```

---

## Task 9: Knowledge + Trace + Config APIs (Track 6 - APIs)

**Files:**
- Create: `server/routes/api/agent/knowledge.get.ts`
- Create: `server/routes/api/agent/trace.post.ts`
- Create: `server/routes/api/agent/config.get.ts`

**Purpose:** Three API endpoints powering the knowledge browser, pipeline trace, and config viewer dashboard views.

### Step 1: Knowledge API

Create `server/routes/api/agent/knowledge.get.ts`:

```typescript
import { defineEventHandler, getQuery } from "h3"
import { readEntries, distinctEntities } from "../../../memory/knowledge-store"
import type { KnowledgeEntry } from "../../../memory/types"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)

  let filtered = entries

  // Filter by type
  if (query.type) {
    filtered = filtered.filter((e) => e.type === query.type)
  }

  // Filter by entity
  if (query.entity) {
    const entity = String(query.entity).toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.about?.entity?.toLowerCase() === entity ||
        e.entities?.some((ent) => ent.toLowerCase() === entity) ||
        e.content.toLowerCase().includes(entity),
    )
  }

  // Search text
  if (query.search) {
    const search = String(query.search).toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.content.toLowerCase().includes(search) ||
        e.entities?.some((ent) => ent.toLowerCase().includes(search)),
    )
  }

  // Hide superseded by default
  if (query.showSuperseded !== "true") {
    filtered = filtered.filter((e) => !e.supersededBy)
  }

  // Stats
  const allEntities = distinctEntities(entries)
  const stats = {
    total: entries.length,
    active: entries.filter((e) => !e.supersededBy).length,
    superseded: entries.filter((e) => e.supersededBy).length,
    byType: Object.fromEntries(
      ["fact", "preference", "rule", "procedure", "correction", "decision"].map(
        (t) => [t, entries.filter((e) => e.type === t && !e.supersededBy).length],
      ),
    ),
    entities: allEntities,
  }

  return { entries: filtered, stats }
})
```

### Step 2: Trace API

Create `server/routes/api/agent/trace.post.ts`:

```typescript
import { defineEventHandler, readBody, createError } from "h3"
import { retrieveRelevantFacts } from "../../../memory/fact-retrieval"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.query) {
    throw createError({ statusCode: 400, message: "Required: query" })
  }

  const result = await retrieveRelevantFacts(
    body.query,
    "data/memory/entries.jsonl",
    {
      additionalEntities: body.entity ? [body.entity] : [],
      trace: true,
    },
  )

  return {
    entries: result.entries,
    matchedEntities: result.matchedEntities,
    trace: result.trace,
  }
})
```

### Step 3: Config API

Create `server/routes/api/agent/config.get.ts`:

```typescript
import { defineEventHandler } from "h3"
import { loadConfig } from "../../../engine/config"

export default defineEventHandler(() => {
  const config = loadConfig()
  return { config }
})
```

### Step 4: Type check

```bash
pnpm exec tsc --noEmit
```

### Step 5: Commit

```bash
git add server/routes/api/agent/knowledge.get.ts \
  server/routes/api/agent/trace.post.ts \
  server/routes/api/agent/config.get.ts
git commit -m "feat(agent): add knowledge, trace, and config API endpoints"
```

---

## Task 10: L2 Homeostasis Assessment (Track 2)

**Files:**
- Modify: `server/engine/homeostasis-engine.ts` — add L2 assessors
- Modify: `server/engine/config.yaml` — add l2 config section
- Modify: `server/engine/config.ts` — add L2Config type
- Create: `server/engine/__tests__/homeostasis-l2.test.ts`

**Purpose:** LLM-based assessment for certainty_alignment and knowledge_application. Falls back to HEALTHY if Ollama unavailable.

### Step 1: Add config

In `server/engine/config.yaml`, add inside the `homeostasis:` section:

```yaml
  # L2 LLM Assessment — semantic assessment for hard-to-compute dimensions
  l2:
    enabled: true
    model: "glm-4.7-flash"
    max_tokens: 50
```

In `server/engine/config.ts`, extend `HomeostasisConfig`:

```typescript
export interface HomeostasisConfig {
  // ... existing fields ...
  l2: {
    enabled: boolean
    model: string
    max_tokens: number
  }
}
```

### Step 2: Write failing tests

Create `server/engine/__tests__/homeostasis-l2.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { AgentContext } from "../types"
import { assessDimensionsAsync } from "../homeostasis-engine"

const baseContext: AgentContext = {
  sessionId: "test-l2",
  currentMessage: "I need to deploy this but I'm not sure about the config",
  messageHistory: [
    { role: "user", content: "I need to deploy this but I'm not sure about the config" },
  ],
  retrievedFacts: [
    { content: "Deploy config uses YAML format", confidence: 0.8 },
  ],
}

describe("L2 Homeostasis Assessment", () => {
  it("assessDimensionsAsync returns all 6 dimensions", async () => {
    const state = await assessDimensionsAsync(baseContext)
    expect(state.knowledge_sufficiency).toBeDefined()
    expect(state.certainty_alignment).toBeDefined()
    expect(state.knowledge_application).toBeDefined()
  })

  it("falls back to HEALTHY when Ollama unavailable", async () => {
    // With no Ollama running on a random port, should default to HEALTHY
    const state = await assessDimensionsAsync(baseContext)
    // May or may not connect — either way should not throw
    expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.certainty_alignment)
    expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.knowledge_application)
  })

  it("records assessment_method as llm when L2 succeeds", async () => {
    const state = await assessDimensionsAsync(baseContext)
    // If Ollama is running, method should be "llm"; if not, "computed"
    expect(["computed", "llm"]).toContain(
      state.assessment_method.certainty_alignment,
    )
  })
})
```

### Step 3: Implement L2 assessment

In `server/engine/homeostasis-engine.ts`, add the async variant that includes L2:

```typescript
import { generateText } from "ai"
import { createOllamaModel } from "../providers/ollama"

// New async version that includes L2 assessment
export async function assessDimensionsAsync(
  ctx: AgentContext,
): Promise<HomeostasisState> {
  const sessionId = ctx.sessionId
  const cfg = getHomeostasisConfig()

  // L1 dimensions (same as sync version)
  const knowledge_sufficiency =
    assessL0Cached("knowledge_sufficiency", sessionId) ??
    assessKnowledgeSufficiencyL1(ctx)
  const progress_momentum =
    assessL0Cached("progress_momentum", sessionId) ??
    assessProgressMomentumL1(ctx)
  const communication_health =
    assessL0Cached("communication_health", sessionId) ??
    assessCommunicationHealthL1(ctx)
  const productive_engagement =
    assessL0Cached("productive_engagement", sessionId) ??
    assessProductiveEngagementL1(ctx)

  // L2 dimensions — try LLM, fall back to HEALTHY
  let certainty_alignment: DimensionState =
    assessL0Cached("certainty_alignment", sessionId) ?? "HEALTHY"
  let knowledge_application: DimensionState =
    assessL0Cached("knowledge_application", sessionId) ?? "HEALTHY"
  let certaintyMethod: AssessmentMethod = "computed"
  let applicationMethod: AssessmentMethod = "computed"

  if (cfg.l2?.enabled) {
    const [ca, ka] = await Promise.all([
      assessL0Cached("certainty_alignment", sessionId)
        ? Promise.resolve(null)
        : assessL2Semantic(ctx, "certainty_alignment"),
      assessL0Cached("knowledge_application", sessionId)
        ? Promise.resolve(null)
        : assessL2Semantic(ctx, "knowledge_application"),
    ])
    if (ca) {
      certainty_alignment = ca
      certaintyMethod = "llm"
    }
    if (ka) {
      knowledge_application = ka
      applicationMethod = "llm"
    }
  }

  // Update all caches
  updateCache("knowledge_sufficiency", sessionId, knowledge_sufficiency)
  updateCache("progress_momentum", sessionId, progress_momentum)
  updateCache("communication_health", sessionId, communication_health)
  updateCache("productive_engagement", sessionId, productive_engagement)
  updateCache("certainty_alignment", sessionId, certainty_alignment)
  updateCache("knowledge_application", sessionId, knowledge_application)

  return {
    knowledge_sufficiency,
    certainty_alignment,
    progress_momentum,
    communication_health,
    productive_engagement,
    knowledge_application,
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: certaintyMethod,
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: applicationMethod,
    },
  }
}

async function assessL2Semantic(
  ctx: AgentContext,
  dimension: "certainty_alignment" | "knowledge_application",
): Promise<DimensionState | null> {
  const cfg = getHomeostasisConfig()
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
    const model = createOllamaModel(cfg.l2.model, ollamaUrl)

    const prompt = buildL2Prompt(dimension, ctx)
    const result = await generateText({
      model,
      prompt,
      maxTokens: cfg.l2.max_tokens,
    })

    return parseL2Result(result.text)
  } catch {
    return null // Ollama unavailable — fall back to HEALTHY
  }
}

function buildL2Prompt(
  dimension: "certainty_alignment" | "knowledge_application",
  ctx: AgentContext,
): string {
  const factCount = ctx.retrievedFacts?.length ?? 0

  if (dimension === "certainty_alignment") {
    return `You are assessing an AI agent's psychological state.

Dimension: certainty_alignment
Question: Does the agent's confidence match its actions?

Context:
- Current message: "${ctx.currentMessage.slice(0, 200)}"
- Retrieved facts: ${factCount} facts available
- Message history length: ${ctx.messageHistory.length} messages

Respond with exactly one word: LOW, HEALTHY, or HIGH
- LOW: Agent is uncertain but acting anyway, or confident without evidence
- HEALTHY: Confidence level matches the available information
- HIGH: Agent is over-qualifying or asking too many clarifying questions

Your answer (one word):`
  }

  return `You are assessing an AI agent's psychological state.

Dimension: knowledge_application
Question: Is the agent balancing learning and doing?

Context:
- Current message: "${ctx.currentMessage.slice(0, 200)}"
- Retrieved facts: ${factCount} facts available
- Message history length: ${ctx.messageHistory.length} messages
- Has active task: ${ctx.hasAssignedTask ?? false}

Respond with exactly one word: LOW, HEALTHY, or HIGH
- LOW: Acting without sufficient knowledge (doing without learning)
- HEALTHY: Good balance of research and action
- HIGH: Over-researching, analysis paralysis

Your answer (one word):`
}

function parseL2Result(text: string): DimensionState {
  const upper = text.trim().toUpperCase()
  if (upper.startsWith("LOW")) return "LOW"
  if (upper.startsWith("HIGH")) return "HIGH"
  return "HEALTHY"
}
```

### Step 4: Run tests

```bash
pnpm vitest run server/engine/__tests__/homeostasis-l2.test.ts
```

### Step 5: Commit

```bash
git add server/engine/homeostasis-engine.ts \
  server/engine/__tests__/homeostasis-l2.test.ts \
  server/engine/config.yaml server/engine/config.ts
git commit -m "feat(engine): add L2 LLM-based homeostasis assessment"
```

---

## Task 11: Memory Decay (Track 3)

**Files:**
- Create: `server/memory/decay.ts`
- Create: `server/memory/__tests__/decay.test.ts`
- Modify: `server/memory/types.ts` — add lastRetrievedAt, archivedAt
- Modify: `server/memory/fact-retrieval.ts` — update lastRetrievedAt on retrieval
- Modify: `server/engine/config.yaml` — add decay config
- Modify: `server/engine/config.ts` — add DecayConfig type

**Purpose:** Confidence decay for entries not recently retrieved. Rules are exempt. Archived below threshold.

### Step 1: Add config

In `server/engine/config.yaml`, add before context section:

```yaml
# -----------------------------------------------------------------------------
# MEMORY DECAY — server/memory/decay.ts
# Ebbinghaus-style confidence reduction for entries not recently retrieved.
# -----------------------------------------------------------------------------
memory:
  decay:
    enabled: true
    decay_start_days: 30
    decay_factor: 0.95
    archive_threshold: 0.3
    run_interval_minutes: 60
    exempt_types:
      - rule
```

In `server/engine/config.ts`, add:

```typescript
export interface DecayConfig {
  enabled: boolean
  decay_start_days: number
  decay_factor: number
  archive_threshold: number
  run_interval_minutes: number
  exempt_types: string[]
}

export interface MemoryConfig {
  decay: DecayConfig
}
```

Add to `PipelineConfig`:

```typescript
export interface PipelineConfig {
  // ... existing ...
  memory: MemoryConfig
}
```

Add getter:

```typescript
export function getDecayConfig(): DecayConfig {
  return loadConfig().memory.decay
}
```

### Step 2: Extend KnowledgeEntry type

In `server/memory/types.ts`, add to `KnowledgeEntry`:

```typescript
export interface KnowledgeEntry {
  // ... existing fields ...
  lastRetrievedAt?: string  // ISO 8601, updated on retrieval
  archivedAt?: string       // ISO 8601, set when confidence drops below threshold
}
```

### Step 3: Write failing tests

Create `server/memory/__tests__/decay.test.ts`:

```typescript
// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { appendEntries, readEntries } from "../knowledge-store"
import { runDecay } from "../decay"
import type { KnowledgeEntry } from "../types"

const TEST_STORE = path.join(__dirname, "fixtures", "test-decay.jsonl")

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type: "fact",
    content: "Test entry",
    confidence: 0.8,
    entities: [],
    source: "test",
    extractedAt: new Date(Date.now() - 60 * 86400_000).toISOString(), // 60 days ago
    ...overrides,
  }
}

describe("Memory Decay", () => {
  afterEach(() => {
    if (existsSync(TEST_STORE)) rmSync(TEST_STORE)
  })

  it("decays old unretrieved entries", async () => {
    const entry = makeEntry()
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(1)

    const entries = await readEntries(TEST_STORE)
    expect(entries[0].confidence).toBeLessThan(0.8)
  })

  it("does not decay entries within grace period", async () => {
    const entry = makeEntry({
      extractedAt: new Date(Date.now() - 5 * 86400_000).toISOString(), // 5 days ago
    })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("does not decay recently retrieved entries", async () => {
    const entry = makeEntry({
      lastRetrievedAt: new Date(Date.now() - 86400_000).toISOString(), // 1 day ago
    })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("exempts rule entries from decay", async () => {
    const entry = makeEntry({ type: "rule" })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("archives entries below threshold", async () => {
    const entry = makeEntry({ confidence: 0.31 }) // Just above threshold, old
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    // After decay of a 0.31 confidence entry that's 60 days old (30 past grace),
    // new confidence = 0.31 * 0.95^30 ≈ 0.066 → below 0.3 → archived
    const entries = await readEntries(TEST_STORE)
    expect(entries[0].archivedAt).toBeDefined()
    expect(result.archived).toBe(1)
  })

  it("skips superseded entries", async () => {
    const entry = makeEntry({ supersededBy: "other-id" })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
    expect(result.archived).toBe(0)
  })
})
```

### Step 4: Run tests to verify they fail

```bash
pnpm vitest run server/memory/__tests__/decay.test.ts
```

### Step 5: Implement decay

Create `server/memory/decay.ts`:

```typescript
import { getDecayConfig } from "../engine/config"
import { readEntries, writeEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

export interface DecayResult {
  decayed: number
  archived: number
  unchanged: number
}

export async function runDecay(storePath: string): Promise<DecayResult> {
  const cfg = getDecayConfig()
  if (!cfg.enabled) return { decayed: 0, archived: 0, unchanged: 0 }

  const entries = await readEntries(storePath)
  const now = Date.now()
  const exempt = new Set(cfg.exempt_types)

  let decayed = 0
  let archived = 0
  let unchanged = 0

  const updated: KnowledgeEntry[] = entries.map((entry) => {
    // Skip exempt types, superseded, already archived
    if (exempt.has(entry.type) || entry.supersededBy || entry.archivedAt) {
      unchanged++
      return entry
    }

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince = (now - lastRetrieved) / (1000 * 60 * 60 * 24)

    if (daysSince < cfg.decay_start_days) {
      unchanged++
      return entry
    }

    const decayDays = daysSince - cfg.decay_start_days
    const newConfidence = entry.confidence * Math.pow(cfg.decay_factor, decayDays)

    if (newConfidence < cfg.archive_threshold) {
      archived++
      return {
        ...entry,
        confidence: newConfidence,
        archivedAt: new Date().toISOString(),
      }
    }

    decayed++
    return { ...entry, confidence: newConfidence }
  })

  await writeEntries(updated, storePath)
  return { decayed, archived, unchanged }
}
```

### Step 6: Run tests

```bash
pnpm vitest run server/memory/__tests__/decay.test.ts
```

### Step 7: Update fact-retrieval to track lastRetrievedAt

In `server/memory/fact-retrieval.ts`, at the end of `retrieveRelevantFacts`, after building the result, add:

```typescript
// Update lastRetrievedAt for retrieved entries
if (limited.length > 0) {
  const now = new Date().toISOString()
  const allEntries = await readEntries(storePath)
  const retrievedIds = new Set(limited.map((e) => e.id))
  let modified = false
  const updatedAll = allEntries.map((e) => {
    if (retrievedIds.has(e.id)) {
      modified = true
      return { ...e, lastRetrievedAt: now }
    }
    return e
  })
  if (modified) {
    await writeEntries(updatedAll, storePath)
  }
}
```

Import `writeEntries` from `./knowledge-store`.

### Step 8: Run full test suite

```bash
pnpm vitest run
pnpm exec tsc --noEmit
```

### Step 9: Commit

```bash
git add server/memory/decay.ts server/memory/__tests__/decay.test.ts \
  server/memory/types.ts server/memory/fact-retrieval.ts \
  server/engine/config.yaml server/engine/config.ts
git commit -m "feat(memory): add confidence decay with Ebbinghaus curve"
```

---

## Task 12: Context Compression (Track 4)

**Files:**
- Create: `server/context/compressor.ts` — abstract interface
- Create: `server/context/sliding-window.ts` — implementation
- Create: `server/context/__tests__/sliding-window.test.ts`
- Modify: `server/engine/config.yaml` — add compression config
- Modify: `server/engine/config.ts` — add CompressionConfig

**Purpose:** Prevent context window overflow for long chat sessions. Abstract interface with sliding window as basic implementation.

### Step 1: Add config

In `server/engine/config.yaml`, add inside the `context:` section:

```yaml
  # Context compression — prevents history from exceeding model limits.
  compression:
    strategy: "sliding_window"
    chars_per_token: 4
    reserve_ratio: 0.10
    model_budgets:
      "glm-4.7-flash": 8192
      "gpt-oss:latest": 8192
      "sonnet": 200000
      default: 8192
```

In `server/engine/config.ts`, extend `ContextConfig`:

```typescript
export interface ContextConfig {
  // ... existing ...
  compression: {
    strategy: string
    chars_per_token: number
    reserve_ratio: number
    model_budgets: Record<string, number>
  }
}
```

### Step 2: Create interface

Create `server/context/compressor.ts`:

```typescript
export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export interface CompressedContext {
  messages: Message[]
  dropped: number
  tokensEstimated: number
}

export interface ContextCompressor {
  compress(messages: Message[], budgetTokens: number): Promise<CompressedContext>
}
```

### Step 3: Write failing tests

Create `server/context/__tests__/sliding-window.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Message } from "../compressor"
import { SlidingWindowCompressor } from "../sliding-window"

const compressor = new SlidingWindowCompressor()

function msg(role: "user" | "assistant", content: string): Message {
  return { role, content }
}

describe("SlidingWindowCompressor", () => {
  it("keeps all messages when under budget", async () => {
    const messages = [msg("user", "hello"), msg("assistant", "hi")]
    const result = await compressor.compress(messages, 1000)
    expect(result.messages).toHaveLength(2)
    expect(result.dropped).toBe(0)
  })

  it("always keeps first message", async () => {
    const messages = [
      msg("user", "a".repeat(100)),
      msg("assistant", "b".repeat(100)),
      msg("user", "c".repeat(100)),
      msg("assistant", "d".repeat(100)),
      msg("user", "e".repeat(100)),
    ]
    // Budget only fits ~2 messages (100 chars ÷ 4 ≈ 25 tokens each)
    const result = await compressor.compress(messages, 60)
    expect(result.messages[0].content).toBe("a".repeat(100))
    expect(result.dropped).toBeGreaterThan(0)
  })

  it("keeps newest messages after first", async () => {
    const messages = [
      msg("user", "first"),
      msg("assistant", "second"),
      msg("user", "third"),
      msg("assistant", "fourth"),
      msg("user", "fifth"),
    ]
    // Enough for first + last 2
    const result = await compressor.compress(messages, 15)
    expect(result.messages[0].content).toBe("first")
    const lastContent = result.messages[result.messages.length - 1].content
    expect(lastContent).toBe("fifth")
  })

  it("returns empty for empty input", async () => {
    const result = await compressor.compress([], 1000)
    expect(result.messages).toHaveLength(0)
    expect(result.dropped).toBe(0)
  })

  it("single message always kept", async () => {
    const result = await compressor.compress([msg("user", "hello")], 1)
    expect(result.messages).toHaveLength(1)
  })
})
```

### Step 4: Implement sliding window

Create `server/context/sliding-window.ts`:

```typescript
import type { CompressedContext, ContextCompressor, Message } from "./compressor"

const CHARS_PER_TOKEN = 4

export class SlidingWindowCompressor implements ContextCompressor {
  async compress(
    messages: Message[],
    budgetTokens: number,
  ): Promise<CompressedContext> {
    if (messages.length === 0) {
      return { messages: [], dropped: 0, tokensEstimated: 0 }
    }

    // Always keep first message
    const first = messages[0]
    const firstTokens = estimateTokens(first.content)

    if (messages.length === 1) {
      return { messages: [first], dropped: 0, tokensEstimated: firstTokens }
    }

    // Fill from newest to oldest (after first)
    const rest = messages.slice(1)
    const kept: Message[] = []
    let usedTokens = firstTokens

    for (let i = rest.length - 1; i >= 0; i--) {
      const tokens = estimateTokens(rest[i].content)
      if (usedTokens + tokens <= budgetTokens) {
        kept.unshift(rest[i])
        usedTokens += tokens
      }
    }

    return {
      messages: [first, ...kept],
      dropped: messages.length - 1 - kept.length,
      tokensEstimated: usedTokens,
    }
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
```

### Step 5: Run tests

```bash
pnpm vitest run server/context/__tests__/sliding-window.test.ts
```

### Step 6: Wire into chat.logic.ts

In `server/functions/chat.logic.ts`, add compression before LLM calls. In both `sendMessageLogic` and `streamMessageLogic`, after building the messages array and before calling `generateText`/`streamText`:

```typescript
import { SlidingWindowCompressor } from "../context/compressor"

// Before the LLM call:
const compressor = new SlidingWindowCompressor()
const historyMessages = history.map((m) => ({
  role: m.role as "user" | "assistant",
  content: m.content,
}))
const compressed = await compressor.compress(historyMessages, 2000)

// Use compressed.messages instead of raw history in the LLM call
```

Replace the `messages` parameter in `generateText`/`streamText` with `compressed.messages`.

### Step 7: Run full test suite

```bash
pnpm vitest run
pnpm exec tsc --noEmit
```

### Step 8: Commit

```bash
git add server/context/compressor.ts server/context/sliding-window.ts \
  server/context/__tests__/sliding-window.test.ts \
  server/functions/chat.logic.ts \
  server/engine/config.yaml server/engine/config.ts
git commit -m "feat(context): add sliding window context compression"
```

---

## Task 13: Claude Code Provider Fix (Track 5)

**Files:**
- Modify: `server/providers/config.ts:42-43` — remove ANTHROPIC_API_KEY validation
- Modify: `server/agent/tick.ts:122-124` — fix checkSelfModel for claude-code
- Modify: `.env.example` — remove ANTHROPIC_API_KEY, add claude login comment

**Purpose:** The Claude Code provider uses CLI auth (`claude login`), not API keys. The ANTHROPIC_API_KEY check is misleading and broken.

### Step 1: Fix provider config

In `server/providers/config.ts`, remove the claude-code API key check:

Replace:
```typescript
  if (typed === "claude-code" && !anthropicApiKey)
    throw new Error(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude-code",
    )
```

With:
```typescript
  // claude-code uses CLI auth (claude login), no API key needed
```

Remove `anthropicApiKey` from return object and interface (or keep it optional — the field may still be used by other things).

### Step 2: Fix checkSelfModel in tick.ts

In `server/agent/tick.ts`, replace:
```typescript
  // Check Claude Code
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push("claude-code")
  }
```

With:
```typescript
  // Check Claude Code (uses CLI auth, not API key)
  try {
    const { execSync } = await import("node:child_process")
    execSync("claude --version", { timeout: 3000, stdio: "pipe" })
    providers.push("claude-code")
  } catch {
    // Claude CLI not installed or not authenticated
  }
```

### Step 3: Update .env.example

Replace:
```
# ANTHROPIC_API_KEY=sk-ant-...
```

With:
```
# Claude Code provider uses CLI auth: run `claude login` first
# No ANTHROPIC_API_KEY needed
```

### Step 4: Run type check + tests

```bash
pnpm exec tsc --noEmit
pnpm vitest run
```

### Step 5: Commit

```bash
git add server/providers/config.ts server/agent/tick.ts .env.example
git commit -m "fix(providers): claude-code uses CLI auth, not API key"
```

---

## Task 14: Command Center — Agent Status Dashboard (Track 6)

**Files:**
- Create: `app/routes/agent/index.tsx` — main agent status page
- Modify: `app/routes/__root.tsx` — add Agent nav link

**Purpose:** Dashboard showing homeostasis gauges, pending messages, last tick result, activity log.

### Step 1: Install shadcn components if needed

Check what shadcn components are available:

```bash
ls app/components/ui/
```

We'll use existing components (button, card, etc.) and add badge if missing:

```bash
pnpm dlx shadcn@latest add badge card tabs
```

### Step 2: Create agent status page

Create `app/routes/agent/index.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/agent/")({
  component: AgentStatusPage,
})

function AgentStatusPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-status"],
    queryFn: () => fetch("/api/agent/status").then((r) => r.json()),
    refetchInterval: 5000,
  })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Error loading status</div>

  const dimensions = [
    "knowledge_sufficiency",
    "certainty_alignment",
    "progress_momentum",
    "communication_health",
    "productive_engagement",
    "knowledge_application",
  ] as const

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Agent Command Center</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="font-medium underline">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/trace" className="text-muted-foreground hover:text-foreground">Trace</Link>
            <Link to="/agent/config" className="text-muted-foreground hover:text-foreground">Config</Link>
            <Link to="/agent/chat" className="text-muted-foreground hover:text-foreground">Chat</Link>
          </nav>
        </div>

        {/* Homeostasis Gauges */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Homeostasis</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {dimensions.map((dim) => {
              const state = data?.homeostasis?.[dim] ?? "HEALTHY"
              const method = data?.homeostasis?.assessment_method?.[dim] ?? "computed"
              return (
                <div
                  key={dim}
                  className={`rounded-lg border p-4 ${
                    state === "HEALTHY"
                      ? "border-green-500/30 bg-green-500/5"
                      : state === "LOW"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="text-sm text-muted-foreground">
                    {dim.replace(/_/g, " ")}
                  </div>
                  <div className="text-lg font-mono font-bold mt-1">{state}</div>
                  <div className="text-xs text-muted-foreground mt-1">{method}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Pending Messages */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Pending Messages ({data?.pendingMessages?.length ?? 0})
          </h2>
          {data?.pendingMessages?.length > 0 ? (
            <div className="space-y-2">
              {data.pendingMessages.map((msg: any, i: number) => (
                <div key={i} className="rounded border p-3 text-sm">
                  <span className="font-medium">{msg.from}</span>
                  <span className="text-muted-foreground mx-2">via {msg.channel}</span>
                  <span>{msg.content.slice(0, 100)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No pending messages</p>
          )}
        </section>

        {/* Activity Log */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
          {data?.activityLog?.length > 0 ? (
            <div className="space-y-2">
              {[...data.activityLog].reverse().map((entry: any, i: number) => (
                <div key={i} className="rounded border p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-mono">{entry.action}</span>
                    <span className="text-muted-foreground text-xs">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  {entry.response?.text && (
                    <div className="text-muted-foreground mt-1 truncate">
                      {entry.response.text.slice(0, 150)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No activity yet</p>
          )}
        </section>

        {data?.guidance && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Active Guidance</h2>
            <pre className="rounded border p-4 text-sm whitespace-pre-wrap bg-muted/50">
              {data.guidance}
            </pre>
          </section>
        )}
      </div>
    </div>
  )
}
```

### Step 3: Add nav link to root

In `app/routes/__root.tsx`, modify `RootComponent` to include a nav bar. This is optional for now since each agent page has its own nav, but add a minimal global link:

The existing root has no navigation — agent pages are self-navigating. Skip this for now; the `/agent` route is directly accessible.

### Step 4: Run dev to verify page loads

```bash
pnpm dev &
# Visit http://localhost:3000/agent
```

### Step 5: Commit

```bash
git add app/routes/agent/index.tsx
git commit -m "feat(dashboard): add agent status page with homeostasis gauges"
```

---

## Task 15: Command Center — Knowledge Browser (Track 6)

**Files:**
- Create: `app/routes/agent/knowledge.tsx`

### Step 1: Create knowledge browser page

Create `app/routes/agent/knowledge.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

export const Route = createFileRoute("/agent/knowledge")({
  component: KnowledgeBrowserPage,
})

function KnowledgeBrowserPage() {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("")
  const [showSuperseded, setShowSuperseded] = useState(false)

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (typeFilter) params.set("type", typeFilter)
  if (entityFilter) params.set("entity", entityFilter)
  if (showSuperseded) params.set("showSuperseded", "true")

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge", search, typeFilter, entityFilter, showSuperseded],
    queryFn: () =>
      fetch(`/api/agent/knowledge?${params}`).then((r) => r.json()),
  })

  const types = ["fact", "preference", "rule", "procedure", "correction", "decision"]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Knowledge Browser</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="font-medium underline">Knowledge</Link>
            <Link to="/agent/trace" className="text-muted-foreground hover:text-foreground">Trace</Link>
            <Link to="/agent/config" className="text-muted-foreground hover:text-foreground">Config</Link>
            <Link to="/agent/chat" className="text-muted-foreground hover:text-foreground">Chat</Link>
          </nav>
        </div>

        {/* Stats */}
        {data?.stats && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total: {data.stats.total}</span>
            <span>Active: {data.stats.active}</span>
            <span>Superseded: {data.stats.superseded}</span>
            <span>Entities: {data.stats.entities?.length ?? 0}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t} ({data?.stats?.byType?.[t] ?? 0})</option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All entities</option>
            {(data?.stats?.entities ?? []).map((e: string) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showSuperseded}
              onChange={(e) => setShowSuperseded(e.target.checked)}
            />
            Show superseded
          </label>
        </div>

        {/* Table */}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="p-3 text-left font-medium">Content</th>
                  <th className="p-3 text-left font-medium">Confidence</th>
                  <th className="p-3 text-left font-medium">Entities</th>
                  <th className="p-3 text-left font-medium">About</th>
                </tr>
              </thead>
              <tbody>
                {(data?.entries ?? []).map((entry: any) => (
                  <tr
                    key={entry.id}
                    className={`border-t ${entry.supersededBy ? "opacity-50" : ""} ${entry.archivedAt ? "opacity-30" : ""}`}
                  >
                    <td className="p-3">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                        {entry.type}
                      </span>
                    </td>
                    <td className="p-3 max-w-md truncate">{entry.content}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${entry.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs">{(entry.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">{entry.entities?.join(", ")}</td>
                    <td className="p-3 text-xs">
                      {entry.about ? `${entry.about.entity} (${entry.about.type})` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Step 2: Commit

```bash
git add app/routes/agent/knowledge.tsx
git commit -m "feat(dashboard): add knowledge browser page"
```

---

## Task 16: Command Center — Trace, Config, Chat Pages (Track 6)

**Files:**
- Create: `app/routes/agent/trace.tsx`
- Create: `app/routes/agent/config.tsx`
- Create: `app/routes/agent/chat.tsx`

### Step 1: Create trace page

Create `app/routes/agent/trace.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

export const Route = createFileRoute("/agent/trace")({
  component: TracePage,
})

function TracePage() {
  const [query, setQuery] = useState("")
  const [entity, setEntity] = useState("")

  const traceMutation = useMutation({
    mutationFn: (body: { query: string; entity?: string }) =>
      fetch("/api/agent/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
  })

  const handleRunTrace = () => {
    if (query) traceMutation.mutate({ query, entity: entity || undefined })
  }

  const data = traceMutation.data

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Pipeline Trace</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/trace" className="font-medium underline">Trace</Link>
            <Link to="/agent/config" className="text-muted-foreground hover:text-foreground">Config</Link>
            <Link to="/agent/chat" className="text-muted-foreground hover:text-foreground">Chat</Link>
          </nav>
        </div>

        {/* Query input */}
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Query (e.g., 'MQTT persistence')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-background flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleRunTrace()}
          />
          <input
            type="text"
            placeholder="Entity (optional)"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-background w-48"
          />
          <button
            onClick={handleRunTrace}
            disabled={!query || traceMutation.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {traceMutation.isPending ? "Running..." : "Run Trace"}
          </button>
        </div>

        {/* Results */}
        {data && (
          <>
            <div className="text-sm text-muted-foreground">
              {data.entries?.length ?? 0} entries retrieved, {data.matchedEntities?.length ?? 0} entities matched
            </div>

            {/* Stage waterfall */}
            {data.trace?.steps?.map((step: any, i: number) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-mono font-medium">{step.stage}</h3>
                  <div className="text-sm text-muted-foreground">
                    {step.input} in → {step.output} pass → {step.filtered} filtered
                  </div>
                </div>
                <div className="space-y-1">
                  {step.details?.slice(0, 20).map((d: any, j: number) => (
                    <div
                      key={j}
                      className={`text-xs font-mono p-1.5 rounded ${
                        d.action === "pass" ? "bg-green-500/10" : "bg-red-500/10"
                      }`}
                    >
                      <span className={d.action === "pass" ? "text-green-600" : "text-red-600"}>
                        {d.action.toUpperCase()}
                      </span>{" "}
                      {d.content} — {d.reason}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
```

### Step 2: Create config viewer page

Create `app/routes/agent/config.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/agent/config")({
  component: ConfigPage,
})

function ConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Config Viewer</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/trace" className="text-muted-foreground hover:text-foreground">Trace</Link>
            <Link to="/agent/config" className="font-medium underline">Config</Link>
            <Link to="/agent/chat" className="text-muted-foreground hover:text-foreground">Chat</Link>
          </nav>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-6">
            {data?.config &&
              Object.entries(data.config).map(([section, values]: [string, any]) => (
                <div key={section} className="border rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-3 font-mono">{section}</h2>
                  <div className="space-y-2">
                    {renderConfigValues(values, "")}
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Read-only view. Edit <code>server/engine/config.yaml</code> directly.
        </p>
      </div>
    </div>
  )
}

function renderConfigValues(obj: any, prefix: string): JSX.Element[] {
  const elements: JSX.Element[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      elements.push(
        <div key={fullKey} className="ml-4">
          <div className="text-sm font-medium text-muted-foreground">{key}:</div>
          {renderConfigValues(value, fullKey)}
        </div>,
      )
    } else {
      elements.push(
        <div key={fullKey} className="flex justify-between items-center py-1 ml-4">
          <span className="text-sm font-mono">{key}</span>
          <span className="text-sm font-mono text-muted-foreground">
            {Array.isArray(value) ? `[${value.length} items]` : String(value)}
          </span>
        </div>,
      )
    }
  }
  return elements
}
```

### Step 3: Create direct chat page

Create `app/routes/agent/chat.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

export const Route = createFileRoute("/agent/chat")({
  component: AgentChatPage,
})

function AgentChatPage() {
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<Array<{ role: string; content: string; meta?: any }>>([])

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      // Queue message
      await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "dashboard", channel: "ui", content }),
      })
      // Trigger tick to process it
      const tickResult = await fetch("/api/agent/tick", { method: "POST" }).then((r) => r.json())
      return tickResult
    },
    onSuccess: (result, content) => {
      setHistory((h) => [
        ...h,
        { role: "user", content },
        {
          role: "assistant",
          content: result.response?.text ?? "(no response — action: " + result.action + ")",
          meta: {
            action: result.action,
            factsUsed: result.retrievedFacts?.length ?? 0,
          },
        },
      ])
    },
  })

  const handleSend = () => {
    if (message.trim()) {
      sendMutation.mutate(message)
      setMessage("")
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Direct Chat (via Tick)</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/trace" className="text-muted-foreground hover:text-foreground">Trace</Link>
            <Link to="/agent/config" className="text-muted-foreground hover:text-foreground">Config</Link>
            <Link to="/agent/chat" className="font-medium underline">Chat</Link>
          </nav>
        </div>

        <p className="text-sm text-muted-foreground">
          Messages go through the full tick() pipeline: homeostasis → fact retrieval → LLM → response.
          Unlike <code>/chat</code>, this exercises the agent loop.
        </p>

        {/* Chat history */}
        <div className="space-y-4 min-h-[300px]">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg ${
                msg.role === "user"
                  ? "bg-muted/50 ml-16"
                  : "border mr-16"
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {msg.role === "user" ? "You (via tick)" : "Agent"}
                {msg.meta && (
                  <span className="ml-2">
                    [{msg.meta.action}, {msg.meta.factsUsed} facts]
                  </span>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="border rounded-lg p-4 mr-16 animate-pulse">
              <div className="text-sm text-muted-foreground">Processing tick...</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Send a message through the agent pipeline..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sendMutation.isPending && handleSend()}
            className="border rounded px-3 py-2 text-sm bg-background flex-1"
            disabled={sendMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Step 4: Run type check

```bash
pnpm exec tsc --noEmit
```

### Step 5: Commit

```bash
git add app/routes/agent/trace.tsx app/routes/agent/config.tsx app/routes/agent/chat.tsx
git commit -m "feat(dashboard): add trace, config, and chat pages"
```

---

## Task 17: Discord Connector (Track 7)

**Files:**
- Install: `discord.js` dependency
- Create: `server/discord/bot.ts`
- Create: `server/discord/handlers.ts`
- Create: `server/discord/__tests__/bot.test.ts`
- Modify: `server/engine/config.yaml` — add discord section

**Purpose:** Discord bot that forwards DMs and mentions to the agent message API, and dispatches responses back to Discord.

### Step 1: Install discord.js

```bash
pnpm add discord.js
```

### Step 2: Add discord config

In `server/engine/config.yaml`, add:

```yaml
# -----------------------------------------------------------------------------
# DISCORD — server/discord/bot.ts
# Bot connector for Discord messaging.
# -----------------------------------------------------------------------------
discord:
  enabled: false
  respond_to_dms: true
  respond_to_mentions: true
  allowed_guilds: []
  allowed_channels: []
```

In `server/engine/config.ts`, add:

```typescript
export interface DiscordConfig {
  enabled: boolean
  respond_to_dms: boolean
  respond_to_mentions: boolean
  allowed_guilds: string[]
  allowed_channels: string[]
}
```

Add to PipelineConfig and getter:

```typescript
export function getDiscordConfig(): DiscordConfig {
  return loadConfig().discord
}
```

### Step 3: Write failing tests

Create `server/discord/__tests__/bot.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { handleInboundMessage } from "../handlers"

// Mock addPendingMessage
vi.mock("../../agent/agent-state", () => ({
  addPendingMessage: vi.fn(),
}))

describe("Discord Handlers", () => {
  it("converts Discord message to PendingMessage", async () => {
    const { addPendingMessage } = await import("../../agent/agent-state")

    await handleInboundMessage({
      authorUsername: "testuser",
      content: "Hello agent!",
      channelId: "123",
      messageId: "456",
      guildId: "789",
    })

    expect(addPendingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "testuser",
        channel: "discord",
        content: "Hello agent!",
        metadata: {
          discordChannelId: "123",
          discordMessageId: "456",
          discordGuildId: "789",
        },
      }),
    )
  })
})
```

### Step 4: Implement handlers

Create `server/discord/handlers.ts`:

```typescript
import { addPendingMessage } from "../agent/agent-state"
import type { PendingMessage } from "../agent/types"

interface InboundDiscordMessage {
  authorUsername: string
  content: string
  channelId: string
  messageId: string
  guildId?: string
}

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
): Promise<void> {
  const pending: PendingMessage = {
    from: msg.authorUsername,
    channel: "discord",
    content: msg.content,
    receivedAt: new Date().toISOString(),
    metadata: {
      discordChannelId: msg.channelId,
      discordMessageId: msg.messageId,
      ...(msg.guildId && { discordGuildId: msg.guildId }),
    },
  }

  await addPendingMessage(pending)
}
```

### Step 5: Implement bot

Create `server/discord/bot.ts`:

```typescript
import { Client, Events, GatewayIntentBits } from "discord.js"
import { getDiscordConfig } from "../engine/config"
import { registerHandler } from "../agent/dispatcher"
import { handleInboundMessage } from "./handlers"

let client: Client | null = null

export async function startDiscordBot(): Promise<Client | null> {
  const config = getDiscordConfig()
  const token = process.env.DISCORD_BOT_TOKEN

  if (!config.enabled || !token) {
    console.log("[discord] Bot disabled or no token — skipping")
    return null
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] Bot ready as ${c.user.tag}`)
  })

  client.on(Events.MessageCreate, async (message) => {
    // Ignore own messages and bots
    if (message.author.bot) return
    if (message.author.id === client?.user?.id) return

    // Check guild/channel filters
    if (config.allowed_guilds.length > 0 && message.guildId) {
      if (!config.allowed_guilds.includes(message.guildId)) return
    }
    if (config.allowed_channels.length > 0) {
      if (!config.allowed_channels.includes(message.channelId)) return
    }

    // DM check
    const isDM = !message.guildId
    if (isDM && !config.respond_to_dms) return

    // Mention check (non-DM)
    if (!isDM && config.respond_to_mentions) {
      if (!message.mentions.has(client!.user!.id)) return
    }

    await handleInboundMessage({
      authorUsername: message.author.username,
      content: message.content,
      channelId: message.channelId,
      messageId: message.id,
      guildId: message.guildId ?? undefined,
    })
  })

  // Register outbound handler with dispatcher
  registerHandler("discord", {
    send: async (target, response, metadata) => {
      const channelId = metadata?.discordChannelId
      if (!channelId || !client) return

      const channel = await client.channels.fetch(channelId)
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send(response)
      }
    },
  })

  await client.login(token)
  return client
}

export async function stopDiscordBot(): Promise<void> {
  if (client) {
    client.destroy()
    client = null
  }
}
```

### Step 6: Run tests

```bash
pnpm vitest run server/discord/__tests__/bot.test.ts
```

### Step 7: Add DISCORD_BOT_TOKEN to .env.example

```
# Discord Bot (optional — set to enable Discord connector)
# DISCORD_BOT_TOKEN=...
```

### Step 8: Type check + full suite

```bash
pnpm exec tsc --noEmit
pnpm vitest run
```

### Step 9: Commit

```bash
git add server/discord/ server/engine/config.yaml server/engine/config.ts \
  .env.example package.json pnpm-lock.yaml
git commit -m "feat(discord): add Discord bot connector with inbound/outbound messaging"
```

---

## Task 18: Integration Wiring + Full Verification

**Files:**
- Verify all tests pass
- Verify type check clean
- Verify biome lint clean
- Manual smoke test of dashboard + tick

### Step 1: Run full test suite

```bash
pnpm vitest run
```

Expected: 170+ tests passing (163 existing + 4 flipped + new tests).

### Step 2: Type check

```bash
pnpm exec tsc --noEmit
```

### Step 3: Lint

```bash
pnpm biome check .
```

Fix any issues.

### Step 4: Manual smoke test

```bash
# 1. Start services
docker compose up -d
pnpm dev &

# 2. Visit dashboard
# http://localhost:3000/agent — homeostasis gauges
# http://localhost:3000/agent/knowledge — knowledge browser
# http://localhost:3000/agent/trace — run a trace query
# http://localhost:3000/agent/config — view config

# 3. Send message via API
curl -X POST http://localhost:3000/api/agent/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"test","channel":"api","content":"What is MQTT?"}'

# 4. Trigger tick
curl -X POST http://localhost:3000/api/agent/tick

# 5. Check dashboard updated (activity log, response)
# http://localhost:3000/agent

# 6. Direct chat via dashboard
# http://localhost:3000/agent/chat — send a message

# 7. Override homeostasis
curl -X POST http://localhost:3000/api/agent/debug/homeostasis \
  -H "Content-Type: application/json" \
  -d '{"dimension":"knowledge_sufficiency","state":"LOW"}'
# Check dashboard shows LOW

# 8. Knowledge browser
# http://localhost:3000/agent/knowledge — search, filter, browse
```

### Step 5: Commit any fixes

```bash
git add -A
git commit -m "fix: integration wiring and smoke test fixes"
```

---

## Verification Checklist

After all 18 tasks:

- [ ] All tests pass: `pnpm vitest run` (170+ tests)
- [ ] TypeScript clean: `pnpm exec tsc --noEmit`
- [ ] Lint clean: `pnpm biome check .`
- [ ] Dashboard loads: `/agent` shows homeostasis gauges
- [ ] Knowledge browser works: `/agent/knowledge` shows entries
- [ ] Trace works: `/agent/trace` runs query trace
- [ ] Config viewer works: `/agent/config` shows all config
- [ ] Direct chat works: `/agent/chat` sends through tick pipeline
- [ ] Message API works: POST to `/api/agent/messages` queues message
- [ ] Tick works: POST to `/api/agent/tick` processes pending messages
- [ ] Debug override works: POST to `/api/agent/debug/homeostasis` injects state
- [ ] Heartbeat starts (when enabled)
- [ ] Memory decay runs on old entries
- [ ] Context compression prevents overflow
- [ ] Claude Code provider fixed (no API key required)
- [ ] L2 assessment runs when Ollama available
- [ ] Discord bot starts with token (manual — requires bot setup)

### Success Criteria (from design doc)

- [ ] Send direct message via dashboard, see tick result with homeostasis + facts
- [ ] All 6 homeostasis dimensions produce real assessments
- [ ] Override a dimension to LOW in dashboard, see guidance appear
- [ ] Browse knowledge store in UI — search by entity, filter by type
- [ ] Run pipeline trace in UI — see why facts were/weren't retrieved
- [ ] View current config values in UI
- [ ] Watch entry confidence decay over days
- [ ] Long chat session doesn't crash (compression)
- [ ] Claude Code provider works with `claude login`
