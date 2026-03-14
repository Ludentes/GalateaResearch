import { defineEventHandler, HTTPError, readBody } from "h3"
import {
  addTask,
  loadOperationalContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import type { ChannelMessage } from "../../../agent/types"

interface SetupBody {
  agentId?: string
  /** Set lastOutboundAt to this many minutes ago */
  lastOutboundMinutesAgo?: number
  /** Create a task with given phase */
  createTask?: {
    description: string
    phase?: string
    phaseMinutesAgo?: number
    status?: string
  }
  /** Add messages to recentHistory (for stuck detection) */
  addHistory?: Array<{ role: "user" | "assistant"; content: string }>
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as SetupBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const opCtx = await loadOperationalContext()
  const applied: string[] = []

  if (body.lastOutboundMinutesAgo !== undefined) {
    const d = new Date(Date.now() - body.lastOutboundMinutesAgo * 60_000)
    opCtx.lastOutboundAt = d.toISOString()
    applied.push(`lastOutboundAt=${opCtx.lastOutboundAt}`)
  }

  if (body.createTask) {
    const fakeMsg: ChannelMessage = {
      id: `setup-${Date.now()}`,
      channel: "internal",
      direction: "inbound",
      routing: {},
      from: "setup",
      content: body.createTask.description,
      messageType: "task_assignment",
      receivedAt: new Date().toISOString(),
      metadata: {},
    }
    const task = addTask(opCtx, body.createTask.description, fakeMsg)
    task.status =
      (body.createTask.status as typeof task.status) ?? "in_progress"
    if (body.createTask.phase) {
      task.phase = body.createTask.phase as typeof task.phase
      if (body.createTask.phaseMinutesAgo) {
        const d = new Date(
          Date.now() - body.createTask.phaseMinutesAgo * 60_000,
        )
        task.phaseStartedAt = d.toISOString()
      }
    }
    applied.push(`task=${task.id} phase=${task.phase} status=${task.status}`)
  }

  if (body.addHistory) {
    for (const h of body.addHistory) {
      opCtx.recentHistory.push({
        role: h.role,
        content: h.content,
        timestamp: new Date().toISOString(),
      })
    }
    applied.push(`history+=${body.addHistory.length}`)
  }

  await saveOperationalContext(opCtx)
  return { ok: true, applied }
})
