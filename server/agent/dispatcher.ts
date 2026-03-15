import type { ChannelMessage, ChannelName } from "./types"

// ---------------------------------------------------------------------------
// Channel handler interface — each channel adapter implements this
// ---------------------------------------------------------------------------

export interface ChannelMessageHandler {
  send(message: ChannelMessage): Promise<void>
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const handlers = new Map<string, ChannelMessageHandler>()

export function registerHandler(
  channel: ChannelName,
  handler: ChannelMessageHandler,
): void {
  handlers.set(channel, handler)
}

export function clearHandlers(): void {
  handlers.clear()
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatchMessage(message: ChannelMessage): Promise<void> {
  const handler = handlers.get(message.channel)
  if (!handler) {
    throw new Error(`No handler registered for channel: ${message.channel}`)
  }
  await handler.send(message)
}
