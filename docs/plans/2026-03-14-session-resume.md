# W.9: Session Resume Per Task — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an agent receives a second message for an active task, the Claude Code SDK session resumes instead of starting fresh — achieving ~90% cost reduction on continuation turns.

**Architecture:** The V1 `query()` API's `resume: sessionId` option loads saved conversation history from disk. We capture `session_id` from result messages, store it in `TaskState.claudeSessionId`, and pass it back on the next delegation call. `persistSession: true` (SDK default) keeps session files in `~/.claude/projects/`. On resume failure, clear the session ID and retry fresh.

**Tech Stack:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), existing `CodingToolAdapter` interface, `TaskState` in operational-memory.

**Key reference:** `/home/newub/w/ContextLibrary/ContextForgeTS/docs/research/2026-03-10-claude-code-structured-api-caching.md` — caching research and ContextForge lessons learned.

---

## Task 1: Add `resume` and `sessionId` to adapter types

**Files:**
- Modify: `server/agent/coding-adapter/types.ts`

**Step 1: Add `resume` to `CodingQueryOptions`**

In `server/agent/coding-adapter/types.ts`, add `resume` field:

```typescript
export interface CodingQueryOptions {
  prompt: string
  systemPrompt: string
  workingDirectory: string
  hooks?: AdapterHooks
  trustLevel?: TrustLevel
  timeout?: number
  maxBudgetUsd?: number
  model?: string
  resume?: string  // session ID to resume
}
```

**Step 2: Add `sessionId` to result variant of `CodingSessionMessage`**

In the `type: "result"` variant, add `sessionId`:

```typescript
  | {
      type: "result"
      subtype: "success" | "error" | "timeout" | "budget_exceeded"
      text: string
      durationMs: number
      costUsd?: number
      numTurns?: number
      transcript?: CodingTranscriptEntry[]
      sessionId?: string  // captured from SDK result
    }
```

**Step 3: Commit**

```bash
git add server/agent/coding-adapter/types.ts
git commit -m "feat(types): add resume and sessionId to coding adapter types"
```

---

## Task 2: Implement session resume in `ClaudeCodeAdapter`

**Files:**
- Modify: `server/agent/coding-adapter/claude-code-adapter.ts`

**Step 1: Accept `resume` from options and configure SDK**

In `ClaudeCodeAdapter.query()`, destructure `resume` from options. Add `persistSession: true` and the `resume` option to `sdkOptions`. Also add env filtering to avoid nesting detection (extracted from `claude-code-respond.ts`):

```typescript
async *query(options: CodingQueryOptions): AsyncIterable<CodingSessionMessage> {
    const {
      prompt,
      systemPrompt,
      workingDirectory,
      hooks,
      timeout,
      maxBudgetUsd,
      model,
      resume,  // ← new
    } = options

    // ... existing transcript/timeout setup ...

    // Clean env to avoid SDK nesting detection
    const INHERITED_ENV_VARS = [
      "HOME", "LOGNAME", "PATH", "SHELL", "TERM",
      "USER", "LANG", "LC_ALL", "TMPDIR", "CLAUDE_CONFIG_DIR",
    ]
    const cleanEnv: Record<string, string> = {}
    for (const key of INHERITED_ENV_VARS) {
      const value = process.env[key]
      if (typeof value === "string" && !value.startsWith("()")) {
        cleanEnv[key] = value
      }
    }

    // ... existing hooks setup ...

    const sdkOptions: Record<string, unknown> = {
      cwd: workingDirectory,
      systemPrompt,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"] as const,
      abortController,
      persistSession: true,  // ← required for resume to work
      env: cleanEnv,         // ← prevent nesting detection
      hooks: Object.keys(sdkHooks).length > 0 ? sdkHooks : undefined,
    }

    if (maxBudgetUsd !== undefined) {
      sdkOptions.maxBudgetUsd = maxBudgetUsd
    }
    if (model !== undefined) {
      sdkOptions.model = model
    }
    if (resume) {
      sdkOptions.resume = resume
    }
```

**Step 2: Capture `session_id` from result messages and yield it**

In the result handling section, capture `session_id` and include it in yielded results:

```typescript
      } else if (msgType === "result") {
        const subtype = sdkMsg.subtype as string
        const durationMs = (sdkMsg.duration_ms as number) ?? Date.now() - startTime
        const costUsd = sdkMsg.total_cost_usd as number | undefined
        const numTurns = sdkMsg.num_turns as number | undefined
        const resultSessionId = sdkMsg.session_id as string | undefined  // ← capture

        if (subtype === "success") {
          const resultText = (sdkMsg.result as string) ?? ""
          yield {
            type: "result",
            subtype: "success",
            text: resultText,
            durationMs,
            costUsd,
            numTurns,
            transcript,
            sessionId: resultSessionId,  // ← pass through
          }
        } else if (subtype === "error_max_budget_usd") {
          yield {
            type: "result",
            subtype: "budget_exceeded",
            text: (sdkMsg.errors as string[])?.join("; ") ?? "Budget exceeded",
            durationMs,
            costUsd,
            numTurns,
            transcript,
            sessionId: resultSessionId,  // ← pass through
          }
        } else if (subtype === "error_max_turns") {
          yield {
            type: "result",
            subtype: "timeout",
            text: (sdkMsg.errors as string[])?.join("; ") ?? "Max turns exceeded",
            durationMs,
            costUsd,
            numTurns,
            transcript,
            sessionId: resultSessionId,  // ← pass through
          }
        } else {
          yield {
            type: "result",
            subtype: "error",
            text: (sdkMsg.errors as string[])?.join("; ") ?? "Unknown error",
            durationMs,
            costUsd,
            numTurns,
            transcript,
            sessionId: resultSessionId,  // ← pass through
          }
        }
      }
```

