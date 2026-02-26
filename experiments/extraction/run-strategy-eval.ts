/**
 * Run extraction pipeline with different strategies and compare against golden dataset.
 *
 * Usage: pnpm tsx experiments/extraction/run-strategy-eval.ts <developer>
 * Example: pnpm tsx experiments/extraction/run-strategy-eval.ts qp
 *
 * Requires:
 * - Golden dataset: experiments/extraction/expected-models.yaml
 * - Session files: ~/w/galatea-data/transcripts/<developer>/*.jsonl
 * - For cloud strategy: OPENROUTER_API_KEY env var
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { runExtraction } from "../../server/memory/extraction-pipeline"
import { readEntries } from "../../server/memory/knowledge-store"
import type { KnowledgeEntry } from "../../server/memory/types"

// --- Golden dataset helpers (matching compare-golden.ts) ---
interface ExpectedModel {
  user_model?: { preferences?: string[] }
  team_model?: { rules?: string[]; workflow?: string[] }
  project_model?: {
    decisions?: string[]
    rules?: string[]
    facts?: string[]
    lessons?: string[]
  }
}

function extractKeyTerms(expected: string): string[] {
  const stops = new Set([
    "the", "for", "and", "with", "from", "not", "all", "use", "should",
    "must", "can", "has", "are", "was", "our", "its", "that", "this",
    "when", "before", "after", "first", "then", "also", "into",
  ])
  return expected
    .toLowerCase()
    .replace(/[()—–\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stops.has(w))
    .slice(0, 4)
}

function checkRecall(
  entries: KnowledgeEntry[],
  expected: string[],
): { found: string[]; missed: string[] } {
  const found: string[] = []
  const missed: string[] = []

  for (const exp of expected) {
    const terms = extractKeyTerms(exp)
    const match = entries.some((e) => {
      const content = e.content.toLowerCase()
      const matched = terms.filter((t) => content.includes(t))
      return matched.length >= Math.ceil(terms.length / 2)
    })
    if (match) {
      found.push(exp)
    } else {
      missed.push(exp)
    }
  }

  return { found, missed }
}

async function main() {
  const developer = process.argv[2]
  if (!developer) {
    console.error(
      "Usage: pnpm tsx experiments/extraction/run-strategy-eval.ts <developer>",
    )
    process.exit(1)
  }

  // Load golden dataset
  const yamlPath = path.join(import.meta.dirname, "expected-models.yaml")
  const allModels = parseYaml(readFileSync(yamlPath, "utf-8"))
  const expected: ExpectedModel = allModels[developer]
  if (!expected) {
    console.error(`No golden model for: ${developer}`)
    console.error(`Available: ${Object.keys(allModels).join(", ")}`)
    process.exit(1)
  }

  // Find session files
  const dataDir = path.join(
    process.env.HOME!,
    "w/galatea-data/transcripts",
    developer,
  )
  if (!existsSync(dataDir)) {
    console.error(`No transcript dir: ${dataDir}`)
    process.exit(1)
  }

  // Get .jsonl files (skip files with _ in name — those are metadata)
  const jsonlFiles = readdirSync(dataDir)
    .filter((f) => f.endsWith(".jsonl") && !f.includes("_"))
    .map((f) => path.join(dataDir, f))

  console.log(`\n=== Strategy Evaluation: ${developer} ===`)
  console.log(`Sessions: ${jsonlFiles.length}`)

  // Collect all expected items
  const categories = [
    { name: "User preferences", items: expected.user_model?.preferences },
    { name: "Team rules", items: expected.team_model?.rules },
    { name: "Project decisions", items: expected.project_model?.decisions },
    { name: "Project rules", items: expected.project_model?.rules },
    { name: "Project facts", items: expected.project_model?.facts },
    { name: "Project lessons", items: expected.project_model?.lessons },
  ]
  const allExpected = categories.flatMap((c) => c.items ?? [])
  console.log(`Golden items: ${allExpected.length}`)

  // Only heuristics-only for now — cloud/hybrid need live LLM
  const strategies = ["heuristics-only"] as const

  for (const strategy of strategies) {
    const tempDir = path.join(import.meta.dirname, `.tmp-eval-${strategy}`)
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true })
    mkdirSync(tempDir, { recursive: true })
    const storePath = path.join(tempDir, "entries.jsonl")

    console.log(`\n--- Strategy: ${strategy} ---`)
    const t0 = Date.now()

    for (let i = 0; i < jsonlFiles.length; i++) {
      process.stdout.write(`\r  Session ${i + 1}/${jsonlFiles.length}...`)
      try {
        await runExtraction({
          transcriptPath: jsonlFiles[i],
          storePath,
          force: true,
        })
      } catch {
        // Skip failed sessions
      }
    }
    console.log()

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const entries = await readEntries(storePath)

    // Recall per category
    let totalFound = 0
    for (const cat of categories) {
      if (!cat.items?.length) continue
      const r = checkRecall(entries, cat.items)
      totalFound += r.found.length
      console.log(`  ${cat.name}: ${r.found.length}/${cat.items.length}`)
      for (const f of r.found) console.log(`    + ${f}`)
      for (const m of r.missed) console.log(`    - ${m}`)
    }

    // Overall recall
    const recallPct =
      allExpected.length > 0
        ? ((totalFound / allExpected.length) * 100).toFixed(1)
        : "N/A"
    console.log(`  Entries extracted: ${entries.length}`)
    console.log(
      `  Recall: ${totalFound}/${allExpected.length} (${recallPct}%)`,
    )
    console.log(`  Time: ${elapsed}s`)

    // Cleanup
    rmSync(tempDir, { recursive: true })
  }

  console.log(
    "\nNote: cloud and hybrid strategies require live LLM.",
    "Run compare-golden-cloud.ts or compare-golden-hybrid.ts for those.",
  )
}

main()
