import { parseArgs } from "node:util"
import { runExtraction } from "../server/memory/extraction-pipeline"
import { createOllamaModel } from "../server/providers/ollama"

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    store: {
      type: "string",
      short: "s",
      default: "data/memory/entries.jsonl",
    },
    model: { type: "string", short: "m", default: "glm-4.7-flash:latest" },
    "ollama-url": {
      type: "string",
      default: "http://localhost:11434",
    },
    force: { type: "boolean", short: "f", default: false },
  },
})

if (!values.input) {
  console.error(
    "Usage: pnpm tsx scripts/extract-knowledge.ts -i <session.jsonl> [-s store] [-m model]",
  )
  console.error("")
  console.error("  -i  Path to Claude Code JSONL session file")
  console.error(
    "  -s  Knowledge store path (default: data/memory/entries.jsonl)",
  )
  console.error("  -m  Ollama model (default: glm-4.7-flash:latest)")
  console.error("  -f  Force re-extraction even if session already processed")
  process.exit(1)
}

async function main() {
  const model = createOllamaModel(values.model!, values["ollama-url"]!)

  console.log(`Extracting knowledge from: ${values.input}`)
  console.log(`Using model: ${values.model}`)
  console.log(`Store: ${values.store}`)
  console.log("")

  const result = await runExtraction({
    transcriptPath: values.input!,
    model,
    storePath: values.store!,
    force: values.force,
  })

  if (result.stats.skippedAlreadyExtracted) {
    console.log("Session already extracted. Use -f to force re-extraction.")
    return
  }

  console.log(
    `Processed ${result.stats.turnsProcessed} turns (${result.stats.signalTurns} signal, ${result.stats.noiseTurns} noise)`,
  )
  console.log(
    `Extracted ${result.stats.entriesExtracted} items, ${result.stats.duplicatesSkipped} duplicates skipped`,
  )
  console.log(`${result.entries.length} new entries written`)
  console.log("")

  for (const entry of result.entries) {
    console.log(
      `  [${entry.type}] ${entry.content} (confidence: ${entry.confidence})`,
    )
  }
}

main().catch((err) => {
  console.error("Extraction failed:", err)
  process.exit(1)
})
