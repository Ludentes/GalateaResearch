import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentSpec } from "../../../agent/agent-spec"
import { addMessage } from "../../../agent/agent-state"
import { clearAgentSession } from "../../../agent/claude-code-respond"
import {
  loadOperationalContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import type { ChannelMessage } from "../../../agent/types"

interface RetryTaskBody {
  agentId?: string
  /** Specific task ID to retry. If omitted, retries the most recent blocked task. */
  taskId?: string
}

/**
 * Retry a blocked/failed task: reset it to assigned, clear its session,
 * and re-inject the original message into the pending queue.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as RetryTaskBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const agentId = body.agentId

  let opPath: string | undefined
  try {
    const spec = await loadAgentSpec(agentId)
    opPath = spec.operational_memory
  } catch {
    // Use default path
  }

  const opCtx = await loadOperationalContext(opPath)

  // Find the task to retry
  const task = body.taskId
    ? opCtx.tasks.find((t) => t.id === body.taskId)
    : opCtx.tasks.filter((t) => t.status === "blocked").at(-1)

  if (!task) {
    throw new HTTPError(
      body.taskId
        ? `Task ${body.taskId} not found`
        : "No blocked tasks to retry",
      { status: 404 },
    )
  }

  if (task.status !== "blocked" && task.status !== "done") {
    throw new HTTPError(
      `Task ${task.id} is ${task.status}, only blocked/done tasks can be retried`,
      { status: 409 },
    )
  }

  // 1. Reset task state
  const previousStatus = task.status
  task.status = "assigned"
  task.phase = "exploring"
  task.phaseStartedAt = new Date().toISOString()
  task.progress.push(
    `Retried (was ${previousStatus}) at ${new Date().toISOString()}`,
  )
  task.claudeSessionId = undefined
  task.escalatedAt = undefined
  task.escalationCategory = undefined

  // 2. Clear stale session
  clearAgentSession(agentId)

  // 3. Remove related blockers
  opCtx.blockers = opCtx.blockers.filter(
    (b) => !b.includes(task.id) && !b.includes("hard reset"),
  )

  await saveOperationalContext(opCtx, opPath)

  // 4. Re-inject the original source message so a tick picks it up
  const retryMsg: ChannelMessage = {
    ...task.source,
    id: `retry-${task.id}-${Date.now()}`,
    receivedAt: new Date().toISOString(),
    metadata: {
      ...task.source.metadata,
      retryOf: task.id,
    },
  }

  await addMessage(retryMsg)

  return {
    ok: true,
    agentId,
    taskId: task.id,
    previousStatus,
    message: `Task ${task.id} reset to assigned, message re-injected`,
  }
})
