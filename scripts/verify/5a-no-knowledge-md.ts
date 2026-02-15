import { existsSync, mkdirSync, rmSync } from "fs"
import { ollama } from "ai-sdk-ollama"
import { runExtraction } from "../../server/memory/extraction-pipeline"

;(async () => {
  const testDir = "/tmp/galatea-extraction-test"
  if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  mkdirSync(testDir, { recursive: true })

  const storePath = testDir + "/entries.jsonl"
  const mdPath = testDir + "/knowledge.md"

  await runExtraction({
    transcriptPath: "server/memory/__tests__/fixtures/sample-session.jsonl",
    model: ollama("glm-4.7-flash"),
    storePath,
  })

  console.log("entries.jsonl exists:", existsSync(storePath))
  console.log("knowledge.md exists:", existsSync(mdPath), "(should be false)")

  rmSync(testDir, { recursive: true })
  process.exit(0)
})()
