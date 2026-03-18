import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentDefaultSpec } from "../../../agent/agent-spec"
import {
  addTask,
  loadOperationalContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import type { ChannelMessage } from "../../../agent/types"
import { appendEntries } from "../../../memory/knowledge-store"

/**
 * Parse relative time strings like "-72h", "-30m", "-2d" to ISO timestamps.
 * Returns the string as-is if it's already an ISO timestamp.
 */
function parseRelativeTime(value: string): string {
  const match = value.match(/^-(\d+)(h|m|d)$/)
  if (!match) return value
  const amount = Number.parseInt(match[1], 10)
  const unit = match[2]
  const ms =
    unit === "d"
      ? amount * 86_400_000
      : unit === "h"
        ? amount * 3_600_000
        : amount * 60_000
  return new Date(Date.now() - ms).toISOString()
}

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
    claudeSessionId?: string
  }
  /** Add messages to recentHistory (for stuck detection) */
  addHistory?: Array<{ role: "user" | "assistant"; content: string }>
  /** Seed knowledge store with facts (for homeostasis dimension tests) */
  seedFacts?: Array<{ content: string; source?: string }>
  /** Set active work items for homeostasis dimension tests */
  activeWorkItems?: Array<{
    id: string
    title: string
    lastActivityAt: string
    assignedTo?: string
    delegatedAt?: string
  }>
  /** Set outbound follow-up count for homeostasis dimension tests */
  outboundFollowUps?: number
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as SetupBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  // Resolve per-agent paths from spec
  let opPath: string | undefined
  let knowledgeStorePath = "data/memory/entries.jsonl"
  try {
    const spec = await loadAgentDefaultSpec(body.agentId)
    opPath = spec.operational_memory
    if (spec.knowledge_store) knowledgeStorePath = spec.knowledge_store
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
    if (body.createTask.claudeSessionId) {
      task.claudeSessionId = body.createTask.claudeSessionId
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
    const entries = body.seedFacts.map((f, i) => ({
      id: `seed-${Date.now()}-${i}`,
      type: "fact" as const,
      content: f.content,
      source: f.source || "setup-seed",
      confidence: 0.9,
      entities: [],
      extractedAt: new Date().toISOString(),
    }))
    await appendEntries(entries, knowledgeStorePath)
    applied.push(`seedFacts=${entries.length}`)
  }

  if (body.activeWorkItems?.length) {
    opCtx.activeWorkItems = body.activeWorkItems.map((item) => ({
      id: item.id,
      title: item.title,
      lastActivityAt: parseRelativeTime(item.lastActivityAt),
      assignedTo: item.assignedTo,
      delegatedAt: item.delegatedAt
        ? parseRelativeTime(item.delegatedAt)
        : undefined,
    }))
    applied.push(`activeWorkItems=${opCtx.activeWorkItems.length}`)
  }

  if (body.outboundFollowUps !== undefined) {
    opCtx.outboundFollowUps = body.outboundFollowUps
    applied.push(`outboundFollowUps=${body.outboundFollowUps}`)
  }

  await saveOperationalContext(opCtx, opPath)
  return { ok: true, applied }
})
