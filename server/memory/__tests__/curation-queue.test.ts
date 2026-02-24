// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getCurationConfig: () => ({
      queue_max_items: 5,
      auto_reject_after_days: 30,
      auto_reject_after_defers: 3,
      present_on_idle: true,
    }),
  }
})

import {
  addToQueue,
  resolveItem,
  getPendingItems,
  cleanupStale,
} from "../curation-queue"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = "data/test-curation"
const QUEUE_PATH = `${TEST_DIR}/curation-queue.json`

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test fact",
    confidence: 0.85,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(QUEUE_PATH, JSON.stringify({ items: [] }))
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("curation queue", () => {
  it("adds item to queue", async () => {
    const entry = makeEntry()
    await addToQueue(
      { entry, action: "approve-entry", reason: "New knowledge" },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe("approve-entry")
  })

  it("resolves item with approval", async () => {
    const entry = makeEntry()
    await addToQueue(
      { entry, action: "approve-entry", reason: "test" },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    await resolveItem(pending[0].id, "approved", QUEUE_PATH)

    const after = await getPendingItems(QUEUE_PATH)
    expect(after).toHaveLength(0)
  })

  it("enforces max queue size by replacing oldest deferred", async () => {
    // Fill queue to max (5)
    for (let i = 0; i < 5; i++) {
      await addToQueue(
        { entry: makeEntry(), action: "approve-entry", reason: `item-${i}` },
        QUEUE_PATH,
      )
    }
    // Defer the first one
    const items = await getPendingItems(QUEUE_PATH)
    await resolveItem(items[0].id, "deferred", QUEUE_PATH)

    // Add one more — should replace the deferred one
    await addToQueue(
      { entry: makeEntry(), action: "approve-entry", reason: "overflow" },
      QUEUE_PATH,
    )
    const after = await getPendingItems(QUEUE_PATH)
    expect(after.length).toBeLessThanOrEqual(5)
  })

  it("cleanupStale auto-rejects items older than 30 days", async () => {
    const oldEntry = makeEntry()
    await addToQueue(
      { entry: oldEntry, action: "approve-entry", reason: "old" },
      QUEUE_PATH,
    )
    // Manually backdate
    const { readFileSync } = await import("node:fs")
    const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"))
    queue.items[0].proposedAt = new Date(Date.now() - 31 * 86400000).toISOString()
    writeFileSync(QUEUE_PATH, JSON.stringify(queue))

    const cleaned = await cleanupStale(QUEUE_PATH)
    expect(cleaned).toBe(1)
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(0)
  })
})
