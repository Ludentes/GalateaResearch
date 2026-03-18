import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

export interface AgentSecrets {
  gitlab?: {
    token?: string
    ssh_key?: string
    ssh_host_alias?: string
  }
}

export interface AgentSpec {
  agent: {
    id: string
    name: string
    full_name?: string
    email?: string
    gitlab_username?: string
    role: string
    domain: string
  }
  workspace: string
  claude_config_dir?: string
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
  escalation_target?: {
    entity: string
    channel: string
  }
  tools_context?: string
  workflow_instructions?: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, "../../data/agents")

export async function loadAgentSpec(
  agentId: string,
  projectIdOrPath?: string,
): Promise<AgentSpec> {
  let resolvedPath: string
  if (projectIdOrPath && projectIdOrPath.includes("/")) {
    // Explicit path provided
    resolvedPath = projectIdOrPath
  } else if (projectIdOrPath) {
    // Project ID — resolve to per-project spec
    resolvedPath = join(AGENTS_DIR, agentId, "specs", `${projectIdOrPath}.yaml`)
  } else {
    // Fallback: legacy single spec.yaml
    resolvedPath = join(AGENTS_DIR, agentId, "spec.yaml")
  }
  const raw = await readFile(resolvedPath, "utf-8")
  const parsed = YAML.parse(raw) as AgentSpec
  if (parsed.agent.id !== agentId) {
    throw new Error(
      `Spec id mismatch: expected ${agentId}, got ${parsed.agent.id}`,
    )
  }
  return parsed
}

export async function loadAgentSecrets(agentId: string): Promise<AgentSecrets> {
  try {
    const secretsPath = join(AGENTS_DIR, agentId, "secrets.yaml")
    const raw = await readFile(secretsPath, "utf-8")
    return YAML.parse(raw) as AgentSecrets
  } catch {
    return {}
  }
}

/**
 * List available project IDs for an agent (from specs/ directory).
 */
export async function listAgentProjects(agentId: string): Promise<string[]> {
  try {
    const specsDir = await readdir(join(AGENTS_DIR, agentId, "specs"))
    return specsDir
      .filter((f) => f.endsWith(".yaml") && !f.endsWith(".archived"))
      .map((f) => f.replace(/\.yaml$/, ""))
  } catch {
    return []
  }
}

/**
 * Load the first available spec for an agent.
 * Tries legacy spec.yaml first, then first project spec.
 */
export async function loadAgentDefaultSpec(
  agentId: string,
): Promise<AgentSpec> {
  // Try legacy spec.yaml
  try {
    return await loadAgentSpec(agentId)
  } catch {
    // Fall through to per-project specs
  }
  const projects = await listAgentProjects(agentId)
  if (projects.length === 0) {
    throw new Error(`No specs found for agent ${agentId}`)
  }
  return loadAgentSpec(agentId, projects[0])
}

export async function listAgentIds(): Promise<string[]> {
  const entries = await readdir(AGENTS_DIR, {
    withFileTypes: true,
  })
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Check for legacy spec.yaml or per-project specs/ directory
    try {
      await readFile(join(AGENTS_DIR, entry.name, "spec.yaml"), "utf-8")
      ids.push(entry.name)
      continue
    } catch {
      // No spec.yaml — check for specs/ directory
    }
    try {
      const specsDir = await readdir(join(AGENTS_DIR, entry.name, "specs"))
      if (
        specsDir.some((f) => f.endsWith(".yaml") && !f.endsWith(".archived"))
      ) {
        ids.push(entry.name)
      }
    } catch {
      // No specs/ directory either — skip
    }
  }
  return ids.sort()
}
