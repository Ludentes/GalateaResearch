import { addPendingMessage } from "../agent/agent-state"
import type { PendingMessage } from "../agent/types"
import { normalizeDiscordMessage } from "./adapter"
import type { InboundDiscordMessage } from "./adapter"

export type { InboundDiscordMessage }

/**
 * Handle an inbound Discord message: normalize to ChannelMessage, then
 * convert to PendingMessage for the current agent state queue.
 *
 * During Phase F transition, we store as PendingMessage in state.json.
 * Once the agent loop migrates to ChannelMessage natively, this shim
 * can be removed.
 */
export async function handleInboundMessage(
  msg: InboundDiscordMessage,
): Promise<void> {
  const cm = normalizeDiscordMessage(msg)

  // Shim: convert ChannelMessage → PendingMessage for current state format
  const pending: PendingMessage = {
    from: cm.from,
    channel: cm.channel,
    content: cm.content,
    receivedAt: cm.receivedAt,
    metadata: Object.fromEntries(
      Object.entries(cm.metadata)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [k, v as string]),
    ),
  }

  await addPendingMessage(pending)
}
