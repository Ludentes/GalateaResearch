import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getCurationConfig } from "../engine/config"
import type { KnowledgeEntry } from "./types"

export interface CurationItem {
  id: string
  entryId: string
  action: "approve-entry" | "reject-entry" | "review-impact" | "approve-hook"
  reason: string
  proposedAt: string
  resolvedAt?: string
  resolution?: "approved" | "rejected" | "deferred"
  entry: KnowledgeEntry
  impactData?: {
    exposed: number
    helpful: number
    harmful: number
    score: number
  }
}

interface CurationQueue {
  items: CurationItem[]
}

async function readQueue(queuePath: string): Promise<CurationQueue> {
  try {
    const raw = await readFile(queuePath, "utf-8")
    return JSON.parse(raw) as CurationQueue
  } catch {
    return { items: [] }
  }
}

async function writeQueue(
  queue: CurationQueue,
  queuePath: string,
): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true })
  await writeFile(queuePath, JSON.stringify(queue, null, 2))
}

export async function addToQueue(
  input: {
    entry: KnowledgeEntry
    action: CurationItem["action"]
    reason: string
  },
  queuePath: string,
): Promise<CurationItem> {
  const cfg = getCurationConfig()
  const queue = await readQueue(queuePath)

  const item: CurationItem = {
    id: crypto.randomUUID(),
    entryId: input.entry.id,
    action: input.action,
    reason: input.reason,
    proposedAt: new Date().toISOString(),
    entry: input.entry,
  }

  // Enforce max queue size: replace oldest deferred if full
  const pending = queue.items.filter(
    (i) => !i.resolvedAt || i.resolution === "deferred",
  )
  if (pending.length >= cfg.queue_max_items) {
    const deferred = queue.items
      .filter((i) => i.resolution === "deferred")
      .sort(
        (a, b) =>
          new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime(),
      )
    if (deferred.length > 0) {
      deferred[0].resolution = "rejected"
      deferred[0].resolvedAt = new Date().toISOString()
    }
  }

  queue.items.push(item)
  await writeQueue(queue, queuePath)
  return item
}

export async function resolveItem(
  itemId: string,
  resolution: "approved" | "rejected" | "deferred",
  queuePath: string,
): Promise<void> {
  const queue = await readQueue(queuePath)
  const item = queue.items.find((i) => i.id === itemId)
  if (item) {
    item.resolution = resolution
    item.resolvedAt = new Date().toISOString()
  }
  await writeQueue(queue, queuePath)
}

export async function getPendingItems(
  queuePath: string,
): Promise<CurationItem[]> {
  const queue = await readQueue(queuePath)
  return queue.items.filter((i) => !i.resolvedAt)
}

export async function cleanupStale(queuePath: string): Promise<number> {
  const cfg = getCurationConfig()
  const queue = await readQueue(queuePath)
  const now = Date.now()
  let cleaned = 0

  for (const item of queue.items) {
    if (item.resolvedAt) continue
    const age = (now - new Date(item.proposedAt).getTime()) / 86400000
    if (age > cfg.auto_reject_after_days) {
      item.resolution = "rejected"
      item.resolvedAt = new Date().toISOString()
      cleaned++
    }
  }

  await writeQueue(queue, queuePath)
  return cleaned
}
