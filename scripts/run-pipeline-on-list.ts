/**
 * run-pipeline-on-list.ts
 * Run the full extraction pipeline on a newline-separated list of session paths.
 *
 * Usage:
 *   pnpm tsx scripts/run-pipeline-on-list.ts --sessions <file> --store <path>
 */
import { config } from "dotenv"
config({ override: true })
import { parseArgs } from "node:util"
import { existsSync, mkdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createOpenRouterModel } from "../server/providers/openrouter"
import { runExtraction } from "../server/memory/extraction-pipeline"

const { values } = parseArgs({
  options: {
    sessions: { type: "string" },
    store: { type: "string" },
    model: { type: "string", default: "anthropic/claude-haiku-4.5" },
    force: { type: "boolean", default: false },
  },
})

async function main() {
  if (!values.sessions || !values.store) {
    console.error("Usage: pnpm tsx scripts/run-pipeline-on-list.ts --sessions <file> --store <path>")
    process.exit(1)
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) { console.error("OPENROUTER_API_KEY required"); process.exit(1) }

  const raw = await readFile(values.sessions, "utf-8")
  const sessions = raw.split("\n").map(s => s.trim()).filter(Boolean)
  const storePath = path.resolve(values.store)
  const storeDir = path.dirname(storePath)
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })

  const model = createOpenRouterModel(values.model!, apiKey)
  console.log(`Sessions: ${sessions.length}`)
  console.log(`Model: ${values.model}`)
  console.log(`Store: ${storePath}\n${"=".repeat(60)}`)

  let totalEntries = 0, totalTurns = 0
  for (const [i, sessionPath] of sessions.entries()) {
    console.log(`\n[${i + 1}/${sessions.length}] ${path.basename(sessionPath)}`)
    try {
      const result = await runExtraction({ transcriptPath: sessionPath, model, storePath, force: values.force })
      if (result.stats.skippedAlreadyExtracted) { console.log("  (already extracted)"); continue }
      const { turnsProcessed, signalTurns, entriesExtracted, duplicatesSkipped } = result.stats
      console.log(`  turns: ${turnsProcessed} total, ${signalTurns} signal`)
      console.log(`  entries: ${entriesExtracted} extracted, ${duplicatesSkipped} dedup, ${result.entries.length} new`)
      totalEntries += result.entries.length
      totalTurns += turnsProcessed
      for (const e of result.entries) console.log(`    [${e.type}] ${e.content}`)
    } catch (err) {
      console.error(`  ERROR: ${err}`)
    }
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`TOTAL: ${sessions.length} sessions, ${totalTurns} turns, ${totalEntries} new entries`)
}
main().catch(e => { console.error(e); process.exit(1) })
