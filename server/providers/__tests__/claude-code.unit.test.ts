// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

const mockClaudeCode = vi.fn().mockReturnValue({ provider: "claude-code" })

vi.mock("ai-sdk-provider-claude-code", () => ({
  claudeCode: mockClaudeCode,
}))

describe("Claude Code Wrapper", () => {
  it("delegates to claudeCode provider with model ID", async () => {
    const { createClaudeCodeModel } = await import("../claude-code")
    const model = createClaudeCodeModel("sonnet")
    expect(mockClaudeCode).toHaveBeenCalledWith("sonnet")
    expect(model).toEqual({ provider: "claude-code" })
  })

  it("passes custom model ID through", async () => {
    const { createClaudeCodeModel } = await import("../claude-code")
    createClaudeCodeModel("opus")
    expect(mockClaudeCode).toHaveBeenCalledWith("opus")
  })
})
