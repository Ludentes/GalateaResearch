// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}))

vi.mock("../../observation/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"
import {
  clearAgentSession,
  getAgentSessionId,
  runClaudeCodeRespond,
} from "../claude-code-respond"

const mockQuery = sdkQuery as ReturnType<typeof vi.fn>

function createMockStream(messages: Record<string, unknown>[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const msg of messages) {
        yield msg
      }
    },
  }
}

describe("runClaudeCodeRespond", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAgentSession("test-agent")
  })

  afterEach(() => {
    clearAgentSession("test-agent")
  })

  it("returns text from successful result", async () => {
    mockQuery.mockReturnValue(
      createMockStream([
        {
          type: "system",
          subtype: "init",
          session_id: "sess-123",
        },
        {
          type: "result",
          subtype: "success",
          result: "Hello, world!",
          session_id: "sess-123",
          total_cost_usd: 0.001,
        },
      ]),
    )

    const result = await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "You are a test agent",
      userMessage: "Hi",
    })

    expect(result.ok).toBe(true)
    expect(result.text).toBe("Hello, world!")
    expect(result.costUsd).toBe(0.001)
    expect(result.sessionId).toBe("sess-123")
  })

  it("includes conversation history in prompt", async () => {
    mockQuery.mockReturnValue(
      createMockStream([
        {
          type: "result",
          subtype: "success",
          result: "Second response",
          session_id: "sess-456",
        },
      ]),
    )

    await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "Test",
      userMessage: "Follow-up question",
      history: [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
      ],
    })

    const prompt = mockQuery.mock.calls[0][0].prompt
    expect(prompt).toContain("conversation_history")
    expect(prompt).toContain("First question")
    expect(prompt).toContain("First answer")
    expect(prompt).toContain("Follow-up question")
  })

  it("counts tool calls from assistant messages", async () => {
    mockQuery.mockReturnValue(
      createMockStream([
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Let me read that file." },
              { type: "tool_use", name: "Read", input: { path: "/foo" } },
            ],
          },
        },
        {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Bash", input: { command: "ls" } },
            ],
          },
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          session_id: "sess-789",
        },
      ]),
    )

    const result = await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "Test",
      userMessage: "Read a file",
    })

    expect(result.toolCalls).toBe(2)
    expect(result.toolNames).toEqual(["Read", "Bash"])
  })

  it("clears session on error and returns error text", async () => {
    // First establish a session
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "system", subtype: "init", session_id: "sess-err" },
        {
          type: "result",
          subtype: "success",
          result: "ok",
          session_id: "sess-err",
        },
      ]),
    )
    await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "Test",
      userMessage: "Hi",
    })
    expect(getAgentSessionId("test-agent")).toBe("sess-err")

    // Now simulate error
    mockQuery.mockImplementation(() => {
      throw new Error("Connection refused")
    })

    const result = await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "Test",
      userMessage: "Hi again",
    })

    expect(result.ok).toBe(false)
    expect(result.text).toContain("Connection refused")
    expect(getAgentSessionId("test-agent")).toBeUndefined()
  })

  it("passes bypassPermissions and persistSession", async () => {
    mockQuery.mockReturnValue(
      createMockStream([
        {
          type: "result",
          subtype: "success",
          result: "ok",
          session_id: "s1",
        },
      ]),
    )

    await runClaudeCodeRespond({
      agentId: "test-agent",
      systemPrompt: "Test",
      userMessage: "Hi",
    })

    const opts = mockQuery.mock.calls[0][0].options
    expect(opts.permissionMode).toBe("bypassPermissions")
    expect(opts.allowDangerouslySkipPermissions).toBe(true)
    expect(opts.persistSession).toBe(false)
  })
})
