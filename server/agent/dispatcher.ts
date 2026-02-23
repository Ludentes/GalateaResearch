import type { ChannelMessage, ChannelName } from "./types"

// ---------------------------------------------------------------------------
// Channel handler interface — each channel adapter implements this
// ---------------------------------------------------------------------------

/** @deprecated Use ChannelMessageHandler instead */
export interface ActionTarget {
  channel: string
  to?: string
}

export interface ChannelMessageHandler {
  send(message: ChannelMessage): Promise<void>
}

/**
 * @deprecated Legacy handler interface. Adapters should migrate to
 * ChannelMessageHandler which receives the full ChannelMessage.
 */
export interface ChannelHandler {
  send(
    target: ActionTarget,
    response: string,
    metadata?: Record<string, string>,
  ): Promise<void>
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const handlers = new Map<string, ChannelHandler>()
const messageHandlers = new Map<string, ChannelMessageHandler>()

export function registerHandler(
  channel: string,
  handler: ChannelHandler,
): void {
  handlers.set(channel, handler)
}

export function registerMessageHandler(
  channel: ChannelName,
  handler: ChannelMessageHandler,
): void {
  messageHandlers.set(channel, handler)
}

export function clearHandlers(): void {
  handlers.clear()
  messageHandlers.clear()
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a full ChannelMessage to the appropriate handler.
 * Prefers ChannelMessageHandler if registered; falls back to legacy handler.
 */
export async function dispatchMessage(
  message: ChannelMessage,
): Promise<void> {
  const msgHandler = messageHandlers.get(message.channel)
  if (msgHandler) {
    await msgHandler.send(message)
    return
  }

  // Fallback to legacy handler
  const legacyHandler = handlers.get(message.channel)
  if (legacyHandler) {
    const target: ActionTarget = {
      channel: message.channel,
      to: message.from,
    }
    const metadata: Record<string, string> = {}
    for (const [k, v] of Object.entries(message.metadata)) {
      if (typeof v === "string") metadata[k] = v
    }
    await legacyHandler.send(target, message.content, metadata)
    return
  }

  throw new Error(`No handler registered for channel: ${message.channel}`)
}

/**
 * @deprecated Use dispatchMessage(ChannelMessage) instead.
 * Kept for backward compatibility during Phase F transition.
 */
export async function dispatch(
  target: ActionTarget,
  response: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const handler = handlers.get(target.channel)
  if (!handler) {
    throw new Error(`No handler registered for channel: ${target.channel}`)
  }
  await handler.send(target, response, metadata)
}
