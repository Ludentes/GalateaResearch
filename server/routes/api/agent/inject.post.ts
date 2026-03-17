import { defineEventHandler, HTTPError, readBody, setResponseStatus } from "h3"
import { addMessage } from "../../../agent/agent-state"
import { startCleanupTimer } from "../../../agent/job-store"
import { tick } from "../../../agent/tick"
import type { ChannelMessage, MessageContent } from "../../../agent/types"
import {
  getTickRecordPath,
  readLastTickRecord,
} from "../../../observation/tick-record"

const VALID_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]

function validateContentBlocks(blocks: unknown[]): string | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Record<string, unknown>
    if (!block || typeof block !== "object") {
      return `content[${i}]: must be an object`
    }
    if (block.type === "text") {
      if (typeof block.text !== "string") {
        return `content[${i}]: text block must have a "text" string field`
      }
    } else if (block.type === "image") {
      const source = block.source as Record<string, unknown> | undefined
      if (!source || typeof source !== "object") {
        return `content[${i}]: image block must have a "source" object`
      }
      if (source.type !== "base64") {
        return `content[${i}]: source.type must be "base64"`
      }
      if (!VALID_IMAGE_MEDIA_TYPES.includes(source.media_type as string)) {
        return `content[${i}]: source.media_type must be one of: ${VALID_IMAGE_MEDIA_TYPES.join(", ")}`
      }
      if (typeof source.data !== "string") {
        return `content[${i}]: source.data must be a string`
      }
    } else {
      return `content[${i}]: type must be "text" or "image"`
    }
  }
  return null
}

interface InjectBody {
  agentId?: string
  content?: MessageContent
  from?: string
  channel?: string
  messageType?: string
  /** Override LLM provider for this message (e.g. "none" to simulate outage) */
  provider?: string
  /** Override LLM model for this message (e.g. "sonnet" for dogfooding) */
  model?: string
  /** Skip L2 LLM assessments in homeostasis (use L1 heuristics only) */
  skipL2?: boolean
}

export function validateInjectBody(body: InjectBody): string | null {
  if (!body.agentId) return "Missing required field: agentId"
  if (!body.content) return "Missing required field: content"
  if (typeof body.content !== "string") {
    if (!Array.isArray(body.content)) {
      return "content must be a string or an array of content blocks"
    }
    if (body.content.length === 0) {
      return "content array must not be empty"
    }
    const blockError = validateContentBlocks(body.content)
    if (blockError) return blockError
  }
  if (!body.from) return "Missing required field: from"
  if (!body.channel) return "Missing required field: channel"
  const validChannels = ["discord", "dashboard", "gitlab", "internal"]
  if (!validChannels.includes(body.channel)) {
    return `Invalid channel: ${body.channel}. Must be one of: ${validChannels.join(", ")}`
  }
  if (body.messageType !== undefined) {
    const validMessageTypes = [
      "chat",
      "task_assignment",
      "status_update",
      "greeting",
    ]
    if (!validMessageTypes.includes(body.messageType)) {
      return `Invalid messageType: ${body.messageType}. Must be one of: ${validMessageTypes.join(", ")}`
    }
  }
  return null
}

export function buildChannelMessage(body: InjectBody): ChannelMessage {
  return {
    id: `inject-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel: body.channel as ChannelMessage["channel"],
    direction: "inbound",
    routing: {},
    from: body.from!,
    content: body.content!,
    messageType: (body.messageType ?? "chat") as ChannelMessage["messageType"],
    receivedAt: new Date().toISOString(),
    metadata: {
      ...(body.provider ? { providerOverride: body.provider } : {}),
      ...(body.model ? { modelOverride: body.model } : {}),
      ...(body.skipL2 ? { skipL2: true } : {}),
    },
  }
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as InjectBody

  const error = validateInjectBody(body)
  if (error) {
    throw new HTTPError(error, { status: 400 })
  }

  startCleanupTimer()

  const msg = buildChannelMessage(body)

  // Create job for async tracking
  const { createJob, updateJob } = await import("../../../agent/job-store")
  const job = createJob(body.agentId!)

  // Queue message
  await addMessage(msg)

  // Capture tick record before starting — so we can detect the new one
  const tickPath = getTickRecordPath(body.agentId!)
  const beforeTick = await readLastTickRecord(tickPath)

  // Mark as running BEFORE starting tick to avoid race condition
  updateJob(job.jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
  })

  // Run tick in background — do NOT await
  const tickPromise = tick("webhook", { agentId: body.agentId })
  tickPromise
    .then(async (result) => {
      // appendTickRecord is fire-and-forget — poll until new record appears
      let record = await readLastTickRecord(tickPath)
      for (let i = 0; i < 30 && record?.tickId === beforeTick?.tickId; i++) {
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

  // Return immediately with job reference
  setResponseStatus(event, 202)
  return {
    jobId: job.jobId,
    status: "running",
    statusUrl: `/api/agent/jobs/${job.jobId}`,
  }
})
