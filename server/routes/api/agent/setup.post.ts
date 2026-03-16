import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentSpec } from "../../../agent/agent-spec"
import {
  addTask,
  loadOperationalContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import type { ChannelMessage } from "../../../agent/types"
import { appendEntries } from "../../../memory/knowledge-store"

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
  /** Seed knowledge store with facts (for homeostasis dimension tests) */
  seedFacts?: Array<{ content: string; source?: string }>
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as SetupBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  // Resolve per-agent operational memory path from spec
  let opPath: string | undefined
  try {
    const spec = await loadAgentSpec(body.agentId)
    opPath = spec.operational_memory
  } catch (err) {
    console.warn(`[setup] Agent spec not found for ${body.agentId}:`, err)
  }
  const opCtx = await loadOperationalContext(opPath)
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

  if (body.seedFacts?.length) {
    const storePath = "data/memory/entries.jsonl"
    const entries = body.seedFacts.map((f, i) => ({
      id: `seed-${Date.now()}-${i}`,
      type: "fact" as const,
      content: f.content,
      source: f.source || "setup-seed",
      confidence: 0.9,
      entities: [],
      extractedAt: new Date().toISOString(),
    }))
    await appendEntries(entries, storePath)
    applied.push(`seedFacts=${entries.length}`)
  }

  await saveOperationalContext(opCtx, opPath)
  return { ok: true, applied }
})
