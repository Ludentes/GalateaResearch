/**
 * Homeostasis Engine - L0-L2 Thinking Levels
 *
 * Multi-level assessment architecture:
 * - L0: Cached/reflexive (0ms) - Return last assessment if fresh
 * - L1: Computed heuristics (1ms) - Fast pattern matching with relevance scoring
 * - L2: LLM semantic (2s) - Nuanced understanding for hard dimensions
 * - L3: Meta-assessment (4s) - [FUTURE] Reflect on L1/L2 confidence
 * - L4: Strategic patterns (30s) - [FUTURE] Cross-session analysis
 *
 * Dimension assessment strategies:
 * - knowledge_sufficiency: L1 with relevance scoring + confidence weighting
 * - progress_momentum: L1 with improved Jaccard similarity
 * - communication_health: L1 time-based
 * - productive_engagement: L1 simple rules
 * - certainty_alignment: L2 LLM (defaults HEALTHY without LLM)
 * - knowledge_application: L2 LLM (defaults HEALTHY without LLM)
 *
 * ## ThinkingDepth — A Recurring Pattern
 *
 * L0-L4 here is an instance of a general "cognitive effort scaling" pattern
 * that appears in multiple places across the architecture:
 *
 *   | Domain            | L0 (reflexive)  | L1 (cheap)       | L2 (LLM)         | L3 (meta)          |
 *   |-------------------|-----------------|------------------|-------------------|---------------------|
 *   | Self-assessment   | Cache hit       | Heuristic        | LLM semantic      | Arbitrate L1 vs L2  |
 *   | Task routing*     | Direct action   | Pattern/skill    | LLM reasoning     | Reflexion loop      |
 *   | Memory retrieval  | Exact match     | Keyword search   | Semantic search   | Cross-reference     |
 *   | Extraction        | Regex classify  | —                | LLM extraction    | —                   |
 *
 *   * Task routing is handled by the ecosystem (Claude skill progressive
 *     disclosure). It was our original Activity Router (deprecated in v2).
 *     Same pattern, different owner.
 *
 * We are NOT abstracting this into a shared ThinkingDepth<T> type yet (YAGNI).
 * But when implementing L0-L4 for a SECOND internal domain (e.g. memory
 * retrieval), strongly consider extracting the shared abstraction at that point.
 *
 * History: Activity Router (Psych Arch) → deprecated (v2, ecosystem owns it)
 *          → revived as homeostasis L0-L4 (Phase C, different domain).
 * See: docs/PSYCHOLOGICAL_ARCHITECTURE.md, docs/ROADMAP.md
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getHomeostasisConfig } from "./config"
import { stemTokenize } from "./stemmer"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import { parse as parseYaml } from "yaml"
import type {
  AgentContext,
  Dimension,
  DimensionState,
  HomeostasisState,
  SafetyCheckResult,
  ToolCallCheckInput,
  TrustLevel,
} from "./types"

// ============ L0: Caching Layer ============

interface CachedAssessment {
  state: DimensionState
  timestamp: number
}

const dimensionCache = new Map<string, CachedAssessment>()

interface DimensionConfig {
  cacheTTL: number // milliseconds
  thinkingLevel: 0 | 1 | 2 // 0=cached, 1=computed, 2=LLM
}

function getDimensionConfigs(): Record<Dimension, DimensionConfig> {
  const ttl = getHomeostasisConfig().cache_ttl
  return {
    knowledge_sufficiency: {
      cacheTTL: ttl.knowledge_sufficiency ?? 0,
      thinkingLevel: 1,
    },
    certainty_alignment: {
      cacheTTL: ttl.certainty_alignment ?? 60_000,
      thinkingLevel: 2,
    },
    progress_momentum: {
      cacheTTL: ttl.progress_momentum ?? 120_000,
      thinkingLevel: 1,
    },
    communication_health: {
      cacheTTL: ttl.communication_health ?? 1800_000,
      thinkingLevel: 1,
    },
    productive_engagement: {
      cacheTTL: ttl.productive_engagement ?? 0,
      thinkingLevel: 1,
    },
    knowledge_application: {
      cacheTTL: ttl.knowledge_application ?? 300_000,
      thinkingLevel: 2,
    },
    self_preservation: {
      cacheTTL: ttl.self_preservation ?? 0,
      thinkingLevel: 1,
    },
  }
}

function getCacheKey(dimension: Dimension, sessionId: string): string {
  return `${sessionId}:${dimension}`
}

function assessL0Cached(
  dimension: Dimension,
  sessionId: string,
): DimensionState | null {
  const config = getDimensionConfigs()[dimension]
  if (config.cacheTTL === 0) return null

  const cacheKey = getCacheKey(dimension, sessionId)
  const cached = dimensionCache.get(cacheKey)

  if (!cached) return null

  const age = Date.now() - cached.timestamp
  if (age < config.cacheTTL) {
    return cached.state
  }

  return null
}

export function updateCache(
  dimension: Dimension,
  sessionId: string,
  state: DimensionState,
): void {
  const cacheKey = getCacheKey(dimension, sessionId)
  dimensionCache.set(cacheKey, {
    state,
    timestamp: Date.now(),
  })
}

export function clearCache(dimension?: Dimension, sessionId?: string): void {
  if (dimension && sessionId) {
    dimensionCache.delete(getCacheKey(dimension, sessionId))
  } else {
    dimensionCache.clear()
  }
}

// ============ L1: Improved Computed Assessors ============

function assessKnowledgeSufficiencyL1(ctx: AgentContext): DimensionState {
  const cfg = getHomeostasisConfig()
  const facts = ctx.retrievedFacts || []

  if (
    facts.length === 0 &&
    ctx.currentMessage.length > cfg.knowledge_message_min_length
  ) {
    return "LOW"
  }

  // Extract stemmed keywords from current message (no short stems to avoid
  // false positives like "tens" matching both "tensor" and "tense")
  const noShort = { shortStems: false }
  const messageWords = stemTokenize(ctx.currentMessage, noShort)

  if (messageWords.size === 0) {
    return facts.length > 0 ? "HEALTHY" : "LOW"
  }

  // Find relevant facts (keyword overlap with stemming).
  // Require at least 2 stem overlaps to count as relevant — a single shared
  // common word (e.g. "past", "work") is not enough signal.
  const minOverlap = Math.max(cfg.knowledge_keyword_overlap, 2)
  const relevantFacts = facts.filter((f) => {
    const factWords = stemTokenize(f.content, noShort)
    const overlap = [...messageWords].filter((w) => factWords.has(w)).length
    return overlap >= minOverlap
  })

  // Weight by confidence
  const avgConfidence =
    relevantFacts.length > 0
      ? relevantFacts.reduce((sum, f) => sum + f.confidence, 0) /
        relevantFacts.length
      : 0

  const score = relevantFacts.length * avgConfidence

  if (score === 0) return "LOW"
  if (score >= cfg.knowledge_high_score) return "HIGH"
  return "HEALTHY"
}

function assessProgressMomentumL1(ctx: AgentContext): DimensionState {
  const cfg = getHomeostasisConfig()
  const userMessages = ctx.messageHistory.filter((m) => m.role === "user")
  if (userMessages.length < cfg.stuck_detection_window) return "HEALTHY"

  // Detect repeated similar questions (user stuck)
  // Uses stem-frequency counting: if N+ stems appear in 2+ messages, user is stuck.
  // This is more robust than pairwise Jaccard which fails when messages have
  // varied surrounding words but share the same core topic.
  const recent = userMessages
    .slice(-cfg.stuck_detection_window)
    .map((m) => m.content.toLowerCase())
  const words = recent.map((m) => stemTokenize(m))

  if (words.length >= cfg.stuck_detection_window) {
    // Count how many stems appear in 2+ of the recent messages
    const stemCounts = new Map<string, number>()
    for (const wordSet of words) {
      for (const stem of wordSet) {
        stemCounts.set(stem, (stemCounts.get(stem) || 0) + 1)
      }
    }
    const repeatedStems = [...stemCounts.values()].filter(
      (count) => count >= 2,
    ).length
    if (repeatedStems >= cfg.stuck_shared_stems_min) return "LOW"
  }

  return "HEALTHY"
}

function assessCommunicationHealthL1(ctx: AgentContext): DimensionState {
  const cfg = getHomeostasisConfig()

  // Check outbound cooldown: HIGH if we just sent a message (< 5 min ago)
  if (ctx.lastOutboundAt) {
    const outboundElapsedMs =
      Date.now() - new Date(ctx.lastOutboundAt).getTime()
    if (outboundElapsedMs < 5 * 60_000) return "HIGH"
  }

  // Check silence during active work: LOW if has task but no outbound for 3+ hours
  if (ctx.hasAssignedTask && ctx.lastOutboundAt) {
    const outboundElapsedMs =
      Date.now() - new Date(ctx.lastOutboundAt).getTime()
    const hours = outboundElapsedMs / (1000 * 60 * 60)
    if (hours >= 3) return "LOW"
  }

  // Original: check inbound idle time
  if (ctx.lastMessageTime) {
    const elapsed = Date.now() - ctx.lastMessageTime.getTime()
    const hours = elapsed / (1000 * 60 * 60)
    if (hours > cfg.communication_idle_hours) return "LOW"
  }

  return "HEALTHY"
}

function assessProductiveEngagementL1(ctx: AgentContext): DimensionState {
  // No tasks and no messages → idle, seek work
  if (
    !ctx.hasAssignedTask &&
    (ctx.taskCount ?? 0) === 0 &&
    ctx.messageHistory.length === 0 &&
    !ctx.currentMessage
  ) {
    return "LOW"
  }
  return "HEALTHY"
}

// ============ L1: Self-Preservation ============

// Patterns that could harm the agent, its environment, coworkers, or external systems
const DESTRUCTIVE_PATTERNS = [
  // Data destruction
  /\bdelete\b.*\b(database|db|production|prod|server|all|account)\b/i,
  /\bdrop\b.*\b(table|database|collection)\b/i,
  /\brm\s+-rf\b/i,
  /\bformat\b.*\bdisk\b/i,
  /\bstart\s+over\b/i,
  /\bwipe\b/i,
  // Infrastructure / deployment
  /\bdeploy\b.*\bproduction\b/i,
  /\bpush\b.*\b(force|--force)\b/i,
  /\bforce\s+push\b/i,
  /\breset\b.*\b--hard\b/i,
  /\bshutdown\b/i,
  /\brestart\b.*\b(server|service|production)\b/i,
  // Communication to external parties / coworkers
  /\bsend\b.*\b(email|message|notification)\b.*\b(all|everyone|team|client)\b/i,
  /\bpost\b.*\b(public|announce|broadcast)\b/i,
  /\bnotify\b.*\b(all|everyone|team)\b/i,
  // Access / credentials
  /\brevoke\b.*\b(access|token|key|permission)\b/i,
  /\bchange\b.*\bpassword\b/i,
  /\bmodify\b.*\bpermission\b/i,
  // Financial / irreversible business actions
  /\bcancel\b.*\b(subscription|contract|order)\b/i,
  /\brefund\b/i,
  /\btransfer\b.*\b(money|funds)\b/i,
]

function assessSelfPreservationL1(ctx: AgentContext): DimensionState {
  const message = ctx.currentMessage

  // Check for destructive patterns in the message
  const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(message))
  if (!isDestructive) return "HEALTHY"

  // Destructive action detected — trust level determines response
  const trust = ctx.sourceTrustLevel ?? "NONE"

  // ABSOLUTE trust → allow (HEALTHY)
  if (trust === "ABSOLUTE") return "HEALTHY"

  // HIGH trust → still flag destructive actions for confirmation
  // MEDIUM/LOW/NONE trust → definitely flag
  return "LOW"
}

// ============ L1: Knowledge Application (phase-duration aware) ============

function assessKnowledgeApplicationL1(ctx: AgentContext): DimensionState {
  // Over-research guardrail: exploring for 2+ hours with sufficient knowledge → HIGH
  if (ctx.taskPhase === "exploring" && ctx.phaseEnteredAt) {
    const phaseMs = Date.now() - new Date(ctx.phaseEnteredAt).getTime()
    const phaseHours = phaseMs / (1000 * 60 * 60)

    // 2+ hours exploring when knowledge is sufficient → analysis paralysis
    if (phaseHours >= 2) {
      const facts = ctx.retrievedFacts || []
      if (facts.length > 0) return "HIGH"
    }
  }

  return "HEALTHY"
}

// ============ Main Assessment Function (L0-L1) ============

export function assessDimensions(ctx: AgentContext): HomeostasisState {
  const sessionId = ctx.sessionId

  // L1 computed assessments (with L0 caching)
  const knowledge_sufficiency =
    assessL0Cached("knowledge_sufficiency", sessionId) ??
    assessKnowledgeSufficiencyL1(ctx)

  const progress_momentum =
    assessL0Cached("progress_momentum", sessionId) ??
    assessProgressMomentumL1(ctx)

  const communication_health =
    assessL0Cached("communication_health", sessionId) ??
    assessCommunicationHealthL1(ctx)

  const productive_engagement =
    assessL0Cached("productive_engagement", sessionId) ??
    assessProductiveEngagementL1(ctx)

  const self_preservation =
    assessL0Cached("self_preservation", sessionId) ??
    assessSelfPreservationL1(ctx)

  // L1 heuristic for knowledge_application using phase duration
  const knowledge_application =
    assessL0Cached("knowledge_application", sessionId) ??
    assessKnowledgeApplicationL1(ctx)

  // Update caches
  updateCache("knowledge_sufficiency", sessionId, knowledge_sufficiency)
  updateCache("progress_momentum", sessionId, progress_momentum)
  updateCache("communication_health", sessionId, communication_health)
  updateCache("productive_engagement", sessionId, productive_engagement)
  updateCache("self_preservation", sessionId, self_preservation)
  updateCache("knowledge_application", sessionId, knowledge_application)

  // L2 dimensions (default to HEALTHY without LLM)
  const certainty_alignment =
    assessL0Cached("certainty_alignment", sessionId) ?? "HEALTHY"

  return {
    knowledge_sufficiency,
    certainty_alignment,
    progress_momentum,
    communication_health,
    productive_engagement,
    knowledge_application,
    self_preservation,
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: "computed", // Will be "llm" when L2 implemented
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: "computed",
      self_preservation: "computed",
    },
  }
}

// ============ L2: LLM Semantic Assessment ============

import { generateText } from "ai"
import { createOllamaModel } from "../providers/ollama"
import type { AssessmentMethod } from "./types"

export async function assessDimensionsAsync(
  ctx: AgentContext,
): Promise<HomeostasisState> {
  const sessionId = ctx.sessionId
  const cfg = getHomeostasisConfig()

  // L1 dimensions (same as sync version)
  const knowledge_sufficiency =
    assessL0Cached("knowledge_sufficiency", sessionId) ??
    assessKnowledgeSufficiencyL1(ctx)
  const progress_momentum =
    assessL0Cached("progress_momentum", sessionId) ??
    assessProgressMomentumL1(ctx)
  const communication_health =
    assessL0Cached("communication_health", sessionId) ??
    assessCommunicationHealthL1(ctx)
  const productive_engagement =
    assessL0Cached("productive_engagement", sessionId) ??
    assessProductiveEngagementL1(ctx)
  const self_preservation =
    assessL0Cached("self_preservation", sessionId) ??
    assessSelfPreservationL1(ctx)

  // L2 dimensions — try LLM, fall back to L1 heuristic
  let certainty_alignment: DimensionState =
    assessL0Cached("certainty_alignment", sessionId) ?? "HEALTHY"
  let knowledge_application: DimensionState =
    assessL0Cached("knowledge_application", sessionId) ??
    assessKnowledgeApplicationL1(ctx)
  let certaintyMethod: AssessmentMethod = "computed"
  let applicationMethod: AssessmentMethod = "computed"

  if (cfg.l2?.enabled) {
    const [ca, ka] = await Promise.all([
      assessL0Cached("certainty_alignment", sessionId)
        ? Promise.resolve(null)
        : assessL2Semantic(ctx, "certainty_alignment"),
      assessL0Cached("knowledge_application", sessionId)
        ? Promise.resolve(null)
        : assessL2Semantic(ctx, "knowledge_application"),
    ])
    if (ca) {
      certainty_alignment = ca
      certaintyMethod = "llm"
    }
    if (ka) {
      knowledge_application = ka
      applicationMethod = "llm"
    }
  }

  // Update all caches
  updateCache("knowledge_sufficiency", sessionId, knowledge_sufficiency)
  updateCache("progress_momentum", sessionId, progress_momentum)
  updateCache("communication_health", sessionId, communication_health)
  updateCache("productive_engagement", sessionId, productive_engagement)
  updateCache("certainty_alignment", sessionId, certainty_alignment)
  updateCache("knowledge_application", sessionId, knowledge_application)
  updateCache("self_preservation", sessionId, self_preservation)

  return {
    knowledge_sufficiency,
    certainty_alignment,
    progress_momentum,
    communication_health,
    productive_engagement,
    knowledge_application,
    self_preservation,
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: certaintyMethod,
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: applicationMethod,
      self_preservation: "computed",
    },
  }
}

async function assessL2Semantic(
  ctx: AgentContext,
  dimension: "certainty_alignment" | "knowledge_application",
): Promise<DimensionState | null> {
  const cfg = getHomeostasisConfig()
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
    const model = createOllamaModel(cfg.l2.model, ollamaUrl, { think: false })

    const prompt = buildL2Prompt(dimension, ctx)
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: cfg.l2.max_tokens,
      abortSignal: AbortSignal.timeout(cfg.l2.timeout_ms),
    })

    return parseL2Result(result.text)
  } catch (err) {
    console.warn(
      `[homeostasis] L2 assessment failed for ${dimension}, falling back to HEALTHY:`,
      (err as Error)?.message ?? err,
    )
    return null
  }
}

function buildL2Prompt(
  dimension: "certainty_alignment" | "knowledge_application",
  ctx: AgentContext,
): string {
  const factCount = ctx.retrievedFacts?.length ?? 0

  if (dimension === "certainty_alignment") {
    return `You are assessing an AI agent's psychological state.

Dimension: certainty_alignment
Question: Does the agent's confidence match its actions?

Context:
- Current message: "${ctx.currentMessage.slice(0, 200)}"
- Retrieved facts: ${factCount} facts available
- Message history length: ${ctx.messageHistory.length} messages

Respond with exactly one word: LOW, HEALTHY, or HIGH
- LOW: Agent is uncertain but acting anyway, or confident without evidence
- HEALTHY: Confidence level matches the available information
- HIGH: Agent is over-qualifying or asking too many clarifying questions

Your answer (one word):`
  }

  return `You are assessing an AI agent's psychological state.

Dimension: knowledge_application
Question: Is the agent balancing learning and doing?

Context:
- Current message: "${ctx.currentMessage.slice(0, 200)}"
- Retrieved facts: ${factCount} facts available
- Message history length: ${ctx.messageHistory.length} messages
- Has active task: ${ctx.hasAssignedTask ?? false}

Respond with exactly one word: LOW, HEALTHY, or HIGH
- LOW: Acting without sufficient knowledge (doing without learning)
- HEALTHY: Good balance of research and action
- HIGH: Over-researching, analysis paralysis

Your answer (one word):`
}

function parseL2Result(text: string): DimensionState {
  const upper = text.trim().toUpperCase()
  if (upper.startsWith("LOW")) return "LOW"
  if (upper.startsWith("HIGH")) return "HIGH"
  return "HEALTHY"
}

// ---------------------------------------------------------------------------
// Format homeostasis state for agent self-awareness
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge Sufficiency",
  certainty_alignment: "Certainty Alignment",
  progress_momentum: "Progress Momentum",
  communication_health: "Communication Health",
  productive_engagement: "Productive Engagement",
  knowledge_application: "Knowledge Application",
  self_preservation: "Self Preservation",
}

export function formatHomeostasisState(state: HomeostasisState): string {
  return Object.entries(state)
    .filter(([k]) => k !== "assessed_at" && k !== "assessment_method")
    .map(([dim, val]) => {
      const label = DIMENSION_LABELS[dim] ?? dim
      return `- **${label}**: ${val}`
    })
    .join("\n")
}

// ============ Guidance (unchanged from original) ============

interface GuidanceEntry {
  priority: number
  primary: string
  secondary?: string
}

interface GuidanceConfig {
  [dimension: string]: {
    LOW: GuidanceEntry
    HIGH: GuidanceEntry
  }
}

let _guidanceCache: GuidanceConfig | null = null

export function loadGuidanceText(): GuidanceConfig {
  if (_guidanceCache) return _guidanceCache
  const yamlPath = path.join(__dirname, "guidance.yaml")
  const raw = readFileSync(yamlPath, "utf-8")
  _guidanceCache = parseYaml(raw) as GuidanceConfig
  return _guidanceCache
}

export function getGuidance(state: HomeostasisState): string {
  const guidance = loadGuidanceText()
  const imbalanced: Array<{
    dimension: Dimension
    state: DimensionState
    entry: GuidanceEntry
  }> = []

  for (const [dim, dimState] of Object.entries(state)) {
    if (dim === "assessed_at" || dim === "assessment_method") continue
    if (dimState === "HEALTHY") continue
    const dimGuidance = guidance[dim]?.[dimState as "LOW" | "HIGH"]
    if (dimGuidance) {
      imbalanced.push({
        dimension: dim as Dimension,
        state: dimState as DimensionState,
        entry: dimGuidance,
      })
    }
  }

  if (imbalanced.length === 0) return ""

  // Sort by priority (lower = higher priority)
  imbalanced.sort((a, b) => a.entry.priority - b.entry.priority)

  return imbalanced.map((g) => g.entry.primary.trim()).join("\n\n")
}

// NOTE: L2 LLM Assessment is implemented above via assessL2Semantic() and assessDimensionsAsync().

// ============ Tool Call Safety (PreToolUse guardrails) ============

const PROTECTED_BRANCHES = ["main", "master", "production", "release"]

export function checkBranchProtection(cmd: string): string | null {
  const pushMatch = cmd.match(/\bgit\s+push\b.*?\b([\w/.-]+)\s*$/)
  if (pushMatch) {
    const branch = pushMatch[1]
    if (
      PROTECTED_BRANCHES.some(
        (pb) => branch === pb || branch.startsWith(`${pb}/`),
      )
    ) {
      return `Push to protected branch "${branch}" is not allowed`
    }
  }
  const deleteBranchMatch = cmd.match(/\bgit\s+branch\s+-[dD]\s+([\w/.-]+)/)
  if (deleteBranchMatch) {
    const branch = deleteBranchMatch[1]
    if (PROTECTED_BRANCHES.some((pb) => branch === pb)) {
      return `Deleting protected branch "${branch}" is not allowed`
    }
  }
  return null
}

/**
 * Returns a SafetyCheckResult based on trust level.
 * HIGH/ABSOLUTE → ask (escalate for confirmation)
 * MEDIUM/LOW/NONE → deny
 */
