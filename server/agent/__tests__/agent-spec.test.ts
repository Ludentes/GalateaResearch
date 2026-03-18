// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { listAgentIds, loadAgentSpec } from "../agent-spec"

describe("loadAgentSpec", () => {
  it("loads Beki telejobs spec via projectId", async () => {
    const spec = await loadAgentSpec("beki", "telejobs")
    expect(spec.agent.id).toBe("beki")
    expect(spec.agent.name).toBe("Beki")
    expect(spec.agent.role).toBe("Full-stack developer")
    expect(spec.workspace).toBe("/home/newub/w/telejobs")
    expect(spec.hard_blocks).toContain("push directly to master")
    expect(spec.hard_blocks).toContain(
      "deploy to production or staging",
    )
  })

  it("loads trust configuration from telejobs spec", async () => {
    const spec = await loadAgentSpec("beki", "telejobs")
    expect(spec.trust.default_identity_trust).toBe("none")
    const dasha = spec.trust.identities.find(
      (i) => i.entity === "dasha",
    )
    expect(dasha).toBeDefined()
    expect(dasha!.level).toBe("high")
    expect(spec.trust.channels.dashboard).toBe("full")
    expect(spec.trust.channels.discord).toBe("high")
  })

  it("loads tools_context with telejobs multi-repo info", async () => {
    const spec = await loadAgentSpec("beki", "telejobs")
    expect(spec.tools_context).toContain("telejobs/tj-frontend")
    expect(spec.tools_context).toContain("telejobs/tj-processor")
    expect(spec.tools_context).toContain("telejobs/tj-collector")
    expect(spec.tools_context).toContain("poetry")
    expect(spec.tools_context).toContain("pnpm")
  })

  it("loads workflow_instructions with superpowers skills", async () => {
    const spec = await loadAgentSpec("beki", "telejobs")
    expect(spec.workflow_instructions).toContain("/brainstorming")
    expect(spec.workflow_instructions).toContain(
      "/subagent-driven-development",
    )
    expect(spec.workflow_instructions).toContain(
      "/end-of-day-report",
    )
    expect(spec.workflow_instructions).toContain(
      "/requesting-code-review",
    )
  })

  it("throws on missing spec file", async () => {
    await expect(loadAgentSpec("nonexistent")).rejects.toThrow()
  })

  it("throws on missing project spec", async () => {
    await expect(
      loadAgentSpec("beki", "no-such-project"),
    ).rejects.toThrow()
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
  it("discovers agents with active specs", async () => {
    const ids = await listAgentIds()
    expect(ids).toContain("beki")
    // besa has no active project specs (only archived)
    expect(ids).not.toContain("besa")
  })
})
