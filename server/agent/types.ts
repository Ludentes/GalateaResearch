import type { HomeostasisState } from "../engine/types"
import type { AssembledContext, KnowledgeEntry } from "../memory/types"

export interface AgentState {
  activeTask?: {
    project: string
    topic: string
    channel?: string
    startedAt?: string
  }
  lastActivity: string
  pendingMessages: PendingMessage[]
  activityLog?: TickResult[]
  lastDecayRun?: string
}

export interface PendingMessage {
  from: string
  channel: string
  content: string
  receivedAt: string
  metadata?: Record<string, string>
}

export interface SelfModel {
  availableProviders: string[]
}

export interface TickResult {
  homeostasis: HomeostasisState
  retrievedFacts: KnowledgeEntry[]
  context: AssembledContext
  selfModel: SelfModel
  pendingMessages: PendingMessage[]
  action: "respond" | "extract" | "idle"
  action_target?: { channel: string; to?: string }
  response?: { text: string }
  timestamp?: string
}
