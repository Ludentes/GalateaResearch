import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import { getDiscordConfig } from "../engine/config"
import { handleInboundMessage } from "./handlers"
import { splitMessage } from "./message-split"

export interface AgentBot {
  agentId: string
  client: Client
  stop(): Promise<void>
}

export async function createAgentBot(
  agentId: string,
  token: string,
): Promise<AgentBot> {
  const config = getDiscordConfig()

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  })

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord:${agentId}] Bot ready as ${c.user.tag}`)
  })

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return
    if (message.author.id === client?.user?.id) return

    if (config.allowed_guilds.length > 0 && message.guildId) {
      if (!config.allowed_guilds.includes(message.guildId)) return
    }
    if (config.allowed_channels.length > 0) {
      if (!config.allowed_channels.includes(message.channelId)) return
    }

    const isDM = !message.guildId
    if (isDM && !config.respond_to_dms) return
    if (!isDM && config.respond_to_mentions) {
      // Check user mentions and role mentions (bot's managed role)
      const mentionedUser = message.mentions.has(client.user!.id)
      const mentionedRole = message.mentions.roles.some(
        (role) => role.managed && role.tags?.botId === client.user!.id,
      )
      if (!mentionedUser && !mentionedRole) return
    }

    await handleInboundMessage(
      {
        authorUsername: message.author.username,
        content: message.content,
        channelId: message.channelId,
        messageId: message.id,
        guildId: message.guildId ?? undefined,
      },
      agentId,
    )
  })

  await client.login(token)
  return {
    agentId,
    client,
    stop: async () => {
      client.destroy()
    },
  }
}

/**
 * Send a message through a bot client, splitting if needed.
 * Returns true if sent successfully.
 */
export async function sendViaBot(
  bot: AgentBot,
  channelId: string,
  content: string,
  threadId?: string,
): Promise<boolean> {
  const channel = await bot.client.channels
    .fetch(channelId)
    .catch(() => null)
  if (!channel?.isTextBased() || !("send" in channel)) {
    console.warn(
      `[discord:${bot.agentId}] Channel ${channelId} not text-based or not found`,
    )
    return false
  }

  const target = threadId
    ? await bot.client.channels.fetch(threadId).catch(() => null)
    : null
  const sendTo =
    target?.isTextBased() && "send" in target ? target : channel

  const chunks = splitMessage(content)
  for (const chunk of chunks) {
    await sendTo.send(chunk)
  }
  return true
}

// Legacy wrapper for backward compat (scripts/verify/discord-smoke.ts)
export async function startDiscordBot(): Promise<Client | null> {
  const config = getDiscordConfig()
  const token = process.env.DISCORD_BOT_TOKEN
  if (!config.enabled || !token) {
    console.log("[discord] Bot disabled or no token — skipping")
    return null
  }
  const bot = await createAgentBot("galatea", token)
  return bot.client
}

export async function stopDiscordBot(): Promise<void> {
  // Legacy — no-op, kept for smoke test compat
}
