import type { KnowledgeEntry } from "./types"

export interface BatchDedupConfig {
  enabled: boolean
  minEntries?: number // don't bother if fewer than this (default: 5)
  provider?: string // LLM provider for dedup
  model?: string
}

export interface MergeInstruction {
  keep: number // index of entry to keep
  drop: number[] // indices of entries to merge into keep
  merged_content: string // combined content
}

export interface DedupResult {
  merges: MergeInstruction[]
}

/**
 * Format entries into a prompt for LLM-based dedup.
 * Groups by type, presents as numbered list.
 * Only includes types with 2+ entries (no point deduping singletons).
 */
export function formatDedupPrompt(entries: KnowledgeEntry[]): string {
  const byType = new Map<string, { idx: number; entry: KnowledgeEntry }[]>()
  entries.forEach((entry, idx) => {
    const list = byType.get(entry.type) || []
    list.push({ idx, entry })
    byType.set(entry.type, list)
  })

  let prompt =
    "You are merging duplicate knowledge entries extracted from developer conversations.\n" +
    "For each group, identify semantically duplicate entries that refer to the SAME concept and should be merged into one richer entry.\n\n" +
    'Return JSON: { "merges": [{ "keep": <index>, "drop": [<indices>], "merged_content": "<combined>" }] }\n\n' +
    "Rules:\n" +
    "- Only merge entries that refer to the SAME underlying concept\n" +
    "- If entries are distinct (different topics), do NOT merge them\n" +
    "- merged_content should combine the best parts of both entries\n" +
    '- Return { "merges": [] } if nothing should be merged\n\n'

  for (const [type, items] of byType) {
    if (items.length < 2) continue
    prompt += `## ${type} entries:\n`
    for (const { idx, entry } of items) {
      prompt += `[${idx}] ${entry.content}\n`
    }
    prompt += "\n"
  }

  return prompt
}

/**
 * Parse LLM response into merge instructions.
 * Tolerates markdown code fences around JSON.
 */
export function parseDedupResponse(response: string): DedupResult {
  // Strip markdown code fences if present
  const cleaned = response
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim()
  const json = JSON.parse(cleaned)
  return { merges: json.merges || [] }
}

/**
 * Apply merge instructions to entries.
 * Returns new array with merged content and dropped entries removed.
 */
export function applyMerges(
  entries: KnowledgeEntry[],
  result: DedupResult,
): KnowledgeEntry[] {
  const dropSet = new Set<number>()
  const merged = [...entries]

  for (const merge of result.merges) {
    if (merge.keep >= 0 && merge.keep < entries.length) {
      merged[merge.keep] = {
        ...merged[merge.keep],
        content: merge.merged_content,
      }
      for (const d of merge.drop) {
        if (d >= 0 && d < entries.length) {
          dropSet.add(d)
        }
      }
    }
  }

  return merged.filter((_, i) => !dropSet.has(i))
}

/**
 * Run batch dedup on extracted entries.
 * Returns deduplicated entries (merged where LLM identified duplicates).
 * Gracefully falls back to original entries on any error.
 */
export async function batchDedup(
  entries: KnowledgeEntry[],
  config: BatchDedupConfig,
): Promise<KnowledgeEntry[]> {
  if (!config.enabled) return entries
  if (entries.length < (config.minEntries ?? 5)) return entries

  // Only send to LLM if there are potential duplicates (same type with 2+ entries)
  const typeCounts = new Map<string, number>()
  for (const e of entries) {
    typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1)
  }
  const hasDuplicateTypes = [...typeCounts.values()].some((c) => c >= 2)
  if (!hasDuplicateTypes) return entries

  const prompt = formatDedupPrompt(entries)

  try {
    const { getModel } = await import("../providers/index.js")
    const { generateText } = await import("ai")
    const { model } = getModel(config.provider, config.model)
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0,
    })

    const result = parseDedupResponse(text)
    return applyMerges(entries, result)
  } catch {
    return entries // Graceful fallback
  }
}
