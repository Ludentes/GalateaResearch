import { rmSync } from "fs"
import { updateAgentState } from "../../server/agent/agent-state"
import { tick } from "../../server/agent/tick"

const statePath = "/tmp/galatea-trace4-state.json"
await updateAgentState(
  {
    lastActivity: new Date().toISOString(),
    pendingMessages: [
      {
        from: "pm",
        channel: "discord",
        content: "Implement user profile screen with edit functionality",
        receivedAt: new Date(Date.now() - 30_000).toISOString(),
      },
    ],
    activeTask: { project: "customer-app", topic: "user profile screen" },
  },
  statePath,
)

const result = await tick("manual", { statePath })
console.log("Action:", result.action)
console.log("Homeostasis:")
for (const [dim, state] of Object.entries(result.homeostasis)) {
  if (["LOW", "HEALTHY", "HIGH"].includes(state as string)) {
    console.log("  ", dim, ":", state)
  }
}
console.log("Retrieved facts:", result.retrievedFacts.length)
console.log("Response preview:", result.response?.text?.slice(0, 200))
rmSync(statePath, { force: true })
process.exit(0)
