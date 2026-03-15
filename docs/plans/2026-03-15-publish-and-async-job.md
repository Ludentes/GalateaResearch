# PUBLISH Stage + Async Job Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the two remaining P0 blockers for launch — agents push branches and create MRs, and the inject API returns immediately instead of blocking for minutes.

**Architecture:** PUBLISH adds a pipeline-enforced work arc after FINISH that creates a feature branch, pushes, and runs `glab mr create`. Async job model decouples inject from tick execution using an in-memory job store with polling.

**Tech Stack:** Node.js, H3 event handlers, Claude Code SDK adapter, git/glab CLI, Vitest

---

### Task 1: Add PUBLISH Stage to Tick Pipeline

**Files:**
- Modify: `server/agent/tick.ts` (after FINISH block, ~line 460)
- Test: `server/agent/__tests__/tick-delegation.test.ts` (add PUBLISH assertion)

**Step 1: Add PUBLISH stage after FINISH in tick.ts**

Insert after the FINISH block (after `}` at ~line 460), before the `const statusText` line:

```typescript
// ---------------------------------------------------------------
// PUBLISH phase — push branch and create MR for coding tasks
// ---------------------------------------------------------------
if (
  arcResult.status === "completed" &&
  routing.taskType === "coding"
) {
  try {
    const { execSync } = await import("node:child_process")

    // Check current branch — only publish if not on main
    const currentBranch = execSync(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: workDir, encoding: "utf-8", timeout: 5000 },
    ).trim()

    if (currentBranch === "main" || currentBranch === "master") {
      // Create a feature branch from the current commits
      const branchName = `feature/${task.id}-${Date.now()}`
      execSync(`git checkout -b ${branchName}`, {
        cwd: workDir,
        encoding: "utf-8",
        timeout: 5000,
      })
      console.log(`[tick] PUBLISH: created branch ${branchName}`)
    }

    const branch = execSync(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: workDir, encoding: "utf-8", timeout: 5000 },
    ).trim()

    // Push branch
    execSync(`git push -u origin ${branch}`, {
      cwd: workDir,
      encoding: "utf-8",
      timeout: 30_000,
    })
    console.log(`[tick] PUBLISH: pushed ${branch}`)

    // Create MR via glab (best-effort)
    try {
      const mrOutput = execSync(
        `glab mr create --title "${taskDescription.slice(0, 70)}" --fill --yes 2>&1`,
        { cwd: workDir, encoding: "utf-8", timeout: 30_000 },
      ).trim()
      console.log(`[tick] PUBLISH: MR created — ${mrOutput}`)
    } catch (mrErr) {
      // MR creation may fail if glab not configured — log and continue
      console.warn(
        "[tick] PUBLISH: MR creation failed (glab):",
        (mrErr as Error).message,
      )
    }
  } catch (err) {
    console.warn("[tick] PUBLISH failed:", (err as Error).message)
  }
}
```

**Step 2: Verify tick-delegation test still passes**

