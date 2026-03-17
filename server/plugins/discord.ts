import { DiscordManager } from "../discord/manager"
import { getDiscordConfig } from "../engine/config"

let manager: DiscordManager | null = null

export default async () => {
  const config = getDiscordConfig()
  if (!config.enabled) {
    console.log("[discord] Disabled in config — skipping")
    return
  }

  if (!config.agents || Object.keys(config.agents).length === 0) {
    console.log("[discord] No agents configured — skipping")
    return
  }

  manager = new DiscordManager()
  let started = 0

  for (const [agentId, agentConfig] of Object.entries(config.agents)) {
    const token = process.env[agentConfig.token_env]
    if (!token) {
      console.warn(
        `[discord] No token for ${agentId} (env: ${agentConfig.token_env}) — skipping`,
      )
      continue
    }

    try {
      await manager.startAgent(agentId, token, {
        ops_channel_id: config.ops_channel_id,
      })
      started++
    } catch (err) {
      console.error(`[discord] Failed to start bot for ${agentId}:`, err)
    }
  }

  if (started > 0) {
    manager.registerOutboundHandler()
    console.log(`[discord] ${started} bot(s) started`)
  } else {
    console.log("[discord] No bots started (no tokens configured)")
    manager = null
  }
}

export function getDiscordManager(): DiscordManager | null {
  return manager
}
