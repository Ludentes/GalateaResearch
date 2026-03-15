import { describe, expect, it } from "vitest"
import type {
  AdapterHooks,
  CodingQueryOptions,
  CodingSessionMessage,
} from "../types"

describe("CodingToolAdapter types", () => {
  it("discriminated union: text message has text field", () => {
    const msg: CodingSessionMessage = { type: "text", text: "hello" }
    expect(msg.type).toBe("text")
    if (msg.type === "text") {
      expect(msg.text).toBe("hello")
    }
  })

  it("discriminated union: result message has subtype and durationMs", () => {
    const msg: CodingSessionMessage = {
      type: "result",
      subtype: "success",
      text: "done",
      durationMs: 1234,
      costUsd: 0.05,
      numTurns: 3,
    }
    expect(msg.type).toBe("result")
    if (msg.type === "result") {
      expect(msg.subtype).toBe("success")
      expect(msg.durationMs).toBe(1234)
      expect(msg.costUsd).toBe(0.05)
    }
  })

  it("CodingQueryOptions requires prompt, systemPrompt, workingDirectory; hooks are optional", () => {
    const opts: CodingQueryOptions = {
      prompt: "fix the bug",
      systemPrompt: "you are a coder",
      workingDirectory: "/tmp",
    }
    expect(opts.prompt).toBe("fix the bug")
    expect(opts.hooks).toBeUndefined()
    expect(opts.timeout).toBeUndefined()
    expect(opts.maxBudgetUsd).toBeUndefined()
    expect(opts.model).toBeUndefined()
  })

  it("AdapterHooks fields are all optional", () => {
    const emptyHooks: AdapterHooks = {}
    expect(emptyHooks.preToolUse).toBeUndefined()
    expect(emptyHooks.postToolUse).toBeUndefined()
    expect(emptyHooks.onStop).toBeUndefined()

    const partialHooks: AdapterHooks = {
      preToolUse: async () => ({ decision: "allow" as const, reason: "safe" }),
    }
    expect(partialHooks.preToolUse).toBeDefined()
    expect(partialHooks.postToolUse).toBeUndefined()
  })
})
