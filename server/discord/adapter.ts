import type { ChannelMessage, MessageType } from "../agent/types"

export interface InboundDiscordMessage {
  authorUsername: string
  content: string
  channelId: string
  messageId: string
  guildId?: string
  threadId?: string
}

/**
 * Normalize a raw Discord message into a ChannelMessage.
 * This is the single entry point for Discord → agent pipeline.
 */
export function normalizeDiscordMessage(
  msg: InboundDiscordMessage,
): ChannelMessage {
  const mentionedAgents = parseMentions(msg.content)
  const messageType = classifyMessage(msg.content, mentionedAgents)

  return {
    id: `discord-${msg.messageId}`,
    channel: "discord",
    direction: "inbound",
    routing: {
      ...(msg.threadId && { threadId: msg.threadId }),
      ...(mentionedAgents.length > 0 && { mentionedAgents }),
    },
    from: msg.authorUsername,
    content: msg.content,
    messageType,
    receivedAt: new Date().toISOString(),
    metadata: {
      discordChannelId: msg.channelId,
      discordMessageId: msg.messageId,
      ...(msg.guildId && { discordGuildId: msg.guildId }),
    },
  }
}

/** Extract @mentions that look like agent names */
function parseMentions(content: string): string[] {
  const matches = content.match(/@(\w+)/g)
  if (!matches) return []
  return matches.map((m) => m.slice(1).toLowerCase())
}

/** Classify message type based on content patterns */
function classifyMessage(
  _content: string,
  mentionedAgents: string[],
): MessageType {
  // If the message mentions an agent, treat as task assignment
  if (mentionedAgents.length > 0) return "task_assignment"
  return "chat"
}
