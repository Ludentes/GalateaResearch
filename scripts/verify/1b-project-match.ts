import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"

;(async () => {
  const result = await retrieveRelevantFacts(
    "How does the MQTT client work in Umka?",
  )
  console.log("Matched entities:", result.matchedEntities)
  console.log("Entries found:", result.entries.length)
  for (const e of result.entries.slice(0, 5)) {
    console.log("  -", e.type, "|", e.content.slice(0, 80))
  }
  process.exit(0)
})()
