// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { listAgentIds, loadAgentSpec } from "../agent-spec"

describe("loadAgentSpec", () => {
  it("loads Beki spec from YAML", async () => {
    const spec = await loadAgentSpec("beki")
    expect(spec.agent.id).toBe("beki")
    expect(spec.agent.name).toBe("Beki")
    expect(spec.agent.role).toBe("Mobile developer")
    expect(spec.workspace).toBe("/home/newub/w/agentsproject/agenttestproject")
    expect(spec.hard_blocks).toContain("push directly to main")
  })

  it("loads Besa spec with PM role", async () => {
    const spec = await loadAgentSpec("besa")
    expect(spec.agent.id).toBe("besa")
    expect(spec.agent.role).toBe("Project Manager")
  })

  it("loads trust configuration correctly", async () => {
    const spec = await loadAgentSpec("beki")
    expect(spec.trust.default_identity_trust).toBe("none")
    const sasha = spec.trust.identities.find((i) => i.entity === "sasha")
    expect(sasha).toBeDefined()
    expect(sasha!.level).toBe("full")
    expect(spec.trust.channels.dashboard).toBe("full")
    expect(spec.trust.channels.discord).toBe("high")
  })

  it("loads tools_context from agent specs", async () => {
    const beki = await loadAgentSpec("beki")
    expect(beki.tools_context).toContain("read_file")
    expect(beki.tools_context).toContain("write_file")
    expect(beki.tools_context).toContain("bash")

    const besa = await loadAgentSpec("besa")
    expect(besa.tools_context).toContain("read_file")
    expect(besa.tools_context).toContain("bash")
    expect(besa.tools_context).toContain("issue create")
  })

  it("throws on missing spec file", async () => {
    await expect(loadAgentSpec("nonexistent")).rejects.toThrow()
  })

  it("throws on agent ID mismatch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-spec-"))
    const specPath = join(dir, "spec.yaml")
    await writeFile(
      specPath,
      [
        "agent:",
        '  id: "wrong-id"',
        '  name: "Test"',
        '  role: "Test"',
        '  domain: "Test"',
        'workspace: "/tmp"',
        "allowed_branches: []",
        "thresholds: {}",
        "hard_blocks: []",
        "trust:",
        "  identities: []",
        "  channels: {}",
        '  default_identity_trust: "none"',
        'knowledge_store: "/tmp/k.jsonl"',
        'operational_memory: "/tmp/o.jsonl"',
      ].join("\n"),
    )
    await expect(loadAgentSpec("expected-id", specPath)).rejects.toThrow(
      "mismatch",
    )
    await rm(dir, { recursive: true })
  })
})

describe("listAgentIds", () => {
  it("discovers all registered agents", async () => {
    const ids = await listAgentIds()
    expect(ids).toContain("beki")
    expect(ids).toContain("besa")
    expect(ids).toHaveLength(2)
  })
})
