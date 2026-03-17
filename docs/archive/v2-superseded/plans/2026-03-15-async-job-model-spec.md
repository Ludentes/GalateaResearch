# Async Job Model for Agent Tick Pipeline

**Date:** 2026-03-15
**Status:** Design specification
**Problem:** `POST /api/agent/inject` blocks for up to 300 seconds while `tick()` runs, causing HTTP timeout failures and preventing external integrations (Discord bots, webhooks, real-time dashboards).
**Solution:** Decouple message injection from tick execution using an async job queue with status polling.

---

## Overview

The current architecture executes ticks synchronously within the HTTP request handler:

```
POST /inject
  → addMessage()
  → await tick()       ← blocks for 30–300s
  → return TickResult
```

This causes:
- HTTP timeout failures (most clients: 30s, some: 60s)
- Blocking integrations (Discord bots can't respond quickly)
- Loss of response context (client disconnects before result)
- Server resource starvation (concurrent requests pile up)

### Proposed Solution

Split into **three operations**:

```
1. POST /api/agent/inject
   → validate message
   → queue message
   → create job record
   → return { jobId }              ← immediate (< 100ms)

2. Background: async tick execution
   → process message
   → execute agent loop
   → write result to job store
   → emit SSE event (optional)

3. GET /api/agent/jobs/:jobId
   → return { status, result }     ← polling interface
```

---

## API Contracts

### 1. POST /api/agent/inject

**Request:**
```typescript
POST /api/agent/inject
Content-Type: application/json

{
  agentId: string
  content: string
  from: string
  channel: "discord" | "dashboard" | "gitlab" | "internal"
  messageType?: "chat" | "task_assignment" | "status_update" | "greeting"
  provider?: string      // override LLM provider
  model?: string        // override LLM model
}
```

**Response (202 Accepted):**
```typescript
{
  jobId: string         // UUID for tracking job
  status: "queued"      // immediately status
  createdAt: string     // ISO 8601 timestamp
  expiresAt: string     // ISO 8601 (job store TTL, default 24h)

  // For status polling
  statusUrl: string     // GET /api/agent/jobs/:jobId

  // For SSE subscribers
  sseUrl?: string       // GET /api/agent/jobs/:jobId/stream
}
```

**Behavior:**
- Validates input (same validation as current `validateInjectBody()`)
- Queues message to agent's pending queue
- Creates job record with `status: "queued"`
- Returns immediately (< 100ms)
- Response HTTP 202 (Accepted) signals async processing

**Error Cases:**
- 400: validation failure (missing field, invalid channel, etc.)
- 503: queue full or message store unavailable

---

### 2. GET /api/agent/jobs/:jobId

**Request:**
```typescript
GET /api/agent/jobs/:jobId
```

**Response (200 OK):**
```typescript
{
  jobId: string
  agentId: string
  status: "queued" | "running" | "completed" | "failed"
  createdAt: string
  startedAt?: string    // when tick began
  completedAt?: string  // when tick finished
  expiresAt: string

  // Tick result (only present if status=completed)
  result?: {
    tick: TickDecisionRecord    // same structure as current
    response?: {
      text: string
    }
    action: string
    retrievedFacts?: Array<{...}>
    // ... all fields from current TickResult
  }

  // Error info (only if status=failed)
  error?: {
    code: string
    message: string
    details?: string
  }

  // Progress metadata (optional, for real-time UIs)
  progress?: {
    phase: "loading_context" | "homeostasis_assessment" | "fact_retrieval" |
           "context_assembly" | "agent_loop" | "dispatching"
    step?: number
    totalSteps?: number
  }
}
```

**Behavior:**
- Return job metadata and result (if available)
- 404 if `jobId` not found or expired
- Result persists for 24 hours (configurable)
- Poll frequently for real-time status (no upper limit on request rate)

**Error Cases:**
- 404: job not found or expired
- 410: job was deliberately deleted by user

---

### 3. GET /api/agent/jobs/:jobId/stream (Optional SSE)

**Request:**
```typescript
GET /api/agent/jobs/:jobId/stream

// Optional parameters
?include=progress,errors    // filter events
```

**Response (200 OK, text/event-stream):**
```
event: job_started
data: {"status": "running", "startedAt": "2026-03-15T10:30:00Z"}

event: progress
data: {"phase": "homeostasis_assessment", "step": 1, "totalSteps": 8}

event: progress
data: {"phase": "fact_retrieval", "step": 2, "totalSteps": 8}

event: progress
data: {"phase": "agent_loop", "step": 3, "totalSteps": 8}

event: job_completed
data: {"status": "completed", "result": {...}, "durationMs": 45000}
```

**Behavior:**
- Stream progress events as tick executes
- Close connection when job reaches terminal state (completed/failed)
- Clients can use for real-time progress bars or live dashboards
- Fall back to polling if SSE unavailable

**Error Cases:**
- 404: job not found
- 410: job already completed (SSE not available for past jobs, use polling)

---

### 4. DELETE /api/agent/jobs/:jobId (Optional Cleanup)

**Request:**
```typescript
DELETE /api/agent/jobs/:jobId
```

**Response (204 No Content):**
- Job record removed from store
- Cannot be queried after deletion
- Useful for cleanup if job expires but client wants immediate removal

---

## Data Flow

### Job Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        JOB LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────┘

1. Client: POST /inject
   └─> inject.post.ts

2. Server: Validate + Queue
   └─> validateInjectBody()
   └─> addMessage() to pending queue
   └─> createJobRecord({ status: "queued" })
   └─> return { jobId, statusUrl }   [< 100ms, HTTP 202]

3. Background: Job Processing
   └─> jobQueue.dequeue()
   └─> set status = "running"
   └─> emit SSE: "job_started"
   └─> tick(...)
       ├─> homeostasis assessment (emit: progress)
       ├─> fact retrieval (emit: progress)
       ├─> context assembly
       ├─> agent loop (emit: progress)
       └─> dispatch response
   └─> set status = "completed", store result
   └─> emit SSE: "job_completed"
   └─> schedule TTL cleanup (24h)

4. Client: Poll for Status
   └─> GET /jobs/:jobId
   └─> repeat until status = completed|failed

5. Cleanup
   └─> TTL expires (24h by default)
   └─> remove job record from store
   └─> job becomes 404 on query
```

### State Machine

```
        POST /inject
            │
            ▼
       ┌─────────┐
       │ queued  │  status: "queued"
       │         │  result: null
       └────┬────┘
            │
       tick processing starts
            │
            ▼
       ┌─────────┐
       │ running │  status: "running"
       │         │  result: null
       └────┬────┘  progress: { phase, step }
            │
       ┌────┴────┐
       │          │
   success    failure
       │          │
       ▼          ▼
   ┌─────────┐ ┌─────────┐
   │completed│ │ failed  │
   │         │ │         │
   └─────────┘ └─────────┘
       │          │
       └────┬─────┘
            │
       (24h TTL)
            │
            ▼
      (job deleted)
```

---

## Job Store Design

### In-Memory Implementation

Use a simple `Map<jobId, JobRecord>` with TTL-based cleanup:

```typescript
interface JobRecord {
  jobId: string
  agentId: string
  status: "queued" | "running" | "completed" | "failed"

  // Timestamps
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  expiresAt: Date

  // Tick result (populated when completed)
  result?: TickResult

  // Error (populated if failed)
  error?: {
    code: string
    message: string
    details?: string
  }

  // Progress metadata
  progress?: {
    phase: string
    step?: number
    totalSteps?: number
  }

  // Message source (for dispatcher)
  message: ChannelMessage
}

// Store
const jobStore = new Map<string, JobRecord>()

// TTL cleanup
const cleanupInterval = setInterval(() => {
  const now = new Date()
  for (const [jobId, record] of jobStore.entries()) {
    if (now > record.expiresAt) {
      jobStore.delete(jobId)
    }
  }
}, 60_000)  // cleanup every minute
```

**Why in-memory for MVP:**
- Simple, zero dependencies
- Fast (~1µs lookups)
- Sufficient for typical agent usage (< 1000 concurrent jobs)
- No database schema migrations
- Works well with server restart (jobs are transient by design)

**Production considerations:**
- If server restarts during tick execution, job becomes stuck (`running` forever)
- Solution: heartbeat task polls `running` jobs, marks them `failed` if tick worker crashed
- Alternative: Redis for distributed deployment (Phase H)

---

## Migration Path: Sync → Async

### Phase 1: Add Async Infrastructure (No Breaking Changes)

1. Create job store: `server/agent/job-store.ts`
2. Create job manager: `server/agent/job-manager.ts`
3. Create job query endpoints: `server/routes/api/agent/jobs/`
4. **Keep current `/inject` endpoint working** (backward compatible)

Current POST /inject behavior unchanged:
- Still returns immediately (via polling)
- Internally now uses job store (transparent to caller)

```typescript
// Old code (still works)
const response = await fetch("/api/agent/inject", {
  method: "POST",
  body: JSON.stringify(msg)
})
const { tick } = await response.json()  // TickResult
```

### Phase 2: Update `/inject` to Return jobId

**New response format:**
```typescript
{
  jobId: string           // new field
  tick?: TickResult       // deprecated, null for long-running tasks
  statusUrl: string       // new field
}
```

**Backward-compatible:**
- Old clients still work (ignore `jobId`, use `tick`)
- New clients use `jobId` and polling

```typescript
// New code
const response = await fetch("/api/agent/inject", {
  method: "POST",
  body: JSON.stringify(msg)
})
const { jobId, statusUrl } = await response.json()

// Poll for result
const result = await pollJob(jobId)
```

### Phase 3: Optional SSE Upgrade

Add streaming endpoint for real-time progress (non-breaking):
- `GET /api/agent/jobs/:jobId/stream`
- Clients can opt-in
- Falls back to polling if unavailable

### Phase 4: Deprecate Polling Response

Once clients are migrated, remove `tick` field from `/inject` response (HTTP 202 only).

---

## Configuration

Add to `server/engine/config.yaml`:

```yaml
job_store:
  enabled: true
  ttl_hours: 24           # how long to keep job records
  cleanup_interval_seconds: 60
  max_jobs: 10000         # warn if exceeded
  stuck_job_timeout_seconds: 600  # mark running jobs as failed if > 10min

sse:
  enabled: true
  heartbeat_interval_ms: 3000
  max_subscribers_per_job: 100
```

---

## Implementation Checklist

- [ ] **Job store** (`server/agent/job-store.ts`)
  - [ ] `createJob(message, agentId): JobRecord`
  - [ ] `getJob(jobId): JobRecord | null`
  - [ ] `updateJob(jobId, updates): void`
  - [ ] `deleteJob(jobId): void`
  - [ ] TTL cleanup task

- [ ] **Job manager** (`server/agent/job-manager.ts`)
  - [ ] Background job queue (dequeue → tick → store result)
  - [ ] Error handling and retry logic
  - [ ] Progress event emission

- [ ] **API endpoints** (`server/routes/api/agent/jobs/`)
  - [ ] `POST /api/agent/inject` (modified)
  - [ ] `GET /api/agent/jobs/:jobId` (new)
  - [ ] `GET /api/agent/jobs/:jobId/stream` (optional, new)
  - [ ] `DELETE /api/agent/jobs/:jobId` (optional, new)

- [ ] **Tests**
  - [ ] Job store CRUD operations
  - [ ] Job lifecycle (queued → running → completed)
  - [ ] TTL cleanup
  - [ ] Polling and SSE
  - [ ] Error scenarios (failed jobs, expired jobs)

- [ ] **Integration tests**
  - [ ] End-to-end: inject → poll → result matches tick()
  - [ ] Concurrent jobs
  - [ ] HTTP timeout simulation
  - [ ] Client retry scenarios

---

## Example: Client Code (Before & After)

### Before (Sync Polling)

```typescript
// Current: blocks HTTP request
const response = await fetch("/api/agent/inject", {
  method: "POST",
  body: JSON.stringify({ agentId, content, from, channel })
})

const { tick } = await response.json()  // 30-300s wait ❌
console.log("Result:", tick)
```

### After (Async Polling)

```typescript
// New: returns immediately
const injectResponse = await fetch("/api/agent/inject", {
  method: "POST",
  body: JSON.stringify({ agentId, content, from, channel })
})

const { jobId, statusUrl } = await injectResponse.json()  // ~50ms ✓
console.log("Job queued:", jobId)

// Poll for result (with backoff)
const result = await pollJobWithBackoff(jobId, {
  initialDelayMs: 100,
  maxDelayMs: 5000,
  maxAttempts: 1440  // 24 hours
})

console.log("Result:", result.result)
```

### After (Async with SSE)

```typescript
// Real-time progress (dashboard)
const eventSource = new EventSource(`/api/agent/jobs/${jobId}/stream`)

eventSource.addEventListener("progress", (event) => {
  const { phase, step, totalSteps } = JSON.parse(event.data)
  updateProgressBar(step / totalSteps, phase)
})

eventSource.addEventListener("job_completed", (event) => {
  const result = JSON.parse(event.data).result
  console.log("Result:", result)
  eventSource.close()
})
```

---

## Testing Strategy

### Unit Tests

```typescript
// test: job-store.test.ts
- Create job, retrieve, update, delete
- TTL expiration logic
- Map bounds checking

// test: job-manager.test.ts
- Dequeue job, execute tick, store result
- Error handling (tick throws)
- Progress emission
```

### Integration Tests

```typescript
// test: inject-async.integration.ts
- POST /inject returns jobId immediately
- GET /jobs/:jobId returns queued status
- Wait for tick execution
- GET /jobs/:jobId returns completed status with result
- Result matches current tick() output
- Concurrent jobs don't interfere
- TTL cleanup removes expired jobs
```

### Load Tests

```typescript
// Simulate Discord bot with 100 concurrent messages
- Verify no request blocks > 100ms
- Verify all jobs eventually complete
- Verify job store doesn't bloat
```

---

## Success Criteria

✅ **Functional:**
- POST /inject returns in < 100ms consistently
- GET /jobs/:jobId returns accurate status
- Job results match current tick() output
- HTTP timeout failures eliminated

✅ **Performance:**
- Job lookup: < 1ms
- Job creation: < 50ms
- Job polling: no database queries, in-memory only

✅ **Reliability:**
- Jobs don't get lost (persisted in TTL-aware store)
- Failed jobs are visible (error field populated)
- Expired jobs are cleaned up automatically

✅ **Developer Experience:**
- Old code still works (backward compatible)
- New code is simpler (no blocking/polling on client)
- Clear error messages for stuck jobs

---

## Open Questions / Future Work

1. **Stuck jobs:** Should heartbeat task poll `running` jobs and mark as `failed` if stuck > 10 min?
2. **Persistence:** Should job store survive server restart? (Probably no for MVP, reconsider in Phase H)
3. **Distributed:** Multi-server deployment? Use Redis as job store (Phase H)
4. **Webhooks:** Should agent dispatch webhook back to original caller on completion?
5. **Analytics:** Should job metrics (duration, success rate) be exposed for monitoring?

---

## References

- Current: `server/routes/api/agent/inject.post.ts`
- Tick implementation: `server/agent/tick.ts`
- TickResult type: `server/agent/types.ts`
- Channel message: `server/agent/types.ts` → `ChannelMessage`