Run: `pnpm vitest run server/agent/__tests__/tick-delegation.test.ts`
Expected: 5/5 PASS (the mock adapter doesn't have a real git repo, so PUBLISH will `catch` silently)

**Step 3: Commit**

```bash
git add server/agent/tick.ts
git commit -m "feat: add PUBLISH stage to tick pipeline — push branch and create MR"
```

---

### Task 2: Job Store Module

**Files:**
- Create: `server/agent/job-store.ts`
- Test: `server/agent/__tests__/job-store.test.ts`

**Step 1: Write the failing tests**

```typescript
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"
import {
  createJob,
  getJob,
  updateJob,
  cleanExpiredJobs,
  type Job,
} from "../job-store"

describe("job-store", () => {
  afterEach(() => {
    cleanExpiredJobs(0) // clear all
  })

  it("creates a job with queued status", () => {
    const job = createJob("beki")
    expect(job.status).toBe("queued")
    expect(job.agentId).toBe("beki")
    expect(job.jobId).toBeTruthy()
  })

  it("retrieves a created job by id", () => {
    const job = createJob("beki")
    const found = getJob(job.jobId)
    expect(found).toBeDefined()
    expect(found!.jobId).toBe(job.jobId)
  })

  it("returns undefined for unknown job id", () => {
    expect(getJob("nonexistent")).toBeUndefined()
  })

  it("updates job status and result", () => {
    const job = createJob("beki")
    updateJob(job.jobId, {
      status: "completed",
      result: { action: "respond", text: "done" },
    })
    const updated = getJob(job.jobId)
    expect(updated!.status).toBe("completed")
    expect(updated!.result).toEqual({ action: "respond", text: "done" })
  })

  it("cleans expired jobs", () => {
    const job = createJob("beki")
    // All jobs expire with TTL=0
    cleanExpiredJobs(0)
    expect(getJob(job.jobId)).toBeUndefined()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/agent/__tests__/job-store.test.ts`
Expected: FAIL — module not found

**Step 3: Implement job-store.ts**

```typescript
import { randomUUID } from "node:crypto"

export interface Job {
  jobId: string
  agentId: string
  status: "queued" | "running" | "completed" | "failed"
  createdAt: string
  startedAt?: string
  completedAt?: string
  result?: Record<string, unknown>
  error?: { code: string; message: string }
}

const store = new Map<string, Job>()

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createJob(agentId: string): Job {
  const job: Job = {
    jobId: randomUUID(),
    agentId,
    status: "queued",
    createdAt: new Date().toISOString(),
  }
  store.set(job.jobId, job)
  return job
}

export function getJob(jobId: string): Job | undefined {
  return store.get(jobId)
}

export function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, "status" | "startedAt" | "completedAt" | "result" | "error">>,
): void {
  const job = store.get(jobId)
  if (!job) return
  Object.assign(job, updates)
}

export function cleanExpiredJobs(ttlMs: number = DEFAULT_TTL_MS): void {
  const cutoff = Date.now() - ttlMs
  for (const [id, job] of store) {
    if (new Date(job.createdAt).getTime() < cutoff) {
      store.delete(id)
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/agent/__tests__/job-store.test.ts`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add server/agent/job-store.ts server/agent/__tests__/job-store.test.ts
git commit -m "feat: add in-memory job store for async tick execution"
```

---

### Task 3: Make Inject Endpoint Async

**Files:**
- Modify: `server/routes/api/agent/inject.post.ts`
- Test: `server/routes/__tests__/agent-inject-async.test.ts`

**Step 1: Write the failing tests**

```typescript
// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest"
import { validateInjectBody, buildChannelMessage } from "../api/agent/inject.post"

// These unit tests verify the existing validation/build functions still work.
// The async behavior is tested via scenario runner integration.

describe("inject validation", () => {
  it("rejects missing agentId", () => {
    expect(validateInjectBody({ content: "hi", from: "u", channel: "discord" }))
      .toBe("Missing required field: agentId")
  })

  it("accepts valid body", () => {
    expect(validateInjectBody({
      agentId: "beki",
      content: "hi",
      from: "kirill",
      channel: "discord",
    })).toBeNull()
  })
})

describe("buildChannelMessage", () => {
  it("builds a channel message with defaults", () => {
    const msg = buildChannelMessage({
      agentId: "beki",
      content: "hello",
      from: "kirill",
      channel: "discord",
    })
    expect(msg.messageType).toBe("chat")
    expect(msg.direction).toBe("inbound")
  })
})
```

**Step 2: Rewrite inject.post.ts to return immediately**

Replace the default export in `inject.post.ts`:

```typescript
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as InjectBody

  const error = validateInjectBody(body)
  if (error) {
    throw new HTTPError(error, { status: 400 })
  }

  const msg = buildChannelMessage(body)

  // Create job for async tracking
  const { createJob, updateJob } = await import("../../../agent/job-store")
  const job = createJob(body.agentId!)

  // Queue message
  await addMessage(msg)

  // Run tick in background — do NOT await
  const tickPromise = tick("webhook", { agentId: body.agentId })
  tickPromise
    .then(async (result) => {
      // Poll for tick record (same logic as before)
      const tickPath = getTickRecordPath(body.agentId!)
      let record = await readLastTickRecord(tickPath)
      for (let i = 0; i < 30; i++) {
        if (record && record.tickId) break
        await new Promise((r) => setTimeout(r, 100))
        record = await readLastTickRecord(tickPath)
      }
      updateJob(job.jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result: { tick: record, ...result },
      })
    })
    .catch((err) => {
      updateJob(job.jobId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: { code: "TICK_FAILED", message: (err as Error).message },
      })
    })

  // Mark as running
  updateJob(job.jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
  })

  // Return immediately with job reference
  event.node.res.statusCode = 202
  return {
    jobId: job.jobId,
    status: "running",
    statusUrl: `/api/agent/jobs/${job.jobId}`,
  }
})
```

**Step 3: Run tests**

Run: `pnpm vitest run server/routes/__tests__/agent-inject-async.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/routes/api/agent/inject.post.ts server/routes/__tests__/agent-inject-async.test.ts
git commit -m "feat: make inject endpoint async — return jobId immediately, run tick in background"
```

---

### Task 4: Job Status Polling Endpoint

**Files:**
- Create: `server/routes/api/agent/jobs/[jobId].get.ts`

**Step 1: Create the polling endpoint**

```typescript
import { defineEventHandler, createError } from "h3"
import { getJob } from "../../../../agent/job-store"

export default defineEventHandler(async (event) => {
  const jobId = event.context.params?.jobId
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Missing jobId" })
  }

  const job = getJob(jobId)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" })
  }

  return job
})
```

**Step 2: Verify it registers with Nitro**

Start the dev server and test: `curl http://localhost:13000/api/agent/jobs/nonexistent`
Expected: 404 with `"Job not found"`

**Step 3: Commit**

