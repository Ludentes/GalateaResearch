// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { executeWorkArc } from "../work-arc"
import type { CodingToolAdapter, CodingSessionMessage } from "../types"
import type { AssembledContext } from "../../../memory/types"

function createMockAdapter(messages: CodingSessionMessage[]): CodingToolAdapter {
  return {
    name: "mock",
    isAvailable: vi.fn().mockResolvedValue(true),
    query: vi.fn().mockImplementation(async function* () {
      for (const msg of messages) yield msg
    }),
  }
}

function makeContext(): AssembledContext {
  return {
    systemPrompt: "You are Galatea",
    sections: [],
    metadata: {
      prepromptsLoaded: 0,
      knowledgeEntries: 0,
      rulesCount: 0,
      homeostasisGuidanceIncluded: false,
    },
  }
}

describe("executeWorkArc", () => {
  it("delegates task to adapter and returns success result", async () => {
    const adapter = createMockAdapter([
      { type: "text", text: "Creating file..." },
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 5000,
        costUsd: 0.02,
        numTurns: 3,
        transcript: [],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-1", description: "Create hello.ts" },
      context: makeContext(),
      workingDirectory: "/workspace/project",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("completed")
    expect(result.text).toBe("Done")
    expect(adapter.query).toHaveBeenCalledOnce()
  })

  it("reports adapter unavailable as blocked", async () => {
    const adapter = createMockAdapter([])
    ;(adapter.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false)

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-2", description: "Some task" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("blocked")
    expect(result.text).toContain("unavailable")
  })

  it("captures error from adapter", async () => {
    const adapter = createMockAdapter([
      { type: "error", error: "SDK crashed" },
      {
        type: "result",
        subtype: "error",
        text: "SDK crashed",
        durationMs: 100,
        transcript: [],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-3", description: "Fail task" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("failed")
  })

  it("captures timeout with partial transcript", async () => {
    const adapter = createMockAdapter([
      { type: "text", text: "Starting work..." },
      {
        type: "result",
        subtype: "timeout",
        text: "Session exceeded time limit",
        durationMs: 300_000,
        transcript: [
          { role: "assistant" as const, content: "Created file A", timestamp: new Date().toISOString() },
          { role: "tool_call" as const, content: '{"file_path":"a.ts"}', toolName: "Write", timestamp: new Date().toISOString() },
        ],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-timeout", description: "Long task" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("timeout")
    expect(result.transcript.length).toBe(2)
  })

  it("preserves error details for retry with narrower scope", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "error",
        text: "API rate limit exceeded",
        durationMs: 15_000,
        transcript: [
          { role: "assistant" as const, content: "Created notification-service.ts", timestamp: new Date().toISOString() },
          { role: "assistant" as const, content: "Created notification-types.ts", timestamp: new Date().toISOString() },
        ],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-retry", description: "Add push notification support" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("failed")
    expect(result.text).toContain("rate limit")
    expect(result.transcript.length).toBe(2)
  })
})