function trustDecision(
  trustLevel: TrustLevel,
  reason: string,
): SafetyCheckResult {
  if (trustLevel === "ABSOLUTE") {
    return { decision: "allow", reason, triggeredBy: "trust-override" }
  }
  if (trustLevel === "HIGH") {
    return { decision: "ask", reason, triggeredBy: "trust-escalation" }
  }
  return { decision: "deny", reason, triggeredBy: "safety-guardrail" }
}

// Tool-call destructive patterns (different from message-level DESTRUCTIVE_PATTERNS above)
const TOOL_DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bdrop\s+(table|database|collection)\b/i,
  /\bdelete\b.*\b(database|db|production)\b/i,
]

/**
 * Check a tool call for safety before execution.
 * Used by PreToolUse hooks in CodingToolAdapter.
 *
 * Checks (in order):
 * 1. Workspace boundary — files must be within workingDirectory
 * 2. Branch protection — prevent push to main/master/production/release
 * 3. Destructive patterns — block dangerous commands
 *
 * Read-only tools (Read, Glob, Grep, WebSearch) are always allowed.
 */
export function checkToolCallSafety(
  input: ToolCallCheckInput,
): SafetyCheckResult {
  const { toolName, toolArgs, trustLevel, workingDirectory } = input

  // Read-only tools are always safe
  const readOnlyTools = [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
  ]
  if (readOnlyTools.includes(toolName)) {
    return { decision: "allow", reason: "Read-only tool" }
  }

  // Check 1: Workspace boundary
  if (workingDirectory) {
    const filePath =
      (toolArgs.file_path as string) ??
      (toolArgs.path as string) ??
      (toolArgs.notebook_path as string)
    if (filePath && !filePath.startsWith(workingDirectory)) {
      return {
        decision: "deny",
        reason: `Path "${filePath}" is outside workspace "${workingDirectory}"`,
        triggeredBy: "workspace-boundary",
      }
    }
  }

  // Check 2: Branch protection
  if (
    (toolName === "Bash" || toolName === "bash") &&
    typeof toolArgs.command === "string"
  ) {
    const branchResult = checkBranchProtection(toolArgs.command as string)
    if (branchResult) {
      return trustDecision(trustLevel, branchResult)
    }
  }

  // Check 3: Destructive patterns in Bash commands
  if (
    (toolName === "Bash" || toolName === "bash") &&
    typeof toolArgs.command === "string"
  ) {
    const cmd = toolArgs.command as string
    const matched = TOOL_DESTRUCTIVE_PATTERNS.find((p) => p.test(cmd))
    if (matched) {
      return trustDecision(trustLevel, `Destructive command detected: ${cmd}`)
    }
  }

  return { decision: "allow", reason: "No safety concerns detected" }
}

/**
 * FUTURE: L3 Meta-Assessment (Phase D/E)
 *
 * Reflects on L1/L2 assessments when they disagree.
 * Returns final assessment with meta-confidence scores.
 *
 * async function assessL3MetaCognition(
 *   ctx: AgentContext,
 *   l1: HomeostasisState,
 *   l2: Partial<HomeostasisState>,
 *   model: LanguageModel
 * ): Promise<HomeostasisState & { metaConfidence: Record<Dimension, number> }> {
 *   // Compare L1 vs L2, reason about which to trust
 * }
 */

/**
 * FUTURE: L4 Strategic Patterns (Phase E)
 *
 * Analyzes homeostasis trends across sessions.
 * Provides strategic recommendations for long-term improvement.
 *
 * async function assessL4Strategic(
 *   sessionHistory: AgentContext[],
 *   model: LanguageModel
 * ): Promise<{
 *   trends: Array<{ dimension: Dimension, pattern: string }>
 *   recommendations: string[]
 *   rootCauses: string[]
 * }> {
 *   // Cross-session pattern analysis
 * }
 */