```bash
git add server/routes/api/agent/jobs/\[jobId\].get.ts
git commit -m "feat: add GET /api/agent/jobs/:jobId polling endpoint"
```

---

### Task 5: Update Scenario Runner for Async Inject

**Files:**
- Modify: `scripts/run-scenario.ts` (the inject call + polling loop)

**Step 1: Modify executeStep to poll for completion**

Replace the inject fetch block (lines ~95-142) with:

```typescript
// Send inject — now returns 202 with jobId
res = await fetch(`${BASE_URL}/api/agent/inject`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: injectBody,
  signal: AbortSignal.timeout(30_000), // inject itself is fast now
})

if (!res.ok) {
  // Handle error as before
  ...
}

const injectResult = await res.json()
const jobId = injectResult.jobId

if (!jobId) {
  // Fallback: old sync response (backward compat)
  // treat injectResult as the tick result directly
} else {
  // Poll for job completion
  const pollStart = Date.now()
  let job: any
  while (Date.now() - pollStart < FETCH_TIMEOUT_MS) {
    const pollRes = await fetch(
      `${BASE_URL}/api/agent/jobs/${jobId}`,
      { signal: AbortSignal.timeout(5000) },
    )
    job = await pollRes.json()
    if (job.status === "completed" || job.status === "failed") break
    await new Promise((r) => setTimeout(r, 1000)) // poll every 1s
  }

  if (!job || job.status === "failed") {
    // Return failure verdict
  }

  // Build a fake Response-like object with the tick record
  // so the rest of executeStep works unchanged
  const tickRecord = job.result?.tick
  res = new Response(JSON.stringify({ tick: tickRecord }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
```

The key changes:
1. Inject call now has a short 30s timeout (it returns immediately)
2. After getting `jobId`, poll `/api/agent/jobs/:jobId` every 1s
3. When job is `completed`, extract the tick record and continue assertions
4. Remove the 500-retry logic — async inject won't return 500 from timeouts

**Step 2: Test with a simple scenario**

Run: `pnpm tsx scripts/run-scenario.ts scenarios/level-1-respond-to-question.yaml`
Expected: PASS (scenario runner polls and gets result)

**Step 3: Commit**

```bash
git add scripts/run-scenario.ts
git commit -m "feat: update scenario runner for async inject with job polling"
```

---

### Task 6: Job Cleanup on Server Start

**Files:**
- Modify: `server/agent/tick.ts` or create `server/agent/job-cleanup.ts`

**Step 1: Add periodic cleanup**

In `server/agent/job-store.ts`, add a self-scheduling cleanup:

```typescript
// Schedule cleanup every hour
let cleanupTimer: ReturnType<typeof setInterval> | undefined

export function startCleanupTimer(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => cleanExpiredJobs(), 60 * 60 * 1000)
  // Don't keep process alive just for cleanup
  if (cleanupTimer.unref) cleanupTimer.unref()
}

export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = undefined
  }
}
```

**Step 2: Start cleanup in inject.post.ts**

Add at top of the default handler:
```typescript
import { startCleanupTimer } from "../../../agent/job-store"
startCleanupTimer()
```

**Step 3: Commit**

```bash
git add server/agent/job-store.ts server/routes/api/agent/inject.post.ts
git commit -m "feat: add periodic job store cleanup (hourly, 24h TTL)"
```

---

### Task 7: Integration Smoke Test

**Step 1: Start infra and dev server**

```bash
docker compose up -d
pnpm dev
```

**Step 2: Run a quick regression scenario**

```bash
pnpm tsx scripts/run-scenario.ts scenarios/level-1-respond-to-question.yaml
```

Expected: PASS with async polling visible in output

**Step 3: Run a coding scenario to verify PUBLISH**

```bash
pnpm tsx scripts/run-scenario.ts scenarios/level-95-verification-catches-bug.yaml
```

Expected: PASS + `[tick] PUBLISH:` log messages in server output

**Step 4: Test the job polling API directly**

```bash
# Inject a message
curl -X POST http://localhost:13000/api/agent/inject \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"beki","content":"hello","from":"kirill","channel":"discord"}'

# Should return: { "jobId": "...", "status": "running", "statusUrl": "/api/agent/jobs/..." }

# Poll for result
curl http://localhost:13000/api/agent/jobs/<jobId>
# Should return: { "status": "completed", "result": { "tick": {...} } }
```

**Step 5: Run tick-delegation unit tests**

```bash
pnpm vitest run server/agent/__tests__/tick-delegation.test.ts
```

Expected: 5/5 PASS

---

## Execution Notes

- Tasks 1 (PUBLISH) and 2-4 (async job) are **independent** — can run in parallel
- Task 5 (scenario runner update) depends on Tasks 3-4
- Task 6 (cleanup) is a small addition to Task 2
- Task 7 is integration smoke test — run last
- The Nitro file-based routing for `[jobId].get.ts` uses bracket syntax for dynamic params
- The `glab` CLI may not be installed in all environments — PUBLISH handles this gracefully with a try/catch
