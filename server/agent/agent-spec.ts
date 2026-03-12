import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import YAML from "yaml"

export interface AgentSpec {
  agent: {
    id: string
    name: string
    role: string
    domain: string
  }
  workspace: string
  allowed_branches: string[]
  thresholds: Record<string, { context: string }>
  hard_blocks: string[]
  trust: {
    identities: Array<{
      entity: string
      level: "full" | "high" | "medium" | "none"
    }>
    channels: Record<string, "full" | "high" | "medium" | "none">
    default_identity_trust: "full" | "high" | "medium" | "none"
  }
  knowledge_store: string
  operational_memory: string
  tools_context?: string
}

const AGENTS_DIR = "data/agents"

export async function loadAgentSpec(
  agentId: string,
  specPath?: string,
): Promise<AgentSpec> {
  const resolvedPath = specPath ?? join(AGENTS_DIR, agentId, "spec.yaml")
  const raw = await readFile(resolvedPath, "utf-8")
  const parsed = YAML.parse(raw) as AgentSpec
  if (parsed.agent.id !== agentId) {
    throw new Error(
      `Spec id mismatch: expected ${agentId}, got ${parsed.agent.id}`,
    )
  }
  return parsed
}

export async function listAgentIds(): Promise<string[]> {
  const entries = await readdir(AGENTS_DIR, {
    withFileTypes: true,
  })
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      await readFile(join(AGENTS_DIR, entry.name, "spec.yaml"), "utf-8")
      ids.push(entry.name)
    } catch {
      // No spec.yaml in this directory — skip
    }
  }
  return ids.sort()
}
