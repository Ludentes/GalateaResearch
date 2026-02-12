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
 */

import { readFileSync } from "node:fs"
import path from "node:path"
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

const DIMENSION_CONFIGS: Record<Dimension, DimensionConfig> = {
  knowledge_sufficiency: {
    cacheTTL: 0,          // Don't cache - changes every message
    thinkingLevel: 1,
  },
  certainty_alignment: {
    cacheTTL: 60_000,     // Cache 1 min (expensive LLM)
    thinkingLevel: 2,     // Needs LLM (defaults to 1 without)
  },
  progress_momentum: {
    cacheTTL: 120_000,    // Cache 2 min
    thinkingLevel: 1,
  },
  communication_health: {
    cacheTTL: 1800_000,   // Cache 30 min (time-based, slow changing)
    thinkingLevel: 1,
  },
  productive_engagement: {
    cacheTTL: 0,          // Don't cache
    thinkingLevel: 1,
  },
  knowledge_application: {
    cacheTTL: 300_000,    // Cache 5 min (expensive LLM)
    thinkingLevel: 2,     // Needs LLM (defaults to 1 without)
  },
}

function getCacheKey(dimension: Dimension, sessionId: string): string {
  return `${sessionId}:${dimension}`
}

function assessL0Cached(
  dimension: Dimension,
  sessionId: string
): DimensionState | null {
  const config = DIMENSION_CONFIGS[dimension]
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

function updateCache(
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

// ============ L1: Improved Computed Assessors ============

function assessKnowledgeSufficiencyL1(ctx: AgentContext): DimensionState {
  const facts = ctx.retrievedFacts || []

  if (facts.length === 0 && ctx.currentMessage.length > 20) {
    return "LOW"
  }

  // Extract keywords from current message
  const messageWords = new Set(
    ctx.currentMessage.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length >= 3)
  )

  if (messageWords.size === 0) {
    return facts.length > 0 ? "HEALTHY" : "LOW"
  }

  // Find relevant facts (keyword overlap)
  const relevantFacts = facts.filter(f => {
    const factWords = new Set(
      f.content.toLowerCase().split(/\W+/).filter(w => w.length >= 3)
    )
    const overlap = [...messageWords].filter(w => factWords.has(w)).length
    return overlap >= 2 // At least 2 matching keywords
  })

  // Weight by confidence
  const avgConfidence = relevantFacts.length > 0
    ? relevantFacts.reduce((sum, f) => sum + f.confidence, 0) / relevantFacts.length
    : 0

  const score = relevantFacts.length * avgConfidence

  if (score === 0) return "LOW"
  if (score >= 2.5) return "HIGH"  // e.g., 3 relevant facts at 90% confidence
  return "HEALTHY"
}

function assessProgressMomentumL1(ctx: AgentContext): DimensionState {
  const userMessages = ctx.messageHistory.filter((m) => m.role === "user")
  if (userMessages.length < 3) return "HEALTHY"

  // Detect repeated similar questions (user stuck)
  const recent = userMessages.slice(-3).map((m) => m.content.toLowerCase())
  const words = recent.map((m) =>
    new Set(m.split(/\W+/).filter((w) => w.length >= 3)),
  )

  if (words.length >= 3) {
    const overlap01 = jaccardSets(words[0], words[1])
    const overlap12 = jaccardSets(words[1], words[2])

    // Detect stuck if ANY consecutive pair has high overlap
    if (overlap01 > 0.5 || overlap12 > 0.5) return "LOW"
  }

  return "HEALTHY"
}

function assessCommunicationHealthL1(ctx: AgentContext): DimensionState {
  if (ctx.lastMessageTime) {
    const elapsed = Date.now() - ctx.lastMessageTime.getTime()
    const hours = elapsed / (1000 * 60 * 60)
    if (hours > 4) return "LOW"
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
