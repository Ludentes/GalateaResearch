import { rmSync } from "fs"
import { retrieveRelevantFacts } from "../../server/memory/fact-retrieval"
import {
  appendEntries,
  readEntries,
  supersedeEntry,
} from "../../server/memory/knowledge-store"

;(async () => {
  const testStore = "/tmp/galatea-supersede-test.jsonl"

  await appendEntries(
    [
      {
        id: "old-mqtt",
        type: "fact",
        content: "MQTT uses QoS 0 (fire and forget)",
        confidence: 0.8,
        entities: ["mqtt"],
        source: "test",
        extractedAt: new Date().toISOString(),
      },
      {
        id: "new-mqtt",
        type: "fact",
        content: "MQTT uses QoS 1 (at least once delivery)",
        confidence: 0.95,
        entities: ["mqtt"],
        source: "test",
        extractedAt: new Date().toISOString(),
      },
    ],
    testStore,
  )

  console.log("--- Before supersession ---")
  let entries = await readEntries(testStore)
  let active = entries.filter((e) => !e.supersededBy)
  console.log("Total:", entries.length, "| Active:", active.length)

  await supersedeEntry("old-mqtt", "new-mqtt", testStore)

  console.log()
  console.log("--- After supersession ---")
  entries = await readEntries(testStore)
  active = entries.filter((e) => !e.supersededBy)
  console.log("Total:", entries.length, "| Active:", active.length)
  const old = entries.find((e) => e.id === "old-mqtt")
  console.log("old-mqtt.supersededBy:", old?.supersededBy, "(should be new-mqtt)")

  const result = await retrieveRelevantFacts("MQTT QoS", testStore)
  console.log()
  console.log("--- Retrieval after supersession ---")
  console.log("Retrieved:", result.entries.length)
  for (const e of result.entries) {
    console.log("  -", e.id, "|", e.content)
  }
  const hasOld = result.entries.some((e) => e.id === "old-mqtt")
  console.log("Old entry in results:", hasOld, "(should be false)")

  rmSync(testStore, { force: true })
  process.exit(0)
})()
