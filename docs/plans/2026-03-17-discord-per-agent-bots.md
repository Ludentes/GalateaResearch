# Per-Agent Discord Bots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Each Galatea agent (Beki, Besa) gets its own Discord bot, with per-agent inbound routing, a multiplexed outbound handler, message splitting for the 2000-char limit, and a dedicated ops channel for failure alerts.

**Architecture:** Refactor the existing singleton `bot.ts` into a factory `createAgentBot()`. A new `manager.ts` manages multiple bot instances and registers a single multiplexed outbound handler with the dispatcher. A Nitro plugin starts the manager on server boot. The channel-log fallback remains for non-Discord channels.

**Tech Stack:** discord.js (already installed), Nitro plugins, existing dispatcher/agent-state infrastructure.

---

### Task 1: Message Splitter

Pure utility with no dependencies on Discord or agent systems. Build and test first.

**Files:**
- Create: `server/discord/message-split.ts`
- Create: `server/discord/__tests__/message-split.test.ts`

**Step 1: Write the failing tests**

`server/discord/__tests__/message-split.test.ts`:
```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { splitMessage } from "../message-split"

describe("splitMessage", () => {
  it("returns single-element array for short messages", () => {
    expect(splitMessage("hello")).toEqual(["hello"])
  })

  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([])
  })

  it("splits on paragraph breaks when message exceeds limit", () => {
    const para1 = "A".repeat(800)
    const para2 = "B".repeat(800)
    const text = `${para1}\n\n${para2}`
    const chunks = splitMessage(text, 1000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(para1)
    expect(chunks[1]).toBe(para2)
  })

  it("splits on line breaks when paragraph chunks are too large", () => {
    const line1 = "A".repeat(500)
    const line2 = "B".repeat(500)
    const line3 = "C".repeat(500)
    const text = `${line1}\n${line2}\n${line3}`
    const chunks = splitMessage(text, 600)
    expect(chunks).toHaveLength(3)
  })

  it("hard-cuts when no natural break points exist", () => {
    const text = "A".repeat(3000)
    const chunks = splitMessage(text, 1000)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(1000)
    expect(chunks[1]).toHaveLength(1000)
    expect(chunks[2]).toHaveLength(1000)
  })

  it("uses 1900 as default max length", () => {
    const text = "A".repeat(3800)
    const chunks = splitMessage(text)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(1900)
  })

  it("trims whitespace from chunks", () => {
    const text = "Hello\n\n  \n\nWorld"
    const chunks = splitMessage(text, 10)
    expect(chunks).toEqual(["Hello", "World"])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run server/discord/__tests__/message-split.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

`server/discord/message-split.ts`:
```typescript
const DEFAULT_MAX_LENGTH = 1900

/**
 * Split a message into chunks that fit within Discord's 2000-char limit.
 * Tries paragraph breaks first, then line breaks, then hard-cuts.
 */
export function splitMessage(
  text: string,
  maxLength = DEFAULT_MAX_LENGTH,
): string[] {
  if (!text.trim()) return []
  if (text.length <= maxLength) return [text]

  // Try paragraph splits first
  const paragraphs = text.split(/\n\n+/)
  const chunks = mergeChunks(paragraphs, maxLength, "\n\n")

  // For any chunk still too long, split on line breaks
  const refined: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= maxLength) {
      refined.push(chunk)
    } else {
      const lines = chunk.split(/\n/)
      refined.push(...mergeChunks(lines, maxLength, "\n"))
    }
  }

  // Hard-cut anything still too long
  const result: string[] = []
  for (const chunk of refined) {
    if (chunk.length <= maxLength) {
      result.push(chunk)
    } else {
      for (let i = 0; i < chunk.length; i += maxLength) {
        result.push(chunk.slice(i, i + maxLength))
      }
    }
  }

  return result.map((c) => c.trim()).filter(Boolean)
}

/**
 * Merge small segments into chunks that fit within maxLength,
 * joining with the given separator.
 */
