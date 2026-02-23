import type { ChannelMessage } from "../agent/types"

export interface InboundDashboardMessage {
  from: string
  content: string
  metadata?: Record<string, string>
}

/**
 * Normalize a dashboard chat message into a ChannelMessage.
 */
export function normalizeDashboardMessage(
  msg: InboundDashboardMessage,
): ChannelMessage {
  return {
    id: `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel: "dashboard",
    direction: "inbound",
    routing: {},
    from: msg.from,
    content: msg.content,
    messageType: "chat",
    receivedAt: new Date().toISOString(),
    metadata: msg.metadata ?? {},
  }
}
