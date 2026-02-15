import { existsSync, mkdirSync, rmSync } from "fs"
import { ollama } from "ai-sdk-ollama"
import { assembleContext } from "../../server/memory/context-assembler"
import { runExtraction } from "../../server/memory/extraction-pipeline"
import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"

;(async () => {
  const testDir = "/tmp/galatea-e2e-test"
  if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  mkdirSync(testDir, { recursive: true })
  const storePath = testDir + "/entries.jsonl"

  // Step 1: Extract knowledge from a transcript
  console.log("=== Step 1: Extract ===")
  const extraction = await runExtraction({
    transcriptPath: "server/memory/__tests__/fixtures/sample-session.jsonl",
    model: ollama("glm-4.7-flash"),
    storePath,
  })
  console.log("Extracted:", extraction.entries.length, "entries")
  for (const e of extraction.entries.slice(0, 3)) {
    console.log("  -", e.type, ":", e.content.slice(0, 60))
  }

  // Step 2: Retrieve facts for a related query
  console.log()
  console.log("=== Step 2: Retrieve ===")
  const message = "I want to set up pnpm for this project"
  const facts = await retrieveRelevantFacts(message, storePath)
  console.log("Query:", message)
  console.log("Retrieved:", facts.entries.length, "facts")
  console.log("Matched entities:", facts.matchedEntities)
  for (const e of facts.entries) {
    console.log("  -", e.content.slice(0, 80))
  }

  // Step 3: Assemble context with those facts
  console.log()
  console.log("=== Step 3: Assemble Context ===")
  const ctx = await assembleContext({
    storePath,
    agentContext: {
      sessionId: "e2e-test",
      currentMessage: message,
      messageHistory: [],
      retrievedFacts: facts.entries,
    },
  })
  console.log("System prompt length:", ctx.systemPrompt.length)
  console.log("Knowledge entries:", ctx.metadata.knowledgeEntries)
  console.log("Homeostasis guidance:", ctx.metadata.homeostasisGuidanceIncluded)

  const hasLearnedKnowledge = ctx.systemPrompt.includes("LEARNED KNOWLEDGE")
  console.log("Has LEARNED KNOWLEDGE section:", hasLearnedKnowledge)

  if (facts.entries.length > 0) {
    const firstFact = facts.entries[0].content.slice(0, 30)
    const factInPrompt = ctx.systemPrompt.includes(firstFact)
    console.log("First retrieved fact in prompt:", factInPrompt)
  }

  rmSync(testDir, { recursive: true })
  process.exit(0)
})()