function mergeChunks(
  segments: string[],
  maxLength: number,
  separator: string,
): string[] {
  const chunks: string[] = []
  let current = ""

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    if (!current) {
      current = trimmed
    } else if (current.length + separator.length + trimmed.length <= maxLength) {
      current += separator + trimmed
    } else {
      chunks.push(current)
      current = trimmed
    }
  }

  if (current) chunks.push(current)
  return chunks
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run server/discord/__tests__/message-split.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add server/discord/message-split.ts server/discord/__tests__/message-split.test.ts
git commit -m "feat: add Discord message splitter for 2000-char limit"
```

---

### Task 2: Config Extension — Per-Agent Discord Settings

**Files:**
- Modify: `server/engine/config.yaml` (discord section)
- Modify: `server/engine/config.ts` (DiscordConfig type + getter)

**Step 1: Update the config type**

In `server/engine/config.ts`, replace the existing `DiscordConfig`:

```typescript
export interface DiscordAgentConfig {
  token_env: string
}

export interface DiscordConfig {
  enabled: boolean
  respond_to_dms: boolean
  respond_to_mentions: boolean
  allowed_guilds: string[]
  allowed_channels: string[]
  ops_channel_id: string
  agents: Record<string, DiscordAgentConfig>
}
```

**Step 2: Update config.yaml**

Replace the discord section in `server/engine/config.yaml`:

```yaml
discord:
  enabled: true
  respond_to_dms: true
  respond_to_mentions: true
  allowed_guilds: []
  allowed_channels: []
  ops_channel_id: ""
  agents:
    beki:
      token_env: DISCORD_BOT_TOKEN_BEKI
    besa:
      token_env: DISCORD_BOT_TOKEN_BESA
```

**Step 3: Add ops_channel_id env override in getter**

Update `getDiscordConfig()` in `server/engine/config.ts`:

```typescript
export function getDiscordConfig(): DiscordConfig {
  const cfg = loadConfig().discord
  // Allow env var override for ops channel
  if (process.env.DISCORD_OPS_CHANNEL_ID) {
    cfg.ops_channel_id = process.env.DISCORD_OPS_CHANNEL_ID
  }
  return cfg
}
```

**Step 4: Run existing tests to verify no regressions**

Run: `pnpm exec vitest run server/discord/`
Expected: PASS (existing adapter and bot tests should still pass — they only use `enabled`, `respond_to_dms`, etc.)

**Step 5: Commit**

```bash
git add server/engine/config.ts server/engine/config.yaml
git commit -m "feat: extend discord config with per-agent tokens and ops channel"
```

---

### Task 3: Refactor bot.ts — Extract `createAgentBot()`

Refactor the singleton `bot.ts` into a factory function. The existing `startDiscordBot()` becomes a thin wrapper for backward compat (used by smoke test).

**Files:**
- Modify: `server/discord/bot.ts`
- Modify: `server/discord/handlers.ts`

**Step 1: Refactor bot.ts**

`server/discord/bot.ts`:
```typescript
import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import { getTextContent } from "../agent/types"
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
      if (!message.mentions.has(client.user!.id)) return
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
  const channel = await bot.client.channels.fetch(channelId).catch(() => null)
  if (!channel?.isTextBased() || !("send" in channel)) {
    console.warn(
      `[discord:${bot.agentId}] Channel ${channelId} not text-based or not found`,
    )
    return false
  }

  const target =
    threadId
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
```

**Step 2: Update handlers.ts to accept agentId**

`server/discord/handlers.ts`:
```typescript
import { addMessage } from "../agent/agent-state"
import type { InboundDiscordMessage } from "./adapter"
import { normalizeDiscordMessage } from "./adapter"

export type { InboundDiscordMessage }

export async function handleInboundMessage(
  msg: InboundDiscordMessage,
  agentId = "galatea",
): Promise<void> {
  const cm = normalizeDiscordMessage(msg)
  cm.metadata.targetAgent = agentId
  const statePath = agentId === "galatea"
    ? undefined
    : `data/agents/${agentId}/state.json`
  await addMessage(cm, statePath)
}
```

**Step 3: Run existing tests**

Run: `pnpm exec vitest run server/discord/`
Expected: PASS — existing tests call `handleInboundMessage` without agentId, defaults apply

**Step 4: Commit**

```bash
git add server/discord/bot.ts server/discord/handlers.ts
git commit -m "refactor: extract createAgentBot factory from singleton bot"
```

---

### Task 4: Discord Manager — Multi-Bot Orchestrator

**Files:**
- Create: `server/discord/manager.ts`
- Create: `server/discord/__tests__/manager.test.ts`

**Step 1: Write the failing test**

`server/discord/__tests__/manager.test.ts`:
```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest"
import { DiscordManager } from "../manager"

