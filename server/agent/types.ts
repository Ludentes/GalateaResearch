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
  | "greeting"

export interface MessageRouting {
  threadId?: string // Discord thread, GitLab MR discussion
  replyToId?: string // Message being replied to
  mentionedAgents?: string[] // @Agent-Dev-1 parsing
  projectId?: string // GitLab project
  mrId?: string // GitLab MR number
}

export interface TextBlock {
  type: "text"
  text: string
}

export interface ImageBlock {
  type: "image"
  source: {
    type: "base64"
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    data: string
  }
}

export type ContentBlock = TextBlock | ImageBlock
export type MessageContent = string | ContentBlock[]

/** Extract text from message content, regardless of format */
export function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
}

export interface ChannelMessage {
  id: string
  channel: ChannelName
  direction: MessageDirection
  routing: MessageRouting
  from: string
  content: MessageContent
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
  action: "respond" | "extract" | "idle" | "delegate"
  action_target?: { channel: string; to?: string }
  response?: { text: string; template?: boolean }
  delegation?: {
    adapter: string
    taskId: string
    status: "started" | "completed" | "failed" | "timeout"
    transcript?: import("./coding-adapter/types").CodingTranscriptEntry[]
    costUsd?: number
  }
  timestamp?: string
}
