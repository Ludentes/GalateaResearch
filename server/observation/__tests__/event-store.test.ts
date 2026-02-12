// @vitest-environment node
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { appendEvents, readEvents } from "../event-store"
import type { ObservationEvent } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-observations")
const TEST_STORE = path.join(TEST_DIR, "events.jsonl")

describe("Event Store", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("returns empty array when store doesn't exist", async () => {
    const events = await readEvents("/nonexistent/events.jsonl")
    expect(events).toEqual([])
  })

  it("appends events to new store", async () => {
    const events: ObservationEvent[] = [
      {
        id: "1",
        timestamp: "2026-02-12T10:00:00Z",
        type: "log",
        source: "test",
        attributes: { severity: "INFO" },
        body: "Test log",
      },
    ]

    await appendEvents(TEST_STORE, events)

    const stored = await readEvents(TEST_STORE)
    expect(stored).toHaveLength(1)
    expect(stored[0].body).toBe("Test log")
  })

  it("appends events to existing store", async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(
      TEST_STORE,
      `${JSON.stringify({
        id: "1",
        timestamp: "2026-02-12T10:00:00Z",
        type: "log",
        source: "test",
        attributes: {},
        body: "Existing",
      })}\n`,
    )

    const newEvents: ObservationEvent[] = [
      {
        id: "2",
        timestamp: "2026-02-12T11:00:00Z",
        type: "log",
        source: "test",
        attributes: {},
        body: "New",
      },
    ]

    await appendEvents(TEST_STORE, newEvents)

    const stored = await readEvents(TEST_STORE)
    expect(stored).toHaveLength(2)
    expect(stored[0].body).toBe("Existing")
    expect(stored[1].body).toBe("New")
  })

  it("handles multiple events in single append", async () => {
    const events: ObservationEvent[] = [
      {
        id: "1",
        timestamp: "2026-02-12T10:00:00Z",
        type: "log",
        source: "test",
        attributes: {},
        body: "Event 1",
      },
      {
        id: "2",
        timestamp: "2026-02-12T10:01:00Z",
        type: "trace",
        source: "test",
        attributes: {},
        traceId: "abc123",
      },
    ]

    await appendEvents(TEST_STORE, events)

    const stored = await readEvents(TEST_STORE)
    expect(stored).toHaveLength(2)
    expect(stored[0].type).toBe("log")
    expect(stored[1].type).toBe("trace")
  })
})
