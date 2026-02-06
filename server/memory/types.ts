/**
 * Graphiti REST API types — verified against actual server responses.
 *
 * The Graphiti sidecar runs at GRAPHITI_URL (default http://localhost:18000).
 * FalkorDB uses group_id as the graph database name (multi-tenant).
 */

// ---------------------------------------------------------------------------
// REST API request types
// ---------------------------------------------------------------------------

/** POST /messages — Add messages for async knowledge extraction */
export interface AddMessagesRequest {
  group_id: string
  messages: GraphitiMessage[]
}

export interface GraphitiMessage {
  content: string
  role_type: "user" | "assistant" | "system"
  role: string
  name: string
  source_description: string
  uuid?: string
  timestamp?: string
}

/** POST /search — Hybrid search (vector + fulltext + graph) */
export interface SearchRequest {
  query: string
  group_ids?: string[]
  max_facts?: number
}

/** POST /get-memory — Context-aware memory retrieval */
export interface GetMemoryRequest {
  messages: Array<{ role: string; role_type: string; content: string }>
  group_id: string
  max_facts: number
  center_node_uuid: string | null
}

/** POST /entity-node — Create entity node */
export interface AddEntityNodeRequest {
  uuid: string
  group_id: string
  name: string
  summary: string
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/** Fact result returned by /search and /get-memory */
export interface FactResult {
  uuid: string
  name: string
  fact: string
  valid_at: string | null
  invalid_at: string | null
  created_at: string
  expired_at: string | null
}

export interface SearchResponse {
  facts: FactResult[]
}

export interface AddMessagesResponse {
  message: string
}

export interface HealthcheckResponse {
  status: string
}

// ---------------------------------------------------------------------------
// Context assembly types
// ---------------------------------------------------------------------------

export interface ContextBudget {
  total: number
  hardRules: number
  procedures: number
  facts: number
  models: number
  episodes: number
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  total: 8000,
  hardRules: 500,
  procedures: 1500,
  facts: 4000,
  models: 1000,
  episodes: 1000,
}

export interface PromptSection {
  name: string
  priority: number
  content: string
  truncatable: boolean
  tokenEstimate: number
}

export interface ScoredFact {
  uuid: string
  fact: string
  graphitiScore: number
  recency: number
  finalScore: number
}

export interface AssembledContext {
  sections: PromptSection[]
  systemPrompt: string
  metadata: {
    totalTokens: number
    retrievalStats: {
      hardRulesCount: number
      factsRetrieved: number
      proceduresMatched: number
      episodesIncluded: number
    }
    assemblyTimeMs: number
  }
}

// ---------------------------------------------------------------------------
// Cognitive model types
// ---------------------------------------------------------------------------

export interface SelfModel {
  strengths: string[]
  weaknesses: string[]
  recentMisses: string[]
}

export interface UserModel {
  preferences: string[]
  expectations: string[]
  communicationStyle: string | null
}

export type CognitiveObservationType =
  | "strength"
  | "weakness"
  | "recent_miss"
  | "preference"
  | "expectation"
  | "communication_style"

// ---------------------------------------------------------------------------
// Gatekeeper types
// ---------------------------------------------------------------------------

export interface GatekeeperDecision {
  shouldIngest: boolean
  reason: string
  category:
    | "preference"
    | "policy"
    | "correction"
    | "decision"
    | "general_knowledge"
    | "greeting"
    | "other"
}
