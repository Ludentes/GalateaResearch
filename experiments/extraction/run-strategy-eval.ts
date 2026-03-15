/**
 * Run extraction pipeline with different strategies and compare against golden dataset.
 *
 * Usage: pnpm tsx experiments/extraction/run-strategy-eval.ts <developer> [strategy] <session-files...>
 * Example: pnpm tsx experiments/extraction/run-strategy-eval.ts qp heuristics-only ~/data/qp/*.jsonl
 *          pnpm tsx experiments/extraction/run-strategy-eval.ts qp cloud ~/data/qp/*.jsonl
 *
 * Requires:
 * - Golden dataset: experiments/extraction/expected-models.yaml
 * - For cloud strategy: OPENROUTER_API_KEY env var
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { resetConfigCache } from "../../server/engine/config"
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
    "the",
    "for",
    "and",
    "with",
    "from",
    "not",
    "all",
    "use",
    "should",
    "must",
    "can",
    "has",
    "are",
    "was",
    "our",
    "its",
    "that",
    "this",
    "when",
    "before",
    "after",
    "first",
    "then",
    "also",
    "into",
  ])
  return expected
    .toLowerCase()
    .replace(/[()—–-]/g, " ")
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
  if (!developer || process.argv.length < 4) {
    console.error(
      "Usage: pnpm tsx experiments/extraction/run-strategy-eval.ts <developer> [strategy] <session-files...>",
    )
    console.error("  strategy: heuristics-only | cloud (default: both)")
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

  // Parse args: [developer] [strategy?] [files...]
  const validStrategies = ["heuristics-only", "cloud", "hybrid"]
  const maybeStrategy = process.argv[3]
  const hasExplicitStrategy = validStrategies.includes(maybeStrategy)

  // Get session files from remaining args
  const fileArgs = process.argv.slice(hasExplicitStrategy ? 4 : 3)
  const jsonlFiles = fileArgs.filter(
    (f) => f.endsWith(".jsonl") && !path.basename(f).includes("_"),
  )
  if (jsonlFiles.length === 0) {
    console.error("No .jsonl session files provided")
    process.exit(1)
  }

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

  // Determine which strategies to run
  const strategies: string[] = hasExplicitStrategy
    ? [maybeStrategy]
    : ["heuristics-only", "cloud"]

  // Cloud needs OPENROUTER_API_KEY
  if (strategies.includes("cloud") && !process.env.OPENROUTER_API_KEY) {
    console.warn("OPENROUTER_API_KEY not set — skipping cloud strategy")
    const idx = strategies.indexOf("cloud")
    if (idx >= 0) strategies.splice(idx, 1)
  }

  // Override strategy by temporarily patching config.yaml, then restoring
  const configPath = path.join(
    import.meta.dirname,
    "../../server/engine/config.yaml",
  )
  const originalConfig = readFileSync(configPath, "utf-8")

  for (const strategy of strategies) {
    // Patch config.yaml with the target strategy
    const patchedConfig = originalConfig.replace(
      /^(\s+strategy:\s*).+$/m,
      `$1${strategy}`,
    )
    writeFileSync(configPath, patchedConfig)
    resetConfigCache()

    const tempDir = path.join(import.meta.dirname, `.tmp-eval-${strategy}`)
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true })
    mkdirSync(tempDir, { recursive: true })
    const storePath = path.join(tempDir, "entries.jsonl")

    console.log(`\n--- Strategy: ${strategy} ---`)
    const t0 = Date.now()
    let sessionErrors = 0

    for (let i = 0; i < jsonlFiles.length; i++) {
      process.stdout.write(`\r  Session ${i + 1}/${jsonlFiles.length}...`)
      try {
        await runExtraction({
          transcriptPath: jsonlFiles[i],
          storePath,
          force: true,
        })
      } catch {
        sessionErrors++
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
    console.log(`  Recall: ${totalFound}/${allExpected.length} (${recallPct}%)`)
    console.log(`  Time: ${elapsed}s`)
    if (sessionErrors > 0)
      console.log(`  Errors: ${sessionErrors} sessions failed`)

    // Dump entries for analysis
    const resultsDir = path.join(import.meta.dirname, "results")
    mkdirSync(resultsDir, { recursive: true })
    const dumpPath = path.join(
      resultsDir,
      `${developer}-${strategy}-entries.jsonl`,
    )
    const { writeFileSync: wfs } = await import("node:fs")
    wfs(dumpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n")
    console.log(`  Entries saved: ${dumpPath}`)

    // Cleanup
    rmSync(tempDir, { recursive: true })
  }

  // Restore original config
  writeFileSync(configPath, originalConfig)
  resetConfigCache()
}

main()
