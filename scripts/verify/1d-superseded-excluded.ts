import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"
import { readEntries } from "../../server/memory/knowledge-store"

;(async () => {
  const all = await readEntries("data/memory/entries.jsonl")
  const superseded = all.filter((e) => e.supersededBy)
  console.log("Total entries:", all.length)
  console.log("Superseded entries:", superseded.length)

  if (superseded.length > 0) {
    const word = superseded[0].content.split(" ").find((w) => w.length > 4)
    const result = await retrieveRelevantFacts(word || "test")
    const found = result.entries.filter((e) => e.supersededBy)
    console.log("Superseded in results:", found.length, "(should be 0)")
  }
  process.exit(0)
})()