// Mock createAgentBot
vi.mock("../bot", () => ({
  createAgentBot: vi.fn().mockResolvedValue({
    agentId: "beki",
    client: { user: { tag: "beki#1234" } },
    stop: vi.fn(),
  }),
  sendViaBot: vi.fn().mockResolvedValue(true),
}))

// Mock dispatcher
vi.mock("../../agent/dispatcher", () => ({
  registerHandler: vi.fn(),
}))

// Mock channel-log
vi.mock("../../agent/channel-log", () => ({
  appendToOutboundLog: vi.fn(),
}))

describe("DiscordManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts bots for agents with configured tokens", async () => {
    const { createAgentBot } = await import("../bot")
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "",
    })

    expect(createAgentBot).toHaveBeenCalledWith("beki", "fake-token")
    expect(manager.getBot("beki")).toBeDefined()
  })

  it("stops all bots on shutdown", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "",
    })

    const bot = manager.getBot("beki")!
    await manager.stopAll()
    expect(bot.stop).toHaveBeenCalled()
  })

  it("returns undefined for unknown agent", () => {
    const manager = new DiscordManager()
    expect(manager.getBot("nobody")).toBeUndefined()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run server/discord/__tests__/manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

`server/discord/manager.ts`:
```typescript
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { registerHandler } from "../agent/dispatcher"
import { getTextContent } from "../agent/types"
import type { ChannelMessage } from "../agent/types"
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
    // Always log to JSONL (belt and suspenders with channel-log)
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

    // Post to ops channel on failure
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

    // Pick any available bot to post the alert
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
```

**Step 4: Run tests**

Run: `pnpm exec vitest run server/discord/__tests__/manager.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add server/discord/manager.ts server/discord/__tests__/manager.test.ts
git commit -m "feat: add DiscordManager for multi-bot orchestration"
```

---

### Task 5: Nitro Plugin — Wire It All Together

**Files:**
- Create: `server/plugins/discord.ts`
- Modify: `server/plugins/channel-log.ts` (ensure it doesn't conflict)

**Step 1: Create the Nitro plugin**

`server/plugins/discord.ts`:
```typescript
import { getDiscordConfig } from "../engine/config"
import { DiscordManager } from "../discord/manager"

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
```

**Step 2: Verify channel-log plugin still works**

The channel-log plugin registers handlers for all channels including "discord". The discord plugin runs after (alphabetical: `channel-log.ts` < `discord.ts`) and `registerHandler` replaces the previous handler. So channel-log serves as fallback only when no Discord token is configured. No changes needed to channel-log.ts.

**Step 3: Run all discord tests**

Run: `pnpm exec vitest run server/discord/`
Expected: PASS

**Step 4: Commit**

```bash
git add server/plugins/discord.ts
git commit -m "feat: add Nitro plugin to start per-agent Discord bots"
```

---

### Task 6: Integration Test — End-to-End Flow

**Files:**
- Create: `server/discord/__tests__/integration.test.ts`

**Step 1: Write integration test**

`server/discord/__tests__/integration.test.ts`:
```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest"
import { clearHandlers, dispatchMessage } from "../../agent/dispatcher"
import { DiscordManager } from "../manager"
import type { ChannelMessage } from "../../agent/types"

// Mock bot creation to avoid real Discord connections
vi.mock("../bot", () => {
  const sentMessages: Array<{ channelId: string; content: string }> = []
  return {
    createAgentBot: vi.fn().mockImplementation((agentId: string) => ({
      agentId,
      client: {
        user: { tag: `${agentId}#1234` },
        channels: {
          fetch: vi.fn().mockResolvedValue(null),
        },
      },
      stop: vi.fn(),
    })),
    sendViaBot: vi.fn().mockImplementation(
      async (_bot, channelId: string, content: string) => {
        sentMessages.push({ channelId, content })
        return true
      },
    ),
    _sentMessages: sentMessages,
  }
})

