/**
 * v2 Memory Types — Shadow Learning Pipeline
 *
 * Replaces v1 Graphiti/cognitive model types.
 * See: docs/plans/2026-02-11-galatea-v2-architecture-design.md
 *
 * ## Cognitive Models (from PSYCHOLOGICAL_ARCHITECTURE.md)
 *
 * The original architecture defined 4 cognitive models (Self, User, Domain,
 * Relationship). In v2, these are NOT separate data structures — they're
 * views over KnowledgeEntry filtered by `about.type`:
 *
 *   User Model      = entries.filter(e => e.about?.type === "user")
 *   Domain Model    = entries.filter(e => e.about?.type === "domain")
 *   Self Model      = entries.filter(e => e.about?.type === "agent") + preprompts
 *   Relationship    = derived from session stats + about.type === "team"
 *
 * The `about` field makes entries "predicaty" — each entry is implicitly:
 *   subject(about.entity) → predicate(type) → object(content)
 *
 * Example: about:{entity:"mary", type:"user"}, type:"preference", content:"uses Discord"
 *   → mary → prefers → Discord
 *
 * If we later need explicit model objects, build them by querying the store.
 * See: docs/plans/2026-02-12-cognitive-models-design.md (when created)
 */

// ============ Knowledge Store ============

export type KnowledgeType =
  | "preference"
  | "fact"
  | "rule"
  | "procedure"
  | "correction"
  | "decision"

/**
 * Who or what this knowledge is about. Enables future Cognitive Model
 * construction by filtering: entries.filter(e => e.about?.type === "user")
 *
 * Multi-user support: about.entity distinguishes "mary" from "paul".
 * When about is omitted, knowledge is assumed to be about the project.
 */
export type KnowledgeSubjectType =
  | "user"     // about a specific person (preferences, expertise, habits)
  | "project"  // about the codebase or project (default when about is omitted)
  | "agent"    // about the agent itself (capabilities, limitations)
  | "domain"   // about the problem domain (rules, characteristics)
  | "team"     // about team dynamics (communication norms, processes)

export interface KnowledgeAbout {
  entity: string            // "mary", "paul", "galatea", "expo-project", "mobile-dev"
  type: KnowledgeSubjectType
}

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
  about?: KnowledgeAbout // who/what this knowledge is about (default: project)
  lastRetrievedAt?: string // ISO 8601, updated on retrieval
  archivedAt?: string // ISO 8601, set when confidence drops below threshold
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
    chunksFailed?: number
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
    homeostasisGuidanceIncluded: boolean
  }
}
