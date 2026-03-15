/**
 * Discord bot smoke test.
 *
 * Prerequisites:
 *   - DISCORD_BOT_TOKEN env var set
 *   - discord.enabled: true in server/engine/config.yaml
 *   - Bot invited to a test server (see verification guide for setup steps)
 *
 * Usage:
 *   pnpm exec tsx scripts/verify/discord-smoke.ts
 */

import { getAgentState } from "../../server/agent/agent-state"
import { startDiscordBot, stopDiscordBot } from "../../server/discord/bot"

async function main() {
  const bot = await startDiscordBot()
  if (!bot) {
    console.error(
      "Bot did not start. Check:\n" +
        "  1. DISCORD_BOT_TOKEN is set in env\n" +
        "  2. discord.enabled is true in server/engine/config.yaml",
    )
    process.exit(1)
  }

  console.log("Bot is running. Send a DM or @mention in your test server.")
  console.log("Press Ctrl+C to stop.\n")

  let seenCount = 0

  // Poll agent state every 3s, only print new messages
  const interval = setInterval(async () => {
    const state = await getAgentState()
    const total = state.pendingMessages.length
    if (total > seenCount) {
      const newMsgs = state.pendingMessages.slice(seenCount)
      for (const m of newMsgs) {
        console.log(`  NEW [${m.channel}] ${m.from}: ${m.content}`)
      }
      seenCount = total
    }
  }, 3000)

  process.on("SIGINT", async () => {
    console.log("\nStopping bot...")
    clearInterval(interval)
    await stopDiscordBot()
    process.exit(0)
  })
}

main()
