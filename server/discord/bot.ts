import { Client, Events, GatewayIntentBits } from "discord.js"
import { registerHandler } from "../agent/dispatcher"
import { getDiscordConfig } from "../engine/config"
import { handleInboundMessage } from "./handlers"

let client: Client | null = null

export async function startDiscordBot(): Promise<Client | null> {
  const config = getDiscordConfig()
  const token = process.env.DISCORD_BOT_TOKEN

  if (!config.enabled || !token) {
    console.log("[discord] Bot disabled or no token — skipping")
    return null
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] Bot ready as ${c.user.tag}`)
  })

  client.on(Events.MessageCreate, async (message) => {
    // Ignore own messages and bots
    if (message.author.bot) return
    if (message.author.id === client?.user?.id) return

    // Check guild/channel filters
    if (config.allowed_guilds.length > 0 && message.guildId) {
      if (!config.allowed_guilds.includes(message.guildId)) return
    }
    if (config.allowed_channels.length > 0) {
      if (!config.allowed_channels.includes(message.channelId)) return
    }

    // DM check
    const isDM = !message.guildId
    if (isDM && !config.respond_to_dms) return

    // Mention check (non-DM)
    if (!isDM && config.respond_to_mentions) {
      if (!message.mentions.has(client!.user!.id)) return
    }

    await handleInboundMessage({
      authorUsername: message.author.username,
      content: message.content,
      channelId: message.channelId,
      messageId: message.id,
      guildId: message.guildId ?? undefined,
    })
  })

  // Register outbound handler with dispatcher
  registerHandler("discord", {
    send: async (_target, response, metadata) => {
      const channelId = metadata?.discordChannelId
      if (!channelId || !client) return

      const channel = await client.channels.fetch(channelId)
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send(response)
      }
    },
  })

  await client.login(token)
  return client
}

export async function stopDiscordBot(): Promise<void> {
  if (client) {
    client.destroy()
    client = null
  }
}
