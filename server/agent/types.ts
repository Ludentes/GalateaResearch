import type { HomeostasisState } from "../engine/types"
import type { AssembledContext, KnowledgeEntry } from "../memory/types"

// ---------------------------------------------------------------------------
// Channel message — the unified message type for all inbound/outbound comms
// ---------------------------------------------------------------------------

export type ChannelName = "discord" | "dashboard" | "gitlab" | "internal"
export type MessageDirection = "inbound" | "outbound"
export type MessageType =
  | "chat"
  | "task_assignment"
  | "review_comment"
  | "status_update"

export interface MessageRouting {
  threadId?: string // Discord thread, GitLab MR discussion
  replyToId?: string // Message being replied to
  mentionedAgents?: string[] // @Agent-Dev-1 parsing
  projectId?: string // GitLab project
  mrId?: string // GitLab MR number
}

export interface ChannelMessage {
  id: string
  channel: ChannelName
  direction: MessageDirection
  routing: MessageRouting
  from: string
  content: string
  messageType: MessageType
  receivedAt: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Agent state
// ---------------------------------------------------------------------------

export interface AgentState {
  activeTask?: {
    project: string
    topic: string
    channel?: string
    startedAt?: string
  }
  lastActivity: string
  pendingMessages: ChannelMessage[]
  activityLog?: TickResult[]
  lastDecayRun?: string
}

export interface SelfModel {
  availableProviders: string[]
}

export interface TickResult {
  homeostasis: HomeostasisState
  retrievedFacts: KnowledgeEntry[]
  context: AssembledContext
  selfModel: SelfModel
  pendingMessages: ChannelMessage[]
  action: "respond" | "extract" | "idle"
  action_target?: { channel: string; to?: string }
  response?: { text: string; template?: boolean }
  timestamp?: string
}
