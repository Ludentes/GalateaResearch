// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createPreToolUseHook } from "../hooks"

describe("createPreToolUseHook", () => {
  it("returns allow for safe Read operation", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "MEDIUM",
    })
    const result = await hook("Read", { file_path: "/workspace/project/src/app.ts" })
    expect(result.decision).toBe("allow")
  })

  it("returns deny for rm -rf", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "MEDIUM",
    })
    const result = await hook("Bash", { command: "rm -rf /" })
    expect(result.decision).toBe("deny")
  })

  it("returns deny for path outside workspace", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "HIGH",
    })
    const result = await hook("Write", { file_path: "/etc/passwd", content: "hacked" })
    expect(result.decision).toBe("deny")
  })

  it("returns ask for destructive action from HIGH trust", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "HIGH",
    })
    const result = await hook("Bash", { command: "git push --force origin feature/x" })
    expect(result.decision).toBe("ask")
  })

  it("returns deny for push to protected branch", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "MEDIUM",
    })
    const result = await hook("Bash", { command: "git push origin main" })
    expect(result.decision).toBe("deny")
  })

  it("returns allow for push to feature branch", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "MEDIUM",
    })
    const result = await hook("Bash", { command: "git push origin feature/profile" })
    expect(result.decision).toBe("allow")
  })

  // BDD: fail-open for reads
  it("returns allow for Read even from NONE trust", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "NONE",
    })
    const result = await hook("Read", { file_path: "/workspace/project/src/app.ts" })
    expect(result.decision).toBe("allow")
  })

  // BDD: fail-closed for writes
  it("returns deny for destructive Bash from LOW trust", async () => {
    const hook = createPreToolUseHook({
      workingDirectory: "/workspace/project",
      trustLevel: "LOW",
    })
    const result = await hook("Bash", { command: "git reset --hard HEAD~5" })
    expect(result.decision).toBe("deny")
  })
})
