import { rmSync } from "node:fs"
import { updateAgentState } from "../../server/agent/agent-state"
import { tick } from "../../server/agent/tick"

const statePath = "/tmp/galatea-trace6-state.json"
await updateAgentState(
  {
    lastActivity: new Date().toISOString(),
    pendingMessages: [
      {
        from: "dev-2",
        channel: "discord",
        content: "How do I implement push notifications in Expo?",
        receivedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    activeTask: { project: "customer-app", topic: "push notifications" },
  },
  statePath,
)

const result = await tick("manual", { statePath })
console.log("Action:", result.action)
console.log("knowledge_sufficiency:", result.homeostasis.knowledge_sufficiency)
console.log("Retrieved facts:", result.retrievedFacts.length)
console.log("Response preview:", result.response?.text?.slice(0, 200))
rmSync(statePath, { force: true })
process.exit(0)
