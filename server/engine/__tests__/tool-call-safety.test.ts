// @vitest-environment node
import { describe, expect, it } from "vitest"
import { checkToolCallSafety } from "../homeostasis-engine"
import type { ToolCallCheckInput } from "../types"

describe("checkToolCallSafety — branch protection", () => {
  it("denies push to main", () => {
    const input: ToolCallCheckInput = {
      toolName: "Bash",
      toolArgs: { command: "git push origin main" },
      trustLevel: "MEDIUM",
    }
    expect(checkToolCallSafety(input).decision).toBe("deny")
  })

  it("asks for push to production from HIGH trust", () => {
    const input: ToolCallCheckInput = {
      toolName: "Bash",
      toolArgs: { command: "git push origin production" },
      trustLevel: "HIGH",
    }
    expect(checkToolCallSafety(input).decision).toBe("ask")
  })

  it("allows push to feature branch", () => {
    const input: ToolCallCheckInput = {
      toolName: "Bash",
      toolArgs: { command: "git push origin feature/profile-screen" },
      trustLevel: "MEDIUM",
    }
    expect(checkToolCallSafety(input).decision).toBe("allow")
  })

  it("asks for deleting main from HIGH trust", () => {
    const input: ToolCallCheckInput = {
      toolName: "Bash",
      toolArgs: { command: "git branch -D main" },
      trustLevel: "HIGH",
    }
    expect(checkToolCallSafety(input).decision).toBe("ask")
  })
})
