import { defineEventHandler, HTTPError, readBody } from "h3"
import { runExtraction } from "../../memory/extraction-pipeline"
import { getLLMConfig } from "../../providers/config"
import { createOllamaModel } from "../../providers/ollama"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { transcriptPath } = body as { transcriptPath?: string }

  if (!transcriptPath) {
    throw new HTTPError("transcriptPath is required", { status: 400 })
  }

  const config = getLLMConfig()
  const model = createOllamaModel(config.model, config.ollamaBaseUrl)

  const result = await runExtraction({
    transcriptPath,
    model,
    storePath: "data/memory/entries.jsonl",
  })

  return {
    stats: result.stats,
    entries: result.entries.map((e) => ({
      type: e.type,
      content: e.content,
      confidence: e.confidence,
      entities: e.entities,
    })),
  }
})
