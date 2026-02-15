import { rmSync } from "fs"
import { updateAgentState } from "../../server/agent/agent-state"
import { tick } from "../../server/agent/tick"

;(async () => {
  const statePath = "/tmp/galatea-tick-idle-test.json"

  await updateAgentState(
    {
      lastActivity: new Date().toISOString(),
      pendingMessages: [],
      activeTask: { project: "umka", topic: "MQTT" },
    },
    statePath,
  )

  const result = await tick("manual", {
    statePath,
    storePath: "data/memory/entries.jsonl",
  })

  console.log("Action:", result.action, "(should be idle)")
  console.log("Pending:", result.pendingMessages.length, "(should be 0)")
  console.log(
    "productive_engagement:",
    result.homeostasis.productive_engagement,
    "(should be HEALTHY)",
  )

  rmSync(statePath, { force: true })
  process.exit(0)
})()
