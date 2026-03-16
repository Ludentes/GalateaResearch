/**
 * Phase 3: Homeostasis Engine + Activity Router
 * Type definitions for psychological core
 */

// ============================================================================
// Homeostasis Engine Types
// ============================================================================

/**
 * The 7 dimensions of homeostatic balance.
 * Based on Self-Determination Theory and Goal Theory.
 */
export type Dimension =
  | "knowledge_sufficiency" // "Do I know enough?"
  | "certainty_alignment" // "Does confidence match action?"
  | "progress_momentum" // "Am I moving forward?"
  | "communication_health" // "Am I connected?"
  | "productive_engagement" // "Am I contributing?"
  | "knowledge_application" // "Learning vs doing?"
  | "self_preservation" // Asimov 3-in-1: don't harm people → obey authorized orders → protect self/environment

/**
 * State for a single dimension.
 * LOW: Needs attention, triggers guidance
 * HEALTHY: Balanced, no intervention needed
 * HIGH: Over-indexed, may need rebalancing
 */
export type DimensionState = "LOW" | "HEALTHY" | "HIGH"

/**
 * Assessment method used for a dimension.
 * computed: Fast, rule-based assessment (no LLM)
 * llm: Deep assessment using LLM reasoning
 */
export type AssessmentMethod = "computed" | "llm"

/**
 * Complete homeostasis state across all 7 dimensions.
 */
export interface HomeostasisState {
  knowledge_sufficiency: DimensionState
  certainty_alignment: DimensionState
  progress_momentum: DimensionState
  communication_health: DimensionState
  productive_engagement: DimensionState
  knowledge_application: DimensionState
  self_preservation: DimensionState
  assessed_at: Date
  assessment_method: Record<Dimension, AssessmentMethod>
}

/**
 * Context needed for homeostasis assessment.
 * Contains session state, memory, and task information.
 */
export type TrustLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "ABSOLUTE"

export interface AgentContext {
  sessionId: string
  currentMessage: string
  messageHistory: Array<{ role: "user" | "assistant"; content: string }>
  retrievedFacts?: Array<{ content: string; confidence: number }>
  retrievedProcedures?: Array<{ name: string; success_rate: number }>
  lastMessageTime?: Date
  currentTaskStartTime?: Date
  recentActionCount?: number
  hasAssignedTask?: boolean
  timeSpentResearching?: number // milliseconds
  timeSpentBuilding?: number // milliseconds

  // Operational memory fields (F.4)
  lastOutboundAt?: string // ISO timestamp of last outbound message
  phaseEnteredAt?: string // ISO timestamp when current phase started
  taskPhase?: "exploring" | "deciding" | "implementing" | "verifying"
  taskCount?: number // number of active tasks
  taskToolCallCount?: number // tool calls on current task

  // Trust/safety fields (F.4 self_preservation)
  sourceTrustLevel?: TrustLevel
  sourceChannel?: string
  sourceIdentity?: string // who sent the message

  // Escalation state — set when agent has a pending escalation
  pendingEscalation?: {
    category: string
    escalatedAt: string // ISO timestamp
  }
}

/**
 * Guidance text to include in prompt when homeostasis is imbalanced.
 */
export interface GuidanceText {
  primary: string // Most important guidance
  secondary?: string // Additional considerations
  dimensions: Dimension[] // Which dimensions triggered this guidance
}

/**
 * Assessment result for a single dimension.
 */
export interface DimensionAssessment {
  dimension: Dimension
  state: DimensionState
  method: AssessmentMethod
  confidence: number // 0-1, how confident in this assessment
  reason?: string // Explanation for the assessment
}

// ============================================================================
// Activity Router Types
// ============================================================================

/**
 * Activity level classification (0-3 spectrum).
 * Level 0: Direct execution, no LLM needed
 * Level 1: Pattern-based, use cheap model (Haiku)
 * Level 2: Reasoning required, use capable model (Sonnet)
 * Level 3: Deep reflection needed, use Reflexion loop
 */
