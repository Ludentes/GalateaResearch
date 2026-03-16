/**
 * build-gold-draft.ts
 *
 * Reads entries.jsonl, groups entries by extraction timestamp (= original chunk),
 * and produces a draft gold-standard.jsonl for manual review.
 *
 * Each output item has:
 *   - input: reconstructed from evidence fields (since raw transcript chunks aren't stored)
 *   - expected: the extracted items from that chunk
 *
 * Usage: pnpm tsx experiments/extraction/build-gold-draft.ts
 */

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

interface Entry {
  id: string
  type: string
  content: string
  confidence: number
  evidence?: string
  entities: string[]
  source: string
  extractedAt: string
  about?: { entity: string; type: string }
}

interface GoldItem {
  input: Array<{ role: "user" | "assistant"; content: string }>
  expected: {
    items: Array<{
      type: string
      content: string
      confidence: number
      entities: string[]
      about?: { entity: string; type: string }
    }>
  }
  _meta: {
    extractedAt: string
    entryCount: number
    note: string
  }
}

const ROOT = resolve(import.meta.dirname, "../..")
const ENTRIES_PATH = resolve(ROOT, "data/memory/entries.jsonl")
const OUTPUT_PATH = resolve(import.meta.dirname, "gold-standard.jsonl")

async function main() {
  const raw = await readFile(ENTRIES_PATH, "utf-8")
  const entries: Entry[] = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))

  // Group by extractedAt (same timestamp = same extraction chunk)
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = entry.extractedAt
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }

  const goldItems: GoldItem[] = []

  for (const [timestamp, chunkEntries] of groups) {
    // Reconstruct pseudo-input from evidence fields
    // Each evidence snippet becomes a user turn
    const evidenceTexts = chunkEntries
      .map((e) => e.evidence)
      .filter((ev): ev is string => !!ev && ev.length > 10)

    // Deduplicate similar evidence texts
    const uniqueEvidence = deduplicateEvidence(evidenceTexts)

    // Build input turns from evidence
    const input: GoldItem["input"] = uniqueEvidence.map((ev) => ({
      role: "user" as const,
      content: ev,
    }))

    // If no evidence available, create a placeholder
    if (input.length === 0) {
      input.push({
        role: "user",
        content: `[Evidence not available — review entries manually for chunk at ${timestamp}]`,
      })
    }

    // Build expected output — strip runtime fields, keep only schema fields
    const items = chunkEntries.map((e) => ({
      type: e.type,
      content: e.content,
      confidence: e.confidence,
      entities: e.entities,
      ...(e.about ? { about: e.about } : {}),
    }))

    goldItems.push({
      input,
      expected: { items },
      _meta: {
        extractedAt: timestamp,
        entryCount: chunkEntries.length,
        note: "DRAFT — review and correct about/entities/confidence fields",
      },
    })
  }

  // Write output
  const output = goldItems.map((item) => JSON.stringify(item)).join("\n")
  await writeFile(OUTPUT_PATH, `${output}\n`, "utf-8")

  console.log(
    `[build-gold-draft] Wrote ${goldItems.length} items to ${OUTPUT_PATH}`,
  )
  console.log(`[build-gold-draft] Total entries: ${entries.length}`)
  console.log(
    `[build-gold-draft] Items per chunk: min=${Math.min(...goldItems.map((g) => g.expected.items.length))}, max=${Math.max(...goldItems.map((g) => g.expected.items.length))}, avg=${(entries.length / goldItems.length).toFixed(1)}`,
  )
  console.log()
  console.log("Next steps:")
  console.log(
    "  1. Review gold-standard.jsonl — correct about, entities, confidence",
  )
  console.log("  2. Remove the _meta field from each item")
  console.log("  3. Run: pnpm tsx experiments/extraction/seed-dataset.ts")
}

function deduplicateEvidence(texts: string[]): string[] {
  const result: string[] = []
  for (const text of texts) {
    const normalized = text.toLowerCase().trim()
    const isDuplicate = result.some((existing) => {
      const existingNorm = existing.toLowerCase().trim()
      // Skip if one contains the other
      return (
        existingNorm.includes(normalized) || normalized.includes(existingNorm)
      )
    })
    if (!isDuplicate) {
      result.push(text)
    }
  }
  return result
}

main().catch(console.error)
