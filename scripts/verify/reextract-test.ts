/**
 * Quick test: re-extract a small chunk with gemma3:12b and compare quality.
 */
import { extractKnowledge, ExtractionSchema } from "../../server/memory/knowledge-extractor"
import { createOllamaModel } from "../../server/providers/ollama"
import type { TranscriptTurn } from "../../server/memory/types"

// Sample turns that should produce entries with `about` and `entities`
const sampleTurns: TranscriptTurn[] = [
  {
    role: "user",
    content:
      "Alina does not know what is IoTController, ModBus. We need to explain these concepts in simple terms for her.",
  },
  {
    role: "assistant",
    content:
      "I'll create simplified explanations of IoTController and ModBus for Alina, focusing on practical understanding rather than technical details.",
  },
  {
    role: "user",
    content:
      "Yes. Also she prefers Discord over email for communication. And we always use pnpm in this project, never npm.",
  },
  {
    role: "assistant",
    content: "Noted — Discord for Alina, pnpm for the project.",
  },
  {
    role: "user",
    content:
      "The presentation is tomorrow so this is ASAP. She will provide feedback by extending existing files with comments.",
  },
]

async function main() {
  const model = createOllamaModel("gemma3:12b", "http://localhost:11434")

  console.log("Extracting with gemma3:12b...")
  const t0 = Date.now()
  const entries = await extractKnowledge(sampleTurns, model, "test", 0)
  console.log(`Done in ${Date.now() - t0}ms, ${entries.length} entries\n`)

  for (const e of entries) {
    console.log(`  [${e.type}] ${e.content}`)
    console.log(`    confidence: ${e.confidence}`)
    console.log(`    entities: ${JSON.stringify(e.entities)}`)
    console.log(`    about: ${JSON.stringify(e.about ?? "NONE")}`)
    console.log(`    evidence: ${e.evidence.slice(0, 100)}`)
    console.log()
  }
}

main().catch(console.error)
