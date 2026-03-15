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
  updates: Partial<
    Pick<Job, "status" | "startedAt" | "completedAt" | "result" | "error">
  >,
): void {
  const job = store.get(jobId)
  if (!job) return
  Object.assign(job, updates)
}

export function cleanExpiredJobs(ttlMs: number = DEFAULT_TTL_MS): void {
  const cutoff = Date.now() - ttlMs
  for (const [id, job] of store) {
    if (new Date(job.createdAt).getTime() <= cutoff) {
      store.delete(id)
    }
  }
}

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