**Step 3: Commit**

```bash
git add server/agent/coding-adapter/claude-code-adapter.ts
git commit -m "feat(adapter): support session resume and capture session_id"
```

---

## Task 3: Thread session ID through `work-arc.ts`

**Files:**
- Modify: `server/agent/coding-adapter/work-arc.ts`

**Step 1: Add `sessionId` to `WorkArcInput` and `WorkArcResult`**

```typescript
export interface WorkArcInput {
  adapter: CodingToolAdapter
  task: { id: string; description: string }
  context: AssembledContext
  workingDirectory: string
  trustLevel: TrustLevel
  timeout?: number
  maxBudgetUsd?: number
  model?: string
  storePath?: string
  sessionId?: string  // ← resume this session
}

export interface WorkArcResult {
  status: "completed" | "failed" | "timeout" | "blocked" | "budget_exceeded"
  text: string
  transcript: CodingTranscriptEntry[]
  durationMs: number
  costUsd?: number
  numTurns?: number
  extractedTurns?: TranscriptTurn[]
  sessionId?: string  // ← captured from adapter result
}
```

**Step 2: Pass `resume` to adapter and capture `sessionId` from result**

In `executeWorkArc()`, destructure `sessionId` from input and pass it as `resume` to the adapter. Capture `sessionId` from the result message:

```typescript
export async function executeWorkArc(input: WorkArcInput): Promise<WorkArcResult> {
  const {
    adapter,
    task,
    context,
    workingDirectory,
    trustLevel,
    timeout = 300_000,
    maxBudgetUsd,
    model,
    sessionId,  // ← new
  } = input

  // ... availability check ...

  const messages: CodingSessionMessage[] = []
  for await (const msg of adapter.query({
    prompt: task.description,
    systemPrompt: context.systemPrompt,
    workingDirectory,
    hooks: { preToolUse },
    timeout,
    maxBudgetUsd,
    model,
    resume: sessionId,  // ← pass through
  })) {
    messages.push(msg)
  }

  // Find the result message
  const resultMsg = messages.find((m) => m.type === "result")
  // ... existing error handling ...

  const result: WorkArcResult = {
    status: statusMap[resultMsg.subtype] ?? "failed",
    text: resultMsg.text,
    transcript: resultMsg.transcript ?? [],
    durationMs: resultMsg.durationMs,
    costUsd: resultMsg.costUsd,
    numTurns: resultMsg.numTurns,
    sessionId: resultMsg.type === "result" ? resultMsg.sessionId : undefined,  // ← capture
  }

  // ... existing extraction + feedback ...
  return result
}
```

**Step 3: Commit**

```bash
git add server/agent/coding-adapter/work-arc.ts
git commit -m "feat(work-arc): thread sessionId through input/output"
```

---

## Task 4: Wire session resume into tick delegation

**Files:**
- Modify: `server/agent/tick.ts`

**Step 1: Look up existing session from active task before delegation**

In the delegation block (after `const task = addTask(...)`), check for an existing active task with a session ID. If the new message is a continuation (not first task), try to find an active task with a `claudeSessionId`:

```typescript
    // Stage 3b: Delegate to coding adapter for explicit task assignments
    const adapter = await ensureAdapter()
    if (msg.messageType === "task_assignment" && adapter) {
      // Check for existing active task with a session to resume
      const existingTask = getActiveTask(opCtx)
      const resumeSessionId = existingTask?.claudeSessionId

      const task = existingTask ?? addTask(opCtx, msg.content, msg)
      if (!existingTask) {
        task.status = "in_progress"
      }
```

Wait — the current code always calls `addTask` which creates a NEW task. For session resume to work, a second message for the same task should reuse the existing task. The question is: how do we know if a second `task_assignment` is a continuation of the current task vs a new task?

**Design decision:** If there's already an `in_progress` task, append to it (continuation). If not, create new. This is the simplest heuristic — the PM can explicitly mark a new task by first completing the old one.

Replace the delegation entry in `tick.ts`:

