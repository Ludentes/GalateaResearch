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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import { parse as parseYaml } from "yaml"
import type {
  AgentContext,
  Dimension,
  DimensionState,
  HomeostasisState,
} from "./types"

// ============ L0: Caching Layer ============

interface CachedAssessment {
  state: DimensionState
  timestamp: number
}

const dimensionCache = new Map<string, CachedAssessment>()

interface DimensionConfig {
  cacheTTL: number // milliseconds
  thinkingLevel: 0 | 1 | 2  // 0=cached, 1=computed, 2=LLM
}

function getDimensionConfigs(): Record<Dimension, DimensionConfig> {
  const ttl = getHomeostasisConfig().cache_ttl
  return {
    knowledge_sufficiency: { cacheTTL: ttl.knowledge_sufficiency ?? 0, thinkingLevel: 1 },
    certainty_alignment: { cacheTTL: ttl.certainty_alignment ?? 60_000, thinkingLevel: 2 },
    progress_momentum: { cacheTTL: ttl.progress_momentum ?? 120_000, thinkingLevel: 1 },
    communication_health: { cacheTTL: ttl.communication_health ?? 1800_000, thinkingLevel: 1 },
    productive_engagement: { cacheTTL: ttl.productive_engagement ?? 0, thinkingLevel: 1 },
    knowledge_application: { cacheTTL: ttl.knowledge_application ?? 300_000, thinkingLevel: 2 },
  }
}

function getCacheKey(dimension: Dimension, sessionId: string): string {
  return `${sessionId}:${dimension}`
}

function assessL0Cached(
  dimension: Dimension,
  sessionId: string
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
  state: DimensionState
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

  if (facts.length === 0 && ctx.currentMessage.length > cfg.knowledge_message_min_length) {
    return "LOW"
  }

  // Extract keywords from current message
  const messageWords = new Set(
    ctx.currentMessage.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length >= cfg.keyword_min_length)
  )

  if (messageWords.size === 0) {
    return facts.length > 0 ? "HEALTHY" : "LOW"
  }

  // Find relevant facts (keyword overlap)
  const relevantFacts = facts.filter(f => {
    const factWords = new Set(
      f.content.toLowerCase().split(/\W+/).filter(w => w.length >= cfg.keyword_min_length)
    )
    const overlap = [...messageWords].filter(w => factWords.has(w)).length
    return overlap >= cfg.knowledge_keyword_overlap
  })

  // Weight by confidence
  const avgConfidence = relevantFacts.length > 0
    ? relevantFacts.reduce((sum, f) => sum + f.confidence, 0) / relevantFacts.length
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
  const recent = userMessages.slice(-cfg.stuck_detection_window).map((m) => m.content.toLowerCase())
  const words = recent.map((m) =>
    new Set(m.split(/\W+/).filter((w) => w.length >= cfg.keyword_min_length)),
  )

  if (words.length >= cfg.stuck_detection_window) {
    for (let i = 0; i < words.length - 1; i++) {
      if (jaccardSets(words[i], words[i + 1]) > cfg.stuck_jaccard_threshold) return "LOW"
    }
  }

  return "HEALTHY"
}

function assessCommunicationHealthL1(ctx: AgentContext): DimensionState {
  const cfg = getHomeostasisConfig()
  if (ctx.lastMessageTime) {
    const elapsed = Date.now() - ctx.lastMessageTime.getTime()
    const hours = elapsed / (1000 * 60 * 60)
    if (hours > cfg.communication_idle_hours) return "LOW"
  }
  return "HEALTHY"
}

function assessProductiveEngagementL1(ctx: AgentContext): DimensionState {
  if (
    !ctx.hasAssignedTask &&
    ctx.messageHistory.length === 0 &&
    !ctx.currentMessage
  ) {
    return "LOW"
  }
  return "HEALTHY"
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((w) => b.has(w))
  const union = new Set([...a, ...b])
  return union.size === 0 ? 0 : intersection.length / union.size
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

  // Update caches
  updateCache("knowledge_sufficiency", sessionId, knowledge_sufficiency)
  updateCache("progress_momentum", sessionId, progress_momentum)
  updateCache("communication_health", sessionId, communication_health)
  updateCache("productive_engagement", sessionId, productive_engagement)

  // L2 dimensions (default to HEALTHY without LLM)
  // TODO: Implement L2 LLM assessment in Phase D
  const certainty_alignment =
    assessL0Cached("certainty_alignment", sessionId) ?? "HEALTHY"
  const knowledge_application =
    assessL0Cached("knowledge_application", sessionId) ?? "HEALTHY"

  return {
    knowledge_sufficiency,
    certainty_alignment,
    progress_momentum,
    communication_health,
    productive_engagement,
    knowledge_application,
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: "computed",  // Will be "llm" when L2 implemented
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: "computed",  // Will be "llm" when L2 implemented
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

  // L2 dimensions — try LLM, fall back to HEALTHY
  let certainty_alignment: DimensionState =
    assessL0Cached("certainty_alignment", sessionId) ?? "HEALTHY"
  let knowledge_application: DimensionState =
    assessL0Cached("knowledge_application", sessionId) ?? "HEALTHY"
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

  return {
    knowledge_sufficiency,
    certainty_alignment,
    progress_momentum,
    communication_health,
    productive_engagement,
    knowledge_application,
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: certaintyMethod,
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: applicationMethod,
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
    const model = createOllamaModel(cfg.l2.model, ollamaUrl)

    const prompt = buildL2Prompt(dimension, ctx)
    const result = await generateText({
      model,
      prompt,
      abortSignal: AbortSignal.timeout(cfg.l2.timeout_ms),
    })

    return parseL2Result(result.text)
  } catch {
    return null // Ollama unavailable — fall back to HEALTHY
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
  const imbalanced: Array<{ dimension: Dimension; state: DimensionState; entry: GuidanceEntry }> = []

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

  return imbalanced
    .map((g) => g.entry.primary.trim())
    .join("\n\n")
}

/**
 * FUTURE: L2 LLM Assessment (Phase D)
 *
 * async function assessL2Semantic(
 *   ctx: AgentContext,
 *   model: LanguageModel
 * ): Promise<{
 *   certainty_alignment: DimensionState
 *   knowledge_application: DimensionState
 * }> {
 *   const prompt = `Assess psychological state...`
 *   const result = await generateText({ model, prompt })
 *   return parseL2Result(result.text)
 * }
 */

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
