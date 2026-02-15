import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"

;(async () => {
  const result = await retrieveRelevantFacts(
    "What do we know about Alina and her preferences?",
  )
  console.log("Matched entities:", result.matchedEntities)
  console.log("Entries found:", result.entries.length)
  for (const e of result.entries) {
    console.log("  -", e.type, "|", e.content.slice(0, 80))
    console.log("    about:", JSON.stringify(e.about))
  }
  process.exit(0)
})()
