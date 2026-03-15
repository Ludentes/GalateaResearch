// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"
import { createJob, getJob, updateJob, cleanExpiredJobs } from "../job-store"

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