describe("Discord integration", () => {
  beforeEach(() => {
    clearHandlers()
    vi.clearAllMocks()
  })

  it("routes outbound message to correct agent bot", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", { ops_channel_id: "" })
    manager.registerOutboundHandler()

    const { sendViaBot } = await import("../bot")

    const message: ChannelMessage = {
      id: "test-1",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "beki",
      content: "Task completed",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-123" },
    }

    await dispatchMessage(message)
    expect(sendViaBot).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "beki" }),
      "ch-123",
      "Task completed",
      undefined,
    )
  })

  it("logs warning when no bot exists for agent", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", { ops_channel_id: "" })
    manager.registerOutboundHandler()

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const message: ChannelMessage = {
      id: "test-2",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "besa",
      content: "Status update",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-456" },
    }

    await dispatchMessage(message)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No bot for agent "besa"'),
    )
    warnSpy.mockRestore()
  })

  it("posts failure alert to ops channel", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "ops-channel-id",
    })
    manager.registerOutboundHandler()

    const { sendViaBot } = await import("../bot")

    const message: ChannelMessage = {
      id: "test-3",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "beki",
      content: "Task failed: could not install dependencies",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-123" },
    }

    await dispatchMessage(message)

    // Called twice: once for the reply, once for ops alert
    expect(sendViaBot).toHaveBeenCalledTimes(2)
    expect(sendViaBot).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "beki" }),
      "ops-channel-id",
      expect.stringContaining("Delegation failed"),
    )
  })
})
```

**Step 2: Run integration test**

Run: `pnpm exec vitest run server/discord/__tests__/integration.test.ts`
Expected: PASS (3 tests)

**Step 3: Commit**

```bash
git add server/discord/__tests__/integration.test.ts
git commit -m "test: add discord multi-bot integration tests"
```

---

### Task 7: Environment Setup & Manual Verification

**Files:**
- Modify: `.env` or `.env.local` (add bot token)

**Step 1: Add bot token to .env**

```bash
# Add to .env.local (not committed)
echo 'DISCORD_BOT_TOKEN_BEKI=<token-from-discord-dev-portal>' >> .env.local
```

**Step 2: Invite the bot to your Discord server**

Generate invite URL with these permissions:
- Send Messages
- Read Message History
- Use External Emojis
- Embed Links

URL format: `https://discord.com/api/oauth2/authorize?client_id=1483371304512913478&permissions=274877910016&scope=bot`

**Step 3: Set ops channel (optional)**

```bash
echo 'DISCORD_OPS_CHANNEL_ID=<your-ops-channel-id>' >> .env.local
```

**Step 4: Restart dev server and verify**

```bash
pnpm dev
```

Expected console output:
```
[channel-log] Fallback log handlers registered
[discord:beki] Bot ready as Beki#1234
[discord-manager] Started bot for beki
[discord-manager] Outbound handler registered
[discord] 1 bot(s) started
```

**Step 5: Send test message in Discord**

Send `@Beki hello` in a channel the bot can see. Verify:
1. Bot receives the message (check server logs)
2. Agent tick processes it
3. Response appears in Discord

**Step 6: Run full test suite**

Run: `pnpm exec vitest run server/discord/`
Expected: All tests pass

**Step 7: Commit .env.example update**

```bash
# If .env.example exists, add the new vars as documentation
git add .env.example
git commit -m "docs: add Discord bot token env vars to .env.example"
```

---

## Summary

| Task | What | New/Modified Files |
|------|------|--------------------|
| 1 | Message splitter | `message-split.ts`, test |
| 2 | Config extension | `config.ts`, `config.yaml` |
| 3 | Bot factory refactor | `bot.ts`, `handlers.ts` |
| 4 | Multi-bot manager | `manager.ts`, test |
| 5 | Nitro plugin | `plugins/discord.ts` |
| 6 | Integration tests | `integration.test.ts` |
| 7 | Env setup & manual verification | `.env.local` |

Total: ~7 commits, ~6 new/modified source files, ~3 test files.
