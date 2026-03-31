// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { AssembledContext } from "../../../memory/types"
import type { CodingSessionMessage, CodingToolAdapter } from "../types"
import { executeWorkArc } from "../work-arc"

function createMockAdapter(
  messages: CodingSessionMessage[],
): CodingToolAdapter {
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
          {
            role: "assistant" as const,
            content: "Created file A",
            timestamp: new Date().toISOString(),
          },
          {
            role: "tool_call" as const,
            content: '{"file_path":"a.ts"}',
            toolName: "Write",
            timestamp: new Date().toISOString(),
          },
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

  it("populates extractedTurns on successful completion with transcript", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 1000,
        transcript: [
          {
            role: "assistant" as const,
            content: "Using pnpm for this project",
            timestamp: new Date().toISOString(),
          },
          {
            role: "tool_call" as const,
            content: '{"command":"pnpm test"}',
            toolName: "Bash",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-extract", description: "Test extraction" },
      context: makeContext(),
      workingDirectory: "/tmp/test-extraction",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("completed")
    expect(result.extractedTurns).toBeDefined()
    expect(result.extractedTurns!.length).toBe(2)
    expect(result.extractedTurns![0].role).toBe("assistant")
  })

  it("does not populate extractedTurns on failed result", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "error",
        text: "Failed",
        durationMs: 100,
        transcript: [
          {
            role: "assistant" as const,
            content: "Tried something",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-no-extract", description: "Test no extraction" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("failed")
    expect(result.extractedTurns).toBeUndefined()
  })

  it("retries once on stall and returns success if retry succeeds", async () => {
    let callCount = 0
    const adapter: CodingToolAdapter = {
      name: "mock-stall",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: vi.fn().mockImplementation(async function* () {
        callCount++
        if (callCount === 1) {
          yield { type: "text", text: "Starting..." }
          yield {
            type: "result",
            subtype: "stall",
            text: "Stream stalled after 120s",
            durationMs: 120_000,
            transcript: [],
          }
        } else {
          yield { type: "text", text: "Working..." }
          yield {
            type: "result",
            subtype: "success",
            text: "Done on retry",
            durationMs: 5000,
            transcript: [],
          }
        }
      }),
    }

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-stall", description: "Task that stalls" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("completed")
    expect(result.text).toBe("Done on retry")
    expect(result.stallDetected).toBe(true)
    expect(result.retryAttempted).toBe(true)
    expect(callCount).toBe(2)
  })

  it("returns timeout if stall retry also fails", async () => {
    const adapter: CodingToolAdapter = {
      name: "mock-double-stall",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: vi.fn().mockImplementation(async function* () {
        yield {
          type: "result",
          subtype: "stall",
          text: "Stream stalled",
          durationMs: 120_000,
          transcript: [],
        }
      }),
    }

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-stall-2", description: "Double stall" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    // Second stall maps to "timeout" via statusMap
    expect(result.status).toBe("timeout")
    expect(result.stallDetected).toBe(true)
    expect(result.retryAttempted).toBe(true)
  })

  it("sets stallDetected=false on normal completion", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "success",
        text: "Done",
        durationMs: 1000,
        transcript: [],
      },
    ])

    const result = await executeWorkArc({
      adapter,
      task: { id: "task-normal", description: "Normal task" },
      context: makeContext(),
      workingDirectory: "/tmp",
      trustLevel: "MEDIUM",
    })

    expect(result.status).toBe("completed")
    expect(result.stallDetected).toBe(false)
    expect(result.retryAttempted).toBe(false)
  })

  it("preserves error details for retry with narrower scope", async () => {
    const adapter = createMockAdapter([
      {
        type: "result",
        subtype: "error",
        text: "API rate limit exceeded",
        durationMs: 15_000,
        transcript: [
          {
            role: "assistant" as const,
            content: "Created notification-service.ts",
            timestamp: new Date().toISOString(),
          },
          {
            role: "assistant" as const,
            content: "Created notification-types.ts",
            timestamp: new Date().toISOString(),
          },
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
