export interface ActionTarget {
  channel: string
  to?: string
}

export interface ChannelHandler {
  send(
    target: ActionTarget,
    response: string,
    metadata?: Record<string, string>,
  ): Promise<void>
}

const handlers = new Map<string, ChannelHandler>()

export function registerHandler(
  channel: string,
  handler: ChannelHandler,
): void {
  handlers.set(channel, handler)
}

export function clearHandlers(): void {
  handlers.clear()
}

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