```typescript
    if (msg.messageType === "task_assignment" && adapter) {
      // Resume existing in-progress task or create new one
      const existingTask = getActiveTask(opCtx)
      const task = existingTask ?? addTask(opCtx, msg.content, msg)
      task.status = "in_progress"
      if (existingTask) {
        // Continuation — append new instruction to description
        task.progress.push(`Follow-up: ${msg.content}`)
      }

      const workDir = (msg.metadata?.workspace as string) ?? process.cwd()
      const workContext = toolsContext
        ? {
            ...context,
            systemPrompt: `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`,
          }
        : context
      const config = getLLMConfig()
      const arcResult = await executeWorkArc({
        adapter,
        task: { id: task.id, description: existingTask ? msg.content : task.description },
        context: workContext,
        workingDirectory: workDir,
        trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
        model: config.model,
        sessionId: task.claudeSessionId,  // ← resume if available
      })

      // Store session ID for next resume
      if (arcResult.sessionId) {
        task.claudeSessionId = arcResult.sessionId
      }
```

**Step 2: Set `sessionResumed` in tick record**

Update the delegation tick record to report whether session was resumed:

```typescript
      const delegateRecord = buildTickRecord({
        tickId,
        agentId,
        trigger: { ... },
        homeostasis,
        routing,
        execution: {
          adapter: "claude-code",
          sessionResumed: !!task.claudeSessionId && !!existingTask,  // ← was this a resume?
          toolCalls: 0,
        },
        ...
      })
```

Note: `sessionResumed` should be `true` when we attempted resume (existingTask had a claudeSessionId), not when resume succeeded. The success/failure of resume is implicit — if it fails, the SDK starts fresh and the next tick will have a different session ID.

**Step 3: Clear session on completion/failure**

The existing code already handles task status updates. Add session invalidation on terminal states:

```typescript
      if (arcResult.status === "completed") {
        task.status = "done"
        task.claudeSessionId = undefined  // ← clear on completion
        // ... existing knowledge extraction ...
      } else if (arcResult.status === "blocked") {
        task.status = "blocked"
        task.claudeSessionId = undefined  // ← clear on block
        // ... existing blocker handling ...
      } else {
        task.status = "in_progress"
        // Keep claudeSessionId — task continues next tick
        // ... existing carryover ...
      }
```

**Step 4: Import `getActiveTask`**

Add `getActiveTask` to the imports from `operational-memory`:

```typescript
import {
  addTask,
  getActiveTask,  // ← new
  loadOperationalContext,
  pushHistoryEntry,
  recordOutbound,
  saveOperationalContext,
} from "./operational-memory"
```

**Step 5: Commit**

```bash
git add server/agent/tick.ts
git commit -m "feat(tick): wire session resume into delegation path"
```

---

## Task 5: Write the integration test

**Files:**
- Modify: `server/agent/__tests__/tick-delegation.test.ts`

**Step 1: Add test for session resume on second delegation**

```typescript
it("resumes session on second task_assignment when task is in-progress", async () => {
  const sessionIds: (string | undefined)[] = []
  const mockQuery = vi.fn().mockImplementation(function* (opts: Record<string, unknown>) {
    sessionIds.push(opts.resume as string | undefined)
    yield {
      type: "result" as const,
      subtype: "success" as const,
      text: "Done",
      durationMs: 100,
      costUsd: 0.01,
      numTurns: 1,
      transcript: [],
      sessionId: "session-abc-123",
    }
  })
  setAdapter({
    name: "test-adapter",
    isAvailable: vi.fn().mockResolvedValue(true),
    query: mockQuery,
  })

  // First task_assignment — no resume
  await updateAgentState(
    {
      pendingMessages: [makeTaskMessage("implement feature A")],
      lastActivity: new Date().toISOString(),
    },
    STATE_PATH,
  )
  await tick("webhook", { agentId: "test-agent" })

  // Second task_assignment — should resume session-abc-123
  await updateAgentState(
    {
      pendingMessages: [makeTaskMessage("also add tests for feature A")],
      lastActivity: new Date().toISOString(),
    },
    STATE_PATH,
  )
  await tick("webhook", { agentId: "test-agent" })

  expect(sessionIds).toHaveLength(2)
  expect(sessionIds[0]).toBeUndefined()          // first call: no resume
  expect(sessionIds[1]).toBe("session-abc-123")  // second call: resumes
})
```

**Step 2: Run the test**

Run: `npx vitest run server/agent/__tests__/tick-delegation.test.ts -v`
Expected: PASS

**Step 3: Commit**

```bash
git add server/agent/__tests__/tick-delegation.test.ts
git commit -m "test: verify session resume on second delegation"
```

---

## Task 6: Run L29 scenario to validate end-to-end

**Step 1: Run the scenario**

Run: `npx tsx scripts/run-scenario.ts scenarios/level-29-session-resume.yaml`
Expected: PASS — step 2 should show `execution.sessionResumed: true`

**Step 2: Run the full suite to check for regressions**

Run: `npx tsx scripts/run-scenario.ts scenarios/level-*.yaml scenarios/trace-*.yaml`
Expected: All previously passing scenarios still pass (51+)

**Step 3: Commit any scenario adjustments if needed**

---

## Task 7: Update experiment report

**Files:**
- Modify: `docs/reports/2026-03-13-scenario-run-results.md`

**Step 1: Add Run 5 results with L29 passing**

Document session resume implementation and the cost impact.

**Step 2: Commit**

```bash
git add docs/reports/2026-03-13-scenario-run-results.md
git commit -m "docs: add Run 5 results — session resume implemented"
git push
```
