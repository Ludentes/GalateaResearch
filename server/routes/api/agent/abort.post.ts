import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentDefaultSpec } from "../../../agent/agent-spec"
import { clearAgentSession } from "../../../agent/claude-code-respond"
import {
  loadOperationalContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import { clearAgentLock } from "../../../agent/tick"

interface AbortBody {
  agentId?: string
}

/**
 * Hard-reset handle: abort any running Claude session for an agent,
 * clear the tick lock, and mark in-progress tasks as blocked.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as AbortBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const agentId = body.agentId
  const actions: string[] = []

  // 1. Clear in-memory Claude SDK session
  clearAgentSession(agentId)
  actions.push("clearedSession")

  // 2. Clear tick lock so new ticks can proceed
  clearAgentLock(agentId)
  actions.push("clearedLock")

  // 3. Mark any in-progress tasks as blocked (with reason)
  let opPath: string | undefined
  try {
    const spec = await loadAgentDefaultSpec(agentId)
    opPath = spec.operational_memory
  } catch {
    // Use default path
  }

  const opCtx = await loadOperationalContext(opPath)
  let tasksAborted = 0
  for (const task of opCtx.tasks) {
    if (task.status === "in_progress" || task.status === "assigned") {
      task.status = "blocked"
      task.claudeSessionId = undefined
      task.progress.push("Aborted via hard reset")
      tasksAborted++
    }
  }

  if (tasksAborted > 0) {
    opCtx.blockers.push(`${tasksAborted} task(s) aborted via hard reset`)
    await saveOperationalContext(opCtx, opPath)
    actions.push(`abortedTasks=${tasksAborted}`)
  }

  return { ok: true, agentId, actions }
})
