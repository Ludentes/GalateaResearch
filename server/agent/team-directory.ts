import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import YAML from "yaml"

export interface Teammate {
  id: string
  is_human: boolean
  identities: Record<string, string>
  description: string
}

const DEFAULT_TEAM_DIR = "data/team"

export async function loadTeamDirectory(
  dirPath = DEFAULT_TEAM_DIR,
): Promise<Teammate[]> {
  if (!existsSync(dirPath)) return []
  const entries = await readdir(dirPath)
  const teammates: Teammate[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".yaml")) continue
    try {
      const raw = await readFile(join(dirPath, entry), "utf-8")
      const parsed = YAML.parse(raw)
      if (parsed?.teammate?.id && parsed.teammate.identities) {
        teammates.push(parsed.teammate as Teammate)
      }
    } catch {
      // Skip malformed YAML files
    }
  }
  return teammates.sort((a, b) => a.id.localeCompare(b.id))
}

export function resolveIdentity(
  team: Teammate[],
  platform: string,
  username: string,
): Teammate | undefined {
  return team.find((t) => t.identities[platform] === username)
}
