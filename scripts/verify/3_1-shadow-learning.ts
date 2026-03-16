import { rmSync } from "node:fs"
import { ollama } from "ai-sdk-ollama"
import { runExtraction } from "../../server/memory/extraction-pipeline"

rmSync("/tmp/galatea-scenario-test", { recursive: true, force: true })

const result = await runExtraction({
  transcriptPath: "server/memory/__tests__/fixtures/sample-session.jsonl",
  model: ollama("glm-4.7-flash"),
  storePath: "/tmp/galatea-scenario-test/entries.jsonl",
  force: true,
})
console.log("Turns processed:", result.stats.turnsProcessed)
console.log("Signal turns:", result.stats.signalTurns)
console.log("Noise turns:", result.stats.noiseTurns)
console.log("Entries extracted:", result.stats.entriesExtracted)
console.log()
for (const e of result.entries.slice(0, 5)) {
  console.log(`[${e.type}] (conf: ${e.confidence}) ${e.content.slice(0, 80)}`)
}
process.exit(0)
