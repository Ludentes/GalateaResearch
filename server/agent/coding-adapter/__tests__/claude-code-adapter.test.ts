import { describe, it, expect, vi, beforeEach } from "vitest"
import type { CodingSessionMessage } from "../types"

// Mock the SDK before importing the adapter
const mockQuery = vi.fn()
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}))

import { ClaudeCodeAdapter } from "../claude-code-adapter"

/** Helper: collect all messages from an async iterable */
async function collect(iter: AsyncIterable<CodingSessionMessage>): Promise<CodingSessionMessage[]> {
  const results: CodingSessionMessage[] = []
  for await (const msg of iter) {
    results.push(msg)
  }
  return results
}

/** Create an async generator from an array of SDK messages */
async function* fakeStream(messages: Record<string, unknown>[]) {
  for (const msg of messages) {
    yield msg
  }
}

describe("ClaudeCodeAdapter", () => {
  let adapter: ClaudeCodeAdapter

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter()
    mockQuery.mockReset()
  })

  it("isAvailable() returns true", async () => {
    expect(await adapter.isAvailable()).toBe(true)
  })

  it('name is "claude-code"', () => {
    expect(adapter.name).toBe("claude-code")
  })

  it("query() calls SDK with correct options (cwd, systemPrompt, permissionMode)", async () => {
    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "result",
          subtype: "success",
          result: "done",
          duration_ms: 100,
          total_cost_usd: 0.01,
          num_turns: 1,
        },
      ]),
    )

    await collect(
      adapter.query({
        prompt: "fix the bug",
        systemPrompt: "you are a coder",
        workingDirectory: "/tmp/project",
        model: "claude-sonnet-4-20250514",
        maxBudgetUsd: 1.0,
      }),
    )

    expect(mockQuery).toHaveBeenCalledOnce()
    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.prompt).toBe("fix the bug")
    expect(callArgs.options.cwd).toBe("/tmp/project")
    expect(callArgs.options.systemPrompt).toBe("you are a coder")
    expect(callArgs.options.permissionMode).toBe("bypassPermissions")
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true)
    expect(callArgs.options.model).toBe("claude-sonnet-4-20250514")
    expect(callArgs.options.maxBudgetUsd).toBe(1.0)
  })

  it("maps assistant messages to text messages", async () => {
    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "I will fix the bug now." },
              { type: "tool_use", name: "Bash", input: { command: "ls" }, id: "tu_1" },
            ],
          },
        },
        {
          type: "result",
          subtype: "success",
          result: "done",
          duration_ms: 500,
          total_cost_usd: 0.02,
          num_turns: 2,
        },
      ]),
    )

    const messages = await collect(
      adapter.query({
        prompt: "fix bug",
        systemPrompt: "coder",
        workingDirectory: "/tmp",
      }),
    )

    expect(messages[0]).toEqual({ type: "text", text: "I will fix the bug now." })
    expect(messages[1]).toMatchObject({
      type: "tool_call",
      toolName: "Bash",
      toolInput: { command: "ls" },
    })
    const result = messages[2]
    expect(result.type).toBe("result")
    if (result.type === "result") {
      expect(result.subtype).toBe("success")
    }
  })

  it("wires preToolUse hook as SDK PreToolUse callback", async () => {
    const preToolUse = vi.fn().mockResolvedValue({ allowed: true, reason: "safe" })

    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "result",
          subtype: "success",
          result: "ok",
          duration_ms: 50,
          num_turns: 1,
        },
      ]),
    )

    await collect(
      adapter.query({
        prompt: "test",
        systemPrompt: "sys",
        workingDirectory: "/tmp",
        hooks: { preToolUse },
      }),
    )

    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options.hooks).toBeDefined()
    expect(callArgs.options.hooks.PreToolUse).toBeDefined()
    expect(callArgs.options.hooks.PreToolUse).toHaveLength(1)

    // Invoke the SDK hook callback and verify it delegates to our hook
    const sdkCallback = callArgs.options.hooks.PreToolUse[0].hooks[0]
    const hookResult = await sdkCallback({
      tool_name: "Bash",
      tool_input: { command: "rm -rf /" },
    })
    expect(preToolUse).toHaveBeenCalledWith("Bash", { command: "rm -rf /" })
    expect(hookResult.hookSpecificOutput.permissionDecision).toBe("allow")
    expect(hookResult.hookSpecificOutput.hookEventName).toBe("PreToolUse")
  })

  it("BDD: Adapter injects CLAUDE.md — settingSources includes 'project'", async () => {
    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "result",
          subtype: "success",
          result: "ok",
          duration_ms: 10,
          num_turns: 1,
        },
      ]),
    )

    await collect(
      adapter.query({
        prompt: "test",
        systemPrompt: "sys",
        workingDirectory: "/tmp",
      }),
    )

    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options.settingSources).toContain("project")
  })

  it("BDD: SDK session timeout — AbortController is passed to SDK", async () => {
    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "result",
          subtype: "success",
          result: "ok",
          duration_ms: 10,
          num_turns: 1,
        },
      ]),
    )

    await collect(
      adapter.query({
        prompt: "test",
        systemPrompt: "sys",
        workingDirectory: "/tmp",
        timeout: 30000,
      }),
    )

    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options.abortController).toBeInstanceOf(AbortController)
  })

  it("handles SDK error results gracefully (maps to subtype 'error')", async () => {
    mockQuery.mockReturnValue(
      fakeStream([
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["Something went wrong"],
          duration_ms: 200,
          total_cost_usd: 0.005,
          num_turns: 1,
        },
      ]),
    )

    const messages = await collect(
      adapter.query({
        prompt: "test",
        systemPrompt: "sys",
        workingDirectory: "/tmp",
      }),
    )

    expect(messages).toHaveLength(1)
    const result = messages[0]
    expect(result.type).toBe("result")
    if (result.type === "result") {
      expect(result.subtype).toBe("error")
      expect(result.text).toBe("Something went wrong")
      expect(result.durationMs).toBe(200)
    }
  })
})
