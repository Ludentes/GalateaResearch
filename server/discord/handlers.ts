import { addMessage } from "../agent/agent-state"
import type { InboundDiscordMessage } from "./adapter"
import { normalizeDiscordMessage } from "./adapter"

export type { InboundDiscordMessage }

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
): Promise<void> {
  const cm = normalizeDiscordMessage(msg)
  await addMessage(cm)
}
