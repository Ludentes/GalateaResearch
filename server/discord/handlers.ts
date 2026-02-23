import { addMessage } from "../agent/agent-state"
import { normalizeDiscordMessage } from "./adapter"
import type { InboundDiscordMessage } from "./adapter"

export type { InboundDiscordMessage }

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
): Promise<void> {
  const cm = normalizeDiscordMessage(msg)
  await addMessage(cm)
}
