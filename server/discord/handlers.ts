import { addMessage } from "../agent/agent-state"
import type { InboundDiscordMessage } from "./adapter"
import { normalizeDiscordMessage } from "./adapter"

export type { InboundDiscordMessage }

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
  agentId = "galatea",
): Promise<void> {
  const cm = normalizeDiscordMessage(msg)
  cm.metadata.targetAgent = agentId
  const statePath =
    agentId === "galatea"
      ? undefined
      : `data/agents/${agentId}/state.json`
  await addMessage(cm, statePath)
}
