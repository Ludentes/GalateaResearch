// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { CodingToolAdapter, CodingSessionMessage } from "../types"
import type { AssembledContext } from "../../../memory/types"

// Mock the feedback loop
const mockRecordOutcome = vi.fn().mockResolvedValue(undefined)
vi.mock("../../../memory/feedback-loop", () => ({
  recordOutcome: (...args: unknown[]) => mockRecordOutcome(...args),
}))

// Mock the hooks module to avoid importing engine dependencies
vi.mock("../hooks", () => ({
  createPreToolUseHook: () => async () => ({ allowed: true }),
}))

// Mock the transcript-to-extraction module
vi.mock("../transcript-to-extraction", () => ({
  transcriptToTurns: () => [],
}))

import { executeWorkArc } from "../work-arc"

function createMockAdapter(
  messages: CodingSessionMessage[],
): CodingToolAdapter {
  return {
    name: "mock-adapter",
    isAvailable: async () => true,
    query: async function* () {
      for (const msg of messages) {
        yield msg
      }
    },
  }
}

const baseContext: AssembledContext = {
  systemPrompt: "You are a helpful assistant.",
  sections: [],
  metadata: {
    prepromptsLoaded: 0,
    knowledgeEntries: 0,
    rulesCount: 0,
    homeostasisGuidanceIncluded: false,
  },
  exposedEntryIds: ["entry-1", "entry-2"],
}

describe("work-arc feedback integration", () => {
  beforeEach(() => {
    mockRecordOutcome.mockClear()
  })

  it("calls recordOutcome after successful work arc", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 5000,
        transcript: [],
      },
    ])

    await executeWorkArc({
      adapter,
      task: { id: "t1", description: "test task" },
      context: baseContext,
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
      storePath: "data/test/entries.jsonl",
    })

    // Wait for the async .catch() to resolve
    await new Promise((r) => setTimeout(r, 50))

    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
      ["entry-1", "entry-2"],
      "data/test/entries.jsonl",
    )
  })

  it("calls recordOutcome with failed status on error", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "error",
        text: "Something went wrong",
        durationMs: 1000,
        transcript: [],
      },
    ])

    await executeWorkArc({
      adapter,
      task: { id: "t2", description: "failing task" },
      context: baseContext,
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
      storePath: "data/test/entries.jsonl",
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
      ["entry-1", "entry-2"],
      "data/test/entries.jsonl",
    )
  })

  it("does not call recordOutcome when storePath is not provided", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 5000,
        transcript: [],
      },
    ])

    await executeWorkArc({
      adapter,
      task: { id: "t3", description: "no store" },
      context: baseContext,
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
      // no storePath
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(mockRecordOutcome).not.toHaveBeenCalled()
  })

  it("does not call recordOutcome when no exposedEntryIds", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 5000,
        transcript: [],
      },
    ])

    const contextWithoutIds: AssembledContext = {
      ...baseContext,
      exposedEntryIds: undefined,
    }

    await executeWorkArc({
      adapter,
      task: { id: "t4", description: "no ids" },
      context: contextWithoutIds,
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
      storePath: "data/test/entries.jsonl",
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(mockRecordOutcome).not.toHaveBeenCalled()
  })
})
