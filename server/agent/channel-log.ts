import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { ChannelMessageHandler } from "./dispatcher"
import { registerHandler } from "./dispatcher"
import type { ChannelMessage } from "./types"

const LOG_DIR = "data/outbound"
const LOG_FILE = path.join(LOG_DIR, "messages.jsonl")

/**
 * Fallback channel handler that logs all outbound messages to a JSONL file.
 * Registered for every channel so messages are never silently dropped.
 * The real channel handler (Discord bot, etc.) can override this by
 * registering after this module loads.
 */
const logHandler: ChannelMessageHandler = {
  async send(message: ChannelMessage): Promise<void> {
    await mkdir(LOG_DIR, { recursive: true })
    const entry = {
      ...message,
      logged_at: new Date().toISOString(),
    }
    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`)

    // Log failures prominently so they're visible in server output
    const content =
      typeof message.content === "string"
        ? message.content
        : "[multimodal content]"
    if (
      content.includes("Task failed") ||
      content.includes("Task timeout") ||
      content.includes("aborted")
    ) {
      console.error(
        `[${message.from}] DELEGATION FAILED → ${message.channel}:${message.routing?.replyToId ?? "?"} | ${content.slice(0, 200)}`,
      )
    } else {
      console.log(
        `[${message.from}] → ${message.channel}:${message.routing?.replyToId ?? "?"} | ${content.slice(0, 120)}`,
      )
    }
  },
}

/**
 * Register log handler as fallback for common channels.
 * Real channel adapters (Discord bot) can override by registering later.
 */
export function registerLogHandlers(): void {
  for (const channel of [
    "discord",
    "dashboard",
    "gitlab",
    "internal",
  ] as const) {
    registerHandler(channel, logHandler)
  }
}

/**
 * Read recent outbound messages from the log.
 */
export async function readOutboundLog(options?: {
  limit?: number
  agentId?: string
}): Promise<ChannelMessage[]> {
  let content: string
  try {
    content = await readFile(LOG_FILE, "utf-8")
  } catch {
    return []
  }

  let messages = content
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as ChannelMessage]
      } catch {
        return []
      }
    })

  if (options?.agentId) {
    messages = messages.filter((m) => m.from === options.agentId)
  }

  if (options?.limit) {
    messages = messages.slice(-options.limit)
  }

  return messages
}
