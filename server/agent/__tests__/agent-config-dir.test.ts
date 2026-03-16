// @vitest-environment node

import { describe, expect, it } from "vitest"
import { loadAgentSpec } from "../agent-spec"

describe("claude_config_dir in agent specs", () => {
  it("beki spec has claude_config_dir set", async () => {
    const spec = await loadAgentSpec("beki")
    expect(spec.claude_config_dir).toBe("/home/newub/.claude-agents")
  })

  it("besa spec has claude_config_dir set", async () => {
    const spec = await loadAgentSpec("besa")
    expect(spec.claude_config_dir).toBe("/home/newub/.claude-agents")
  })

  it("claude_config_dir is placed alongside workspace", async () => {
    const spec = await loadAgentSpec("beki")
    expect(spec.workspace).toBeDefined()
    expect(spec.claude_config_dir).toBeDefined()
  })
})
