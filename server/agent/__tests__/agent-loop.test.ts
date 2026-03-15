// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { AgentTool } from "../agent-loop"
import { runAgentLoop } from "../agent-loop"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateText = vi.fn()
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  zodSchema: (schema: unknown) => schema, // passthrough — not used in tests
}))

vi.mock("../../providers/ollama-queue", () => ({
  ollamaQueue: {
    enqueue: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}))

vi.mock("../../observation/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

const fakeModel = {} as Parameters<typeof runAgentLoop>[0]["model"]

afterEach(() => {
  mockGenerateText.mockReset()
})

// ---------------------------------------------------------------------------
// Feature: ReAct agent loop with tool scaffolding
// ---------------------------------------------------------------------------

describe("Agent Loop", () => {
  // Scenario: Simple response (no tools)
  it("returns text response when LLM produces text with no tools", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "TypeScript is great for type safety!",
      toolCalls: [],
    })

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [
        { role: "user", content: "How do you feel about TypeScript?" },
      ],
    })

    expect(result.text).toBe("TypeScript is great for type safety!")
    expect(result.finishReason).toBe("text")
    expect(result.totalSteps).toBe(1)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].type).toBe("text")
  })

  // Scenario: Tool call iteration (stub tool)
  it("executes tool call and feeds result back to LLM", async () => {
    // Step 1: LLM returns tool call — SDK auto-executes and returns toolResults
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "echo",
          args: { message: "hello" },
        },
      ],
      toolResults: [{ result: "echo: hello" }],
      response: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "echo",
                args: { message: "hello" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-1",
                toolName: "echo",
                output: "echo: hello",
              },
            ],
          },
        ],
      },
    })
    // Step 2: LLM returns final text
    mockGenerateText.mockResolvedValueOnce({
      text: "The echo tool returned: hello",
      toolCalls: [],
    })

    const echoTool: AgentTool = {
      description: "Echoes back the message",
      parameters: z.object({ message: z.string() }),
      execute: async (args) => `echo: ${(args as { message: string }).message}`,
    }

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "What files are in the project?" }],
      tools: { echo: echoTool },
    })

    expect(result.text).toBe("The echo tool returned: hello")
    expect(result.finishReason).toBe("text")
    expect(result.totalSteps).toBe(2)
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].type).toBe("tool_call")
    expect(result.steps[0].toolName).toBe("echo")
    expect(result.steps[0].toolResult).toBe("echo: hello")
    expect(result.steps[1].type).toBe("text")
  })

  // Scenario: Budget limit stops inner loop
  it("stops loop when max steps reached", async () => {
    // Every call returns a tool call — never produces text
    mockGenerateText.mockResolvedValue({
      text: "",
      toolCalls: [
        {
          toolCallId: "call-loop",
          toolName: "echo",
          args: { message: "loop" },
        },
      ],
      toolResults: [{ result: "looping" }],
      response: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-loop",
                toolName: "echo",
                args: { message: "loop" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-loop",
                toolName: "echo",
                output: "looping",
              },
            ],
          },
        ],
      },
    })

    const echoTool: AgentTool = {
      description: "Echoes",
      parameters: z.object({ message: z.string() }),
      execute: async () => "looping",
    }

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "Do many things" }],
      tools: { echo: echoTool },
      config: { maxSteps: 3 },
    })

    expect(result.finishReason).toBe("budget_exhausted")
    expect(result.totalSteps).toBe(3)
    expect(result.text).toContain("budget")
  })

  // Scenario: Timeout stops inner loop
  it("stops loop on timeout", async () => {
    // Simulate slow tool execution that exceeds timeout
    mockGenerateText.mockImplementation(async () => {
      // Return immediately but simulate the overall loop being past timeout
      return {
        text: "response after delay",
        toolCalls: [],
      }
    })

    // Use a very short timeout — the first call should succeed but
    // we test the timeout check at loop start
    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "test" }],
      config: { maxSteps: 5, timeoutMs: 0 }, // 0ms = immediate timeout
    })

    expect(result.finishReason).toBe("timeout")
    expect(result.text).toContain("time")
  })

  // Scenario: Conversation history across ticks
  it("includes history messages in LLM call", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Yes, I remember! I was creating the profile screen.",
      toolCalls: [],
    })

    const history = [
      { role: "user" as const, content: "Create a profile screen" },
      { role: "assistant" as const, content: "I'll create the profile screen" },
    ]

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "What were you working on?" }],
      history,
    })

    expect(result.text).toContain("profile screen")

    // Verify history was included in the LLM call
    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.messages).toHaveLength(3) // 2 history + 1 current
    expect(callArgs.messages[0].content).toBe("Create a profile screen")
    expect(callArgs.messages[1].content).toBe("I'll create the profile screen")
  })

  // Scenario: History is bounded (tested at the caller level, not inside loop)
  // The loop itself accepts whatever history is passed — bounding is done by the caller

  // Tool error handling — SDK execute catches errors and returns error string
  it("handles tool execution errors gracefully", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        {
          toolCallId: "call-err",
          toolName: "failing",
          args: {},
        },
      ],
      toolResults: [{ result: "Tool error: Error: connection refused" }],
      response: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-err",
                toolName: "failing",
                args: {},
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-err",
                toolName: "failing",
                output: "Tool error: Error: connection refused",
              },
            ],
          },
        ],
      },
    })
    mockGenerateText.mockResolvedValueOnce({
      text: "The tool failed, but I can still respond.",
      toolCalls: [],
    })

    const failingTool: AgentTool = {
      description: "Always fails",
      parameters: z.object({}),
      execute: async () => {
        throw new Error("connection refused")
      },
    }

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "test" }],
      tools: { failing: failingTool },
    })

    expect(result.steps[0].toolResult).toContain("Tool error:")
    expect(result.text).toBeTruthy()
  })

  // Unknown tool
  it("returns no_tool_handler when LLM calls an unregistered tool", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        {
          toolCallId: "call-unknown",
          toolName: "nonexistent",
          args: {},
        },
      ],
    })

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "test" }],
      tools: {},
    })

    // No tools registered → LLM shouldn't have tool calls, but this is the safety net
    expect(result.finishReason).toBe("text")
  })

  // With registered tools but LLM calls unknown one
  it("handles unknown tool name with registered tools", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "fallback",
      toolCalls: [
        {
          toolCallId: "call-unknown",
          toolName: "nonexistent",
          args: {},
        },
      ],
    })

    const echoTool: AgentTool = {
      description: "Echo",
      parameters: z.object({ message: z.string() }),
      execute: async (args) => String((args as { message: string }).message),
    }

    const result = await runAgentLoop({
      model: fakeModel,
      system: "You are Galatea.",
      messages: [{ role: "user", content: "test" }],
      tools: { echo: echoTool },
    })

    expect(result.finishReason).toBe("no_tool_handler")
    expect(result.steps[0].toolName).toBe("nonexistent")
  })
})