export type ActivityLevel = 0 | 1 | 2 | 3

/**
 * Model to use for an activity.
 */
export type ModelType = "none" | "haiku" | "sonnet"

/**
 * Result of activity classification.
 */
export interface ActivityClassification {
  level: ActivityLevel
  reason: string
  model: ModelType
  skipMemory: boolean // Skip memory retrieval for this activity
  skipHomeostasis: boolean // Skip homeostasis assessment for this activity
}

/**
 * Task information for activity routing.
 */
export interface Task {
  message: string
  sessionId: string
  requiresLLM?: boolean
  isToolCall?: boolean
  isTemplate?: boolean
  isIrreversible?: boolean
  hasKnowledgeGap?: boolean
  isHighStakes?: boolean
}

/**
 * Procedure from memory that might match this task.
 */
export interface Procedure {
  id: number
  name: string
  trigger_pattern: string
  trigger_context: string[]
  steps: Array<{ order: number; instruction: string; tool_call?: string }>
  success_rate: number
  times_used: number
}

/**
 * Model specification from config.
 */
export interface ModelSpec {
  id: string
  provider: string
  model_id: string
  characteristics: string[]
  suitable_for: ActivityLevel[]
  cost_per_1k_tokens: number
}

// ============================================================================
// Reflexion Loop Types
// ============================================================================

/**
 * Result of Reflexion loop execution.
 */
export interface ReflexionResult {
  final_draft: string
  iterations: ReflexionIteration[]
  total_llm_calls: number
  total_tokens: number // Total tokens used across all LLM calls
  success: boolean // Did critique pass, or hit max iterations?
}

/**
 * Single iteration in Reflexion loop.
 */
export interface ReflexionIteration {
  iteration_number: number
  draft: string
  evidence: Evidence[]
  critique: Critique
  revised: boolean // Was draft revised based on critique?
}

/**
 * Evidence gathered to support draft.
 */
export interface Evidence {
  source: "memory" | "codebase" | "documentation"
  content: string
  relevance: number // 0-1
  supports_claim?: string // Which claim in draft this supports
}

/**
 * Critique of a draft.
 */
export interface Critique {
  issues: Issue[]
  confidence: number // 0-1, how confident in this critique
  passes: boolean // Does draft pass quality bar?
}

/**
 * Issue identified in draft.
 */
export interface Issue {
  type: "missing" | "unsupported" | "incorrect"
  description: string
  severity: "minor" | "major" | "critical"
  suggested_fix?: string
}

// ============================================================================
// Context Assembly Types (extended from Phase 2)
// ============================================================================

// NOTE: AssembledContext and ContextSection are defined in server/memory/types.ts
// The legacy Phase 2/3 versions (PromptSection, AssembledContext) were removed in Phase F.

// ============================================================================
// Tool Safety Types (for PreToolUse hooks / CodingToolAdapter)
// ============================================================================

/**
 * Risk level of a tool call. Used by Layer 2 hard guardrails.
 * - read: no side effects (file read, search, status check)
 * - write: reversible side effects (file write, git commit, send message)
 * - destructive: irreversible or high-impact (force push, delete branch, rm -rf, deploy)
 */
export type ToolRisk = "read" | "write" | "destructive"

/**
 * Decision returned by the safety check.
 * - allow: tool call proceeds normally
 * - deny: tool call is blocked, reason is shown to the coding tool
 * - ask: escalate to user for confirmation
 */
export type SafetyDecision = "allow" | "deny" | "ask"

/**
 * Result of a tool-call safety check (used by PreToolUse hooks in Phase G).
 */
export interface SafetyCheckResult {
  decision: SafetyDecision
  reason: string
  /** Which check triggered the decision (for audit/tracing) */
  triggeredBy?: string
}

/**
 * Input for a tool-call safety check.
 * Lightweight — does NOT require a full AgentContext.
 */
export interface ToolCallCheckInput {
  toolName: string
  toolArgs: Record<string, unknown>
  trustLevel: TrustLevel
  workingDirectory?: string
}
