import { addPendingMessage } from "../agent/agent-state"
import type { PendingMessage } from "../agent/types"

interface InboundDiscordMessage {
  authorUsername: string
  content: string
  channelId: string
  messageId: string
  guildId?: string
}

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
): Promise<void> {
  const pending: PendingMessage = {
    from: msg.authorUsername,
    channel: "discord",
    content: msg.content,
    receivedAt: new Date().toISOString(),
    metadata: {
      discordChannelId: msg.channelId,
      discordMessageId: msg.messageId,
      ...(msg.guildId && { discordGuildId: msg.guildId }),
    },
  }

  await addPendingMessage(pending)
}
