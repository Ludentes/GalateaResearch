import { createError, defineEventHandler } from "h3"
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
