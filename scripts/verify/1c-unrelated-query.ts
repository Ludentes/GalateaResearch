import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"

;(async () => {
  const result = await retrieveRelevantFacts("Hello, how are you today?")
  console.log("Matched entities:", result.matchedEntities)
  console.log("Entries found:", result.entries.length)
  process.exit(0)
})()
