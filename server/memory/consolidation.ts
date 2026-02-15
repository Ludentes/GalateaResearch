import { getConsolidationConfig } from "../engine/config"
import { isDuplicate, readEntries, renderMarkdown } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

/**
 * Find entries that appear 3+ times with high average confidence.
 * These are candidates for promotion to CLAUDE.md.
 */
export async function findConsolidationCandidates(
  storePath: string,
): Promise<KnowledgeEntry[]> {
  const cfg = getConsolidationConfig()
  const entries = await readEntries(storePath)
  const groups = groupSimilarEntries(entries)

  return groups
    .filter((group) => group.length >= cfg.min_occurrences)
    .filter((group) => {
      const avgConf =
        group.reduce((sum, e) => sum + e.confidence, 0) / group.length
      return avgConf >= cfg.min_avg_confidence
    })
    .map((group) => {
      // Pick highest-confidence entry as representative
      return group.sort((a, b) => b.confidence - a.confidence)[0]
    })
}

function groupSimilarEntries(entries: KnowledgeEntry[]): KnowledgeEntry[][] {
  const groups: KnowledgeEntry[][] = []
  const assigned = new Set<string>()

  for (const entry of entries) {
    if (assigned.has(entry.id)) continue
    const group = [entry]
    assigned.add(entry.id)

    for (const other of entries) {
      if (assigned.has(other.id)) continue
      if (isDuplicate(other, [entry])) {
        group.push(other)
        assigned.add(other.id)
      }
    }
    groups.push(group)
  }
  return groups
}

/**
 * Consolidate high-confidence repeated entries into a CLAUDE.md file.
 */
export async function consolidateToClaudeMd(
  storePath: string,
  mdPath: string,
): Promise<{ consolidated: number }> {
  const candidates = await findConsolidationCandidates(storePath)
  if (candidates.length === 0) return { consolidated: 0 }

  await renderMarkdown(candidates, mdPath)
  return { consolidated: candidates.length }
}
