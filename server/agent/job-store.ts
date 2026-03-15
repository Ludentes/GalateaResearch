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

// Use globalThis to survive Nitro HMR reloads during development —
// without this, coding tasks that trigger file changes wipe the store
const STORE_KEY = "__galatea_job_store__"
const store: Map<string, Job> =
  (globalThis as any)[STORE_KEY] ??
  ((globalThis as any)[STORE_KEY] = new Map<string, Job>())

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Creates a new job and stores it in the job store.
 *
 * @param agentId - The ID of the agent that will execute this job
 * @returns A new Job object with queued status and a generated jobId
 */
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

/**
 * Retrieves a job from the store by its ID.
 *
 * @param jobId - The unique identifier of the job to retrieve
 * @returns The Job object if found, or undefined if the job does not exist
 */
export function getJob(jobId: string): Job | undefined {
  return store.get(jobId)
}

/**
 * Updates a job's properties in the store.
 *
 * @param jobId - The unique identifier of the job to update
 * @param updates - Partial object containing job fields to update. Can include status, startedAt,
 *                  completedAt, result, or error
 * @returns void. If the job is not found, the function returns silently without error
 */
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

/**
 * Removes jobs from the store that have exceeded their time-to-live duration.
 *
 * @param ttlMs - Time-to-live in milliseconds. Jobs created before `Date.now() - ttlMs`
 *                will be deleted. Defaults to 24 hours if not specified.
 *
 * @example
 * // Remove jobs older than 24 hours (uses default TTL)
 * cleanExpiredJobs()
 *
 * @example
 * // Remove jobs older than 1 hour
 * cleanExpiredJobs(60 * 60 * 1000)
 */
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

/**
 * Starts a periodic cleanup timer that removes expired jobs from the store.
 *
 * The cleanup runs every hour and removes jobs that have exceeded the default TTL (24 hours).
 * The timer will not keep the process alive. If the timer is already running, this function
 * returns early without creating a duplicate.
 *
 * @returns void
 */
export function startCleanupTimer(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => cleanExpiredJobs(), 60 * 60 * 1000)
  // Don't keep process alive just for cleanup
  if (cleanupTimer.unref) cleanupTimer.unref()
}

/**
 * Stops the periodic cleanup timer if it is running.
 *
 * After calling this function, expired jobs will no longer be automatically removed
 * from the store. The timer can be restarted by calling startCleanupTimer().
 *
 * @returns void
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = undefined
  }
}
