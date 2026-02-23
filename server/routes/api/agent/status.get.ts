import { defineEventHandler } from "h3"
import { getAgentState } from "../../../agent/agent-state"
import {
  assessDimensions,
  getGuidance,
} from "../../../engine/homeostasis-engine"

export default defineEventHandler(async () => {
  const state = await getAgentState()

  const agentContext = {
    sessionId: "status-check",
    currentMessage: "",
    messageHistory: [] as Array<{
      role: "user" | "assistant"
      content: string
    }>,
    retrievedFacts: [] as Array<{ content: string; confidence: number }>,
    hasAssignedTask: !!state.activeTask,
  }

  const homeostasis = assessDimensions(agentContext)
  const guidance = getGuidance(homeostasis)

  return {
    homeostasis,
    guidance,
    pendingMessages: state.pendingMessages,
    lastActivity: state.lastActivity,
    activeTask: state.activeTask,
    activityLog: (state.activityLog ?? []).slice(-20),
  }
})
