import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { registerHandler } from "../agent/dispatcher"
import type { ChannelMessage } from "../agent/types"
import { getTextContent } from "../agent/types"
import type { AgentBot } from "./bot"
import { createAgentBot, sendViaBot } from "./bot"

const OUTBOUND_LOG_DIR = "data/outbound"
const OUTBOUND_LOG_FILE = path.join(OUTBOUND_LOG_DIR, "messages.jsonl")

interface ManagerConfig {
  ops_channel_id: string
}

export class DiscordManager {
  private bots = new Map<string, AgentBot>()
  private config: ManagerConfig = { ops_channel_id: "" }

  async startAgent(
    agentId: string,
    token: string,
    config: ManagerConfig,
  ): Promise<void> {
    this.config = config
    const bot = await createAgentBot(agentId, token)
    this.bots.set(agentId, bot)
    console.log(`[discord-manager] Started bot for ${agentId}`)
  }

  getBot(agentId: string): AgentBot | undefined {
    return this.bots.get(agentId)
  }

  /**
   * Register the multiplexed outbound handler with the dispatcher.
   * Call this once after starting all agent bots.
   */
  registerOutboundHandler(): void {
    registerHandler("discord", {
      send: async (message: ChannelMessage) => {
        await this.handleOutbound(message)
      },
    })
    console.log("[discord-manager] Outbound handler registered")
  }

  private async handleOutbound(message: ChannelMessage): Promise<void> {
    await this.logOutbound(message)

    const agentId = message.from
    const bot = this.bots.get(agentId)
    if (!bot) {
      console.warn(
        `[discord-manager] No bot for agent "${agentId}", message logged but not sent`,
      )
      return
    }

    const content = getTextContent(message.content)
    const channelId = message.metadata.discordChannelId as string | undefined
    const threadId = message.routing.threadId

    if (channelId) {
      await sendViaBot(bot, channelId, content, threadId)
    } else {
      console.warn(
        `[discord-manager] No channelId for message from ${agentId}, skipping send`,
      )
    }

    await this.maybePostFailureAlert(message, content)
  }

  private async maybePostFailureAlert(
    message: ChannelMessage,
    content: string,
  ): Promise<void> {
    if (!this.config.ops_channel_id) return

    const isFailure =
      content.includes("Task failed") ||
      content.includes("Task timeout") ||
      content.includes("aborted")
    if (!isFailure) return

    const alertBot = this.bots.values().next().value
    if (!alertBot) return

    const alert = [
      `⚠️ **Delegation failed** for **${message.from}**`,
      `> ${content.slice(0, 300)}`,
      `Channel: <#${message.metadata.discordChannelId ?? "unknown"}>`,
    ].join("\n")

    await sendViaBot(alertBot, this.config.ops_channel_id, alert).catch(
      (err) => {
        console.error("[discord-manager] Failed to post ops alert:", err)
      },
    )
  }

  private async logOutbound(message: ChannelMessage): Promise<void> {
    try {
      await mkdir(OUTBOUND_LOG_DIR, { recursive: true })
      const entry = { ...message, logged_at: new Date().toISOString() }
      await appendFile(OUTBOUND_LOG_FILE, `${JSON.stringify(entry)}\n`)
    } catch (err) {
      console.error("[discord-manager] Failed to log outbound message:", err)
    }
  }

  async stopAll(): Promise<void> {
    for (const [agentId, bot] of this.bots) {
      await bot.stop()
      console.log(`[discord-manager] Stopped bot for ${agentId}`)
    }
    this.bots.clear()
  }
}
