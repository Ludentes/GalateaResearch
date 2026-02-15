import { rmSync } from "fs"
import { updateAgentState } from "../../server/agent/agent-state"
import { tick } from "../../server/agent/tick"

;(async () => {
  const statePath = "/tmp/galatea-tick-test-state.json"
  const storePath = "data/memory/entries.jsonl"

  await updateAgentState(
    {
      lastActivity: new Date().toISOString(),
      pendingMessages: [
        {
          from: "alina",
          channel: "discord",
          content: "Привет! Как дела с проектом? Что нового?",
          receivedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
        },
      ],
      activeTask: { project: "umka", topic: "MQTT persistence" },
    },
    statePath,
  )

  const result = await tick("manual", { statePath, storePath })

  console.log("=== TICK RESULT ===")
  console.log("Action:", result.action)
  console.log("Target:", JSON.stringify(result.action_target))
  console.log("Pending messages:", result.pendingMessages.length)
  console.log()
  console.log("--- Homeostasis ---")
  for (const [dim, state] of Object.entries(result.homeostasis)) {
    if (
      typeof state === "string" &&
      ["LOW", "HEALTHY", "HIGH"].includes(state)
    ) {
      console.log("  ", dim, ":", state)
    }
  }
  console.log()
  console.log("--- Self Model ---")
  console.log("Available providers:", result.selfModel.availableProviders)
  console.log()
  console.log("--- Retrieved Facts ---")
  console.log("Total:", result.retrievedFacts.length)
  const alinaFacts = result.retrievedFacts.filter((f) =>
    f.content.toLowerCase().includes("alina"),
  )
  console.log("About Alina:", alinaFacts.length)
  for (const f of alinaFacts.slice(0, 3)) {
    console.log("  -", f.content.slice(0, 80))
  }
  console.log()
  console.log("--- Response ---")
  console.log(result.response?.text?.slice(0, 300))

  rmSync(statePath, { force: true })
  process.exit(0)
})()
