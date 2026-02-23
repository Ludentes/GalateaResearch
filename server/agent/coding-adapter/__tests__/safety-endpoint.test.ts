// @vitest-environment node
import { describe, expect, it } from "vitest"
import { checkToolCallSafety } from "../../../engine/homeostasis-engine"
import type { ToolCallCheckInput } from "../../../engine/types"

describe("safety check for adapter hooks", () => {
  it("allows Read within workspace", () => {
    const input: ToolCallCheckInput = {
      toolName: "Read",
      toolArgs: { file_path: "/workspace/project/src/app.ts" },
      trustLevel: "MEDIUM",
      workingDirectory: "/workspace/project",
    }
    expect(checkToolCallSafety(input).decision).toBe("allow")
  })

  it("denies push --force from MEDIUM trust", () => {
    const input: ToolCallCheckInput = {
      toolName: "Bash",
      toolArgs: { command: "git push --force origin main" },
      trustLevel: "MEDIUM",
      workingDirectory: "/workspace/project",
    }
    expect(checkToolCallSafety(input).decision).toBe("deny")
  })

  it("denies Write outside workspace", () => {
    const input: ToolCallCheckInput = {
      toolName: "Write",
      toolArgs: { file_path: "/etc/cron.d/backdoor" },
      trustLevel: "HIGH",
      workingDirectory: "/workspace/project",
    }
    expect(checkToolCallSafety(input).decision).toBe("deny")
  })
})
