// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  type TickDecisionRecord,
  appendTickRecord,
  getTickRecordPath,
  readTickRecords,
} from "../tick-record"

const TEST_DIR = path.join(__dirname, "fixtures", "test-tick-records")
const TEST_PATH = path.join(TEST_DIR, "test.jsonl")

function makeRecord(
  overrides: Partial<TickDecisionRecord> = {},
): TickDecisionRecord {
  return {
    tickId: "tick-001",
    agentId: "beki",
    timestamp: new Date().toISOString(),
    trigger: { type: "message", source: "discord:sasha" },
    homeostasis: {
      knowledge_sufficiency: { state: "HEALTHY", method: "computed" },
    },
    guidance: [],
    routing: { level: "interaction", reasoning: "Quick question" },
    execution: {
      adapter: "direct-response",
      sessionResumed: false,
      toolCalls: 0,
      durationMs: 150,
    },
    resources: { inputTokens: 500, outputTokens: 100 },
    outcome: {
      action: "respond",
      response: "Yes, MR !42 was merged.",
      artifactsCreated: [],
      knowledgeEntriesCreated: 0,
    },
    ...overrides,
  }
}

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("TickDecisionRecord", () => {
  it("appends and reads a single record", async () => {
    const record = makeRecord()
    await appendTickRecord(record, TEST_PATH)
    const records = await readTickRecords(TEST_PATH)
    expect(records).toHaveLength(1)
    expect(records[0].tickId).toBe("tick-001")
    expect(records[0].routing.level).toBe("interaction")
  })

  it("appends multiple records without overwriting", async () => {
    await appendTickRecord(
      makeRecord({ tickId: "tick-001" }),
      TEST_PATH,
    )
    await appendTickRecord(
      makeRecord({ tickId: "tick-002" }),
      TEST_PATH,
    )
    await appendTickRecord(
      makeRecord({ tickId: "tick-003" }),
      TEST_PATH,
    )
    const records = await readTickRecords(TEST_PATH)
    expect(records).toHaveLength(3)
    expect(records[0].tickId).toBe("tick-001")
    expect(records[2].tickId).toBe("tick-003")
  })

  it("returns empty array when file does not exist", async () => {
    const records = await readTickRecords(
      "/tmp/nonexistent-file.jsonl",
    )
    expect(records).toEqual([])
  })

  it("supports limit and offset", async () => {
    for (let i = 0; i < 20; i++) {
      await appendTickRecord(
        makeRecord({
          tickId: `tick-${String(i).padStart(3, "0")}`,
        }),
        TEST_PATH,
      )
    }
    const records = await readTickRecords(TEST_PATH, {
      limit: 5,
      offset: 10,
    })
    expect(records).toHaveLength(5)
    expect(records[0].tickId).toBe("tick-010")
    expect(records[4].tickId).toBe("tick-014")
  })

  it("generates correct agent-specific file path", () => {
    expect(getTickRecordPath("beki")).toBe(
      "data/observations/ticks/beki.jsonl",
    )
    expect(getTickRecordPath("besa")).toBe(
      "data/observations/ticks/besa.jsonl",
    )
  })

  it("preserves all record fields through serialization", async () => {
    const record = makeRecord({
      homeostasis: {
        knowledge_sufficiency: {
          state: "HEALTHY",
          method: "computed",
        },
        certainty_alignment: { state: "LOW", method: "l2" },
        communication_health: { state: "ELEVATED" },
      },
      guidance: ["Ask before acting", "Check with PM"],
      routing: {
        level: "task",
        taskType: "coding",
        reasoning: "Task assignment detected",
      },
      execution: {
        adapter: "claude-code",
        sessionResumed: true,
        toolCalls: 12,
        durationMs: 45000,
      },
    })
    await appendTickRecord(record, TEST_PATH)
    const [restored] = await readTickRecords(TEST_PATH)
    expect(restored.homeostasis.certainty_alignment?.state).toBe(
      "LOW",
    )
    expect(restored.guidance).toEqual([
      "Ask before acting",
      "Check with PM",
    ])
    expect(restored.execution.adapter).toBe("claude-code")
    expect(restored.execution.sessionResumed).toBe(true)
    expect(restored.routing.taskType).toBe("coding")
  })
})
