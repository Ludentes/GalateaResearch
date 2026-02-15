import { assembleContext } from "../../server/memory/context-assembler"
import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"

;(async () => {
  const message = "Tell me about Alina and her role"
  const facts = await retrieveRelevantFacts(message)

  console.log("--- WITH retrieval ---")
  console.log("Retrieved facts:", facts.entries.length)

  const ctx = await assembleContext({
    agentContext: {
      sessionId: "manual-test",
      currentMessage: message,
      messageHistory: [],
      retrievedFacts: facts.entries,
    },
  })

  console.log("Knowledge entries in context:", ctx.metadata.knowledgeEntries)
  console.log(
    "Homeostasis guidance included:",
    ctx.metadata.homeostasisGuidanceIncluded,
  )
  console.log("System prompt length:", ctx.systemPrompt.length)
  console.log()
  console.log("--- System prompt preview (first 500 chars) ---")
  console.log(ctx.systemPrompt.slice(0, 500))
  process.exit(0)
})()
