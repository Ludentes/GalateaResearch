/**
 * v2 Memory Types — Shadow Learning Pipeline
 *
 * Replaces v1 Graphiti/cognitive model types.
 * See: docs/plans/2026-02-11-galatea-v2-architecture-design.md
 */

// ============ Knowledge Store ============

export type KnowledgeType =
  | "preference"
  | "fact"
  | "rule"
  | "procedure"
  | "correction"
  | "decision"

export interface KnowledgeEntry {
  id: string
  type: KnowledgeType
  content: string
  confidence: number
  entities: string[]
  evidence?: string
  source: string // e.g. "session:8be0af56" or "manual"
  extractedAt: string // ISO 8601
  supersededBy?: string // ID of newer entry that replaces this one
}

// ============ Transcript Reader ============

export interface TranscriptTurn {
  role: "user" | "assistant"
  content: string
  toolUse?: Array<{ name: string; input: string }>
  toolResults?: Array<{ content: string; isError: boolean }>
}

// ============ Signal Classifier ============

export type SignalType =
  | "preference"
  | "correction"
  | "policy"
  | "decision"
  | "factual"
  | "noise"

export interface SignalClassification {
  type: SignalType
  pattern?: string
  confidence: number
}

// ============ Extraction Pipeline ============

export interface ExtractionResult {
  entries: KnowledgeEntry[]
  stats: {
    turnsProcessed: number
    signalTurns: number
    noiseTurns: number
    entriesExtracted: number
    duplicatesSkipped: number
    skippedAlreadyExtracted?: boolean
  }
}

// ============ Context Assembly ============

export interface ContextSection {
  name: string
  content: string
  priority: number
  truncatable: boolean
}

export interface AssembledContext {
  systemPrompt: string
  sections: ContextSection[]
  metadata: {
    prepromptsLoaded: number
    knowledgeEntries: number
    rulesCount: number
  }
}
