/**
 * Phase 3: Homeostasis Engine
 *
 * The psychological core of Galatea. Assesses 6 dimensions of homeostatic balance
 * and provides guidance when imbalances are detected.
 *
 * Dimensions:
 * 1. knowledge_sufficiency - "Do I know enough to proceed?"
 * 2. certainty_alignment - "Does my confidence match the action stakes?"
 * 3. progress_momentum - "Am I making forward progress?"
 * 4. communication_health - "Am I maintaining connection?"
 * 5. productive_engagement - "Am I actively contributing?"
 * 6. knowledge_application - "Am I balancing learning and doing?"
 *
 * Assessment Methods:
 * - Computed: Fast, rule-based (no LLM)
 * - LLM: Deep reasoning with language model
 *
 * Usage:
 *   const engine = new HomeostasisEngine()
 *   const state = await engine.assessAll(context)
 *   const guidance = engine.getGuidance(state)
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import YAML from "yaml"
import type {
  AgentContext,
  Dimension,
  DimensionAssessment,
  DimensionState,
  GuidanceText,
  HomeostasisState,
} from "./types"

// ============================================================================
// Guidance System Types
// ============================================================================

interface GuidanceEntry {
  priority: number
  primary: string
  secondary: string
}

interface DimensionGuidance {
  LOW: GuidanceEntry
  HIGH: GuidanceEntry
}

type GuidanceConfig = Record<Dimension, DimensionGuidance>

// Cache guidance config (loaded once on first use)
let guidanceConfigCache: GuidanceConfig | null = null

/**
 * Get default guidance configuration (fallback when YAML fails to load).
 * Provides minimal but functional guidance for all dimensions.
 */
function getDefaultGuidanceConfig(): GuidanceConfig {
  const defaultEntry = (dimension: string): DimensionGuidance => ({
    LOW: {
      priority: 3,
      primary: `${dimension} is LOW. Consider addressing this imbalance.`,
      secondary: "Guidance system using defaults due to configuration error.",
    },
    HIGH: {
      priority: 5,
      primary: `${dimension} is HIGH. Consider rebalancing.`,
      secondary: "Guidance system using defaults due to configuration error.",
    },
  })

  return {
    knowledge_sufficiency: defaultEntry("Knowledge sufficiency"),
    certainty_alignment: defaultEntry("Certainty alignment"),
    progress_momentum: defaultEntry("Progress momentum"),
    communication_health: defaultEntry("Communication health"),
    productive_engagement: defaultEntry("Productive engagement"),
    knowledge_application: defaultEntry("Knowledge application"),
  }
}

/**
 * Load guidance configuration from YAML file.
 * Cached after first load. Falls back to defaults if loading fails.
 */
function loadGuidanceConfig(): GuidanceConfig {
  if (guidanceConfigCache) {
    return guidanceConfigCache
  }

  try {
    const guidancePath = join(__dirname, "guidance.yaml")
    const yamlContent = readFileSync(guidancePath, "utf-8")
    const parsed = YAML.parse(yamlContent)

    // Basic validation
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid YAML structure")
    }

    guidanceConfigCache = parsed as GuidanceConfig
    return guidanceConfigCache
  } catch (error) {
    console.error(
      "[HomeostasisEngine] Failed to load guidance.yaml, using defaults:",
      error instanceof Error ? error.message : String(error),
    )
    guidanceConfigCache = getDefaultGuidanceConfig()
    return guidanceConfigCache
  }
}

/**
 * Homeostasis Engine
 *
 * Assesses psychological balance across 6 dimensions and provides
 * actionable guidance when imbalances are detected.
 */
export class HomeostasisEngine {
  /**
   * Assess all 6 dimensions using hybrid approach (computed + LLM).
   * This is the primary method for Level 2-3 activities.
   *
   * @param context - Agent context with session state and memory
   * @returns Complete homeostasis state
   */
  async assessAll(context: AgentContext): Promise<HomeostasisState> {
    const now = new Date()

    // Run all assessments in parallel
    const [
      knowledgeSufficiency,
      certaintyAlignment,
      progressMomentum,
      communicationHealth,
      productiveEngagement,
      knowledgeApplication,
    ] = await Promise.all([
      this.assessKnowledgeSufficiency(context),
      this.assessCertaintyAlignment(context),
      this.assessProgressMomentum(context),
      this.assessCommunicationHealth(context),
      this.assessProductiveEngagement(context),
      this.assessKnowledgeApplication(context),
    ])

    return {
      knowledge_sufficiency: knowledgeSufficiency.state,
      certainty_alignment: certaintyAlignment.state,
      progress_momentum: progressMomentum.state,
      communication_health: communicationHealth.state,
      productive_engagement: productiveEngagement.state,
      knowledge_application: knowledgeApplication.state,
      assessed_at: now,
      assessment_method: {
        knowledge_sufficiency: knowledgeSufficiency.method,
        certainty_alignment: certaintyAlignment.method,
        progress_momentum: progressMomentum.method,
        communication_health: communicationHealth.method,
        productive_engagement: productiveEngagement.method,
        knowledge_application: knowledgeApplication.method,
      },
    }
  }

  /**
   * Quick assessment using only computed methods (no LLM).
   * Used for Level 0-1 activities where speed is critical.
   *
   * @param context - Agent context
   * @returns Partial homeostasis state (only computed dimensions)
   */
  assessQuick(context: AgentContext): Partial<HomeostasisState> {
    const now = new Date()

    // Only computed assessments
    const progressMomentum = this._assessProgressMomentumComputed(context)
    const communicationHealth = this._assessCommunicationHealthComputed(context)
    const productiveEngagement =
      this._assessProductiveEngagementComputed(context)

    return {
      progress_momentum: progressMomentum.state,
      communication_health: communicationHealth.state,
      productive_engagement: productiveEngagement.state,
      assessed_at: now,
      // Note: assessment_method is partial in quick assessment
    }
  }

  /**
   * Assess a single dimension.
   * Used when you need to check one specific dimension.
   *
   * @param dimension - Which dimension to assess
   * @param context - Agent context
   * @returns Assessment for this dimension
   */
  async assessDimension(
    dimension: Dimension,
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    switch (dimension) {
      case "knowledge_sufficiency":
        return this.assessKnowledgeSufficiency(context)
      case "certainty_alignment":
        return this.assessCertaintyAlignment(context)
      case "progress_momentum":
        return this.assessProgressMomentum(context)
      case "communication_health":
        return this.assessCommunicationHealth(context)
      case "productive_engagement":
        return this.assessProductiveEngagement(context)
      case "knowledge_application":
        return this.assessKnowledgeApplication(context)
    }
  }

  /**
   * Get guidance text for imbalanced homeostasis state.
   * Returns actionable advice for dimensions that are LOW or HIGH.
   *
   * @param state - Current homeostasis state
   * @returns Guidance text to include in prompt, or null if all balanced
   */
  getGuidance(state: HomeostasisState): GuidanceText | null {
    const config = loadGuidanceConfig()

    // Find all imbalanced dimensions (not HEALTHY)
    const imbalances: Array<{
      dimension: Dimension
      state: DimensionState
      guidance: GuidanceEntry
    }> = []

    for (const dimension of Object.keys(config) as Dimension[]) {
      const dimensionState = state[dimension]

      if (dimensionState === "LOW" || dimensionState === "HIGH") {
        const guidance = config[dimension][dimensionState]
        imbalances.push({ dimension, state: dimensionState, guidance })
      }
    }

    // No imbalances - everything healthy
    if (imbalances.length === 0) {
      return null
    }

    // Sort by priority (lower number = higher priority)
    imbalances.sort((a, b) => a.guidance.priority - b.guidance.priority)

    // Return highest priority guidance
    const primary = imbalances[0]

    return {
      primary: primary.guidance.primary.trim(),
      secondary:
        primary.guidance.secondary?.trim() ||
        (imbalances.length > 1
          ? `Note: ${imbalances.length - 1} other dimension(s) also need attention.`
          : undefined),
      dimensions: imbalances.map((i) => i.dimension),
    }
  }

  // ============================================================================
  // Computed Assessments (no LLM, fast)
  // ============================================================================

  /**
   * Assess progress momentum using computed method.
   * Based on time on current task and recent action count.
   *
   * LOW: Stuck (>30min on task, <3 actions)
   * HEALTHY: Progressing (balanced time and actions)
   * HIGH: Rushing (many actions in short time)
   */
  private _assessProgressMomentumComputed(
    context: AgentContext,
  ): DimensionAssessment {
    const now = Date.now()
    const taskStartTime = context.currentTaskStartTime?.getTime()
    const actionCount = context.recentActionCount ?? 0

    // No task started yet - can't assess momentum
    if (!taskStartTime) {
      return {
        dimension: "progress_momentum",
        state: "HEALTHY",
        method: "computed",
        confidence: 0.5,
        reason: "No current task, cannot assess momentum",
      }
    }

    const timeOnTaskMs = now - taskStartTime
    const timeOnTaskMin = timeOnTaskMs / (1000 * 60)

    // LOW: Stuck (>30 min on task, <3 actions)
    if (timeOnTaskMin > 30 && actionCount < 3) {
      return {
        dimension: "progress_momentum",
        state: "LOW",
        method: "computed",
        confidence: 0.85,
        reason: `Stuck: ${timeOnTaskMin.toFixed(0)}min on task, only ${actionCount} actions`,
      }
    }

    // HIGH: Rushing (>10 actions in <10 minutes)
    if (timeOnTaskMin < 10 && actionCount > 10) {
      return {
        dimension: "progress_momentum",
        state: "HIGH",
        method: "computed",
        confidence: 0.8,
        reason: `Rushing: ${actionCount} actions in ${timeOnTaskMin.toFixed(0)}min`,
      }
    }

    // HEALTHY: Balanced progress
    return {
      dimension: "progress_momentum",
      state: "HEALTHY",
      method: "computed",
      confidence: 0.7,
      reason: `Steady progress: ${actionCount} actions in ${timeOnTaskMin.toFixed(0)}min`,
    }
  }

  /**
   * Assess communication health using computed method.
   * Based on time since last message.
   *
   * LOW: Silent (>10min since last message)
   * HEALTHY: Regular communication (2-10min)
   * HIGH: Over-communicating (<2min, rapid back-and-forth)
   */
  private _assessCommunicationHealthComputed(
    context: AgentContext,
  ): DimensionAssessment {
    const now = Date.now()
    const lastMessageTime = context.lastMessageTime?.getTime()

    // No previous message - first interaction
    if (!lastMessageTime) {
      return {
        dimension: "communication_health",
        state: "HEALTHY",
        method: "computed",
        confidence: 1.0,
        reason: "First message in session",
      }
    }

    const timeSinceLastMs = now - lastMessageTime
    const timeSinceLastMin = timeSinceLastMs / (1000 * 60)

    // LOW: Silent (>10 minutes)
    if (timeSinceLastMin > 10) {
      return {
        dimension: "communication_health",
        state: "LOW",
        method: "computed",
        confidence: 0.9,
        reason: `Silent: ${timeSinceLastMin.toFixed(0)}min since last message`,
      }
    }

    // HIGH: Over-communicating (<2 minutes, rapid back-and-forth)
    if (timeSinceLastMin < 2) {
      return {
        dimension: "communication_health",
        state: "HIGH",
        method: "computed",
        confidence: 0.75,
        reason: `Rapid back-and-forth: ${timeSinceLastMin.toFixed(1)}min since last message`,
      }
    }

    // HEALTHY: Regular communication (2-10 minutes)
    return {
      dimension: "communication_health",
      state: "HEALTHY",
      method: "computed",
      confidence: 0.85,
      reason: `Regular communication: ${timeSinceLastMin.toFixed(0)}min since last message`,
    }
  }

  /**
   * Assess productive engagement using computed method.
   * Based on task assignment status.
   *
   * LOW: Idle (no assigned task)
   * HEALTHY: Engaged (has task, making progress)
   * HIGH: Overloaded (not applicable for computed method)
   */
  private _assessProductiveEngagementComputed(
    context: AgentContext,
  ): DimensionAssessment {
    const hasTask = context.hasAssignedTask ?? false

    // LOW: Idle (no assigned task)
    if (!hasTask) {
      return {
        dimension: "productive_engagement",
        state: "LOW",
        method: "computed",
        confidence: 0.9,
        reason: "No assigned task - agent is idle",
      }
    }

    // HEALTHY: Has task (detailed assessment requires LLM)
    return {
      dimension: "productive_engagement",
      state: "HEALTHY",
      method: "computed",
      confidence: 0.6,
      reason: "Has assigned task - assuming engaged",
    }
  }

  // ============================================================================
  // Dimension-Specific Assessments (public methods)
  // ============================================================================

  /**
   * Assess knowledge sufficiency.
   * Defaults to LLM assessment, falls back to heuristic if LLM unavailable.
   *
   * LOW: Knowledge gap detected (retrieved facts don't cover task)
   * HEALTHY: Sufficient knowledge to proceed
   * HIGH: Over-informed (retrieved too much, paralysis by analysis)
   */
  private async assessKnowledgeSufficiency(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // TODO: Replace heuristic with LLM assessment in future iteration
    // For now, use fact count and confidence as proxy

    const facts = context.retrievedFacts ?? []
    const procedures = context.retrievedProcedures ?? []

    // No retrieved knowledge at all
    if (facts.length === 0 && procedures.length === 0) {
      return {
        dimension: "knowledge_sufficiency",
        state: "LOW",
        method: "computed", // Using heuristic, not true LLM
        confidence: 0.6,
        reason: "No relevant knowledge retrieved from memory",
      }
    }

    // Has procedure with high success rate - likely sufficient
    const hasStrongProcedure = procedures.some((p) => p.success_rate > 0.8)
    if (hasStrongProcedure) {
      return {
        dimension: "knowledge_sufficiency",
        state: "HEALTHY",
        method: "computed",
        confidence: 0.75,
        reason: "High-confidence procedure available",
      }
    }

    // Too many facts (>20) with low confidence (<0.5 avg)
    if (facts.length > 20) {
      const avgConfidence =
        facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
      if (avgConfidence < 0.5) {
        return {
          dimension: "knowledge_sufficiency",
          state: "HIGH",
          method: "computed",
          confidence: 0.65,
          reason: `Retrieved many facts (${facts.length}) but low average confidence`,
        }
      }
    }

    // Has some facts with decent confidence
    // NOTE: Thresholds tuned for heuristic approach - may need adjustment with real usage
    // Increased from 3 to 5 facts based on code review feedback
    const avgConfidence =
      facts.length > 0
        ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
        : 0

    if (avgConfidence > 0.7 && facts.length >= 5) {
      return {
        dimension: "knowledge_sufficiency",
        state: "HEALTHY",
        method: "computed",
        confidence: 0.75,
        reason: `Retrieved ${facts.length} relevant facts with confidence ${avgConfidence.toFixed(2)}`,
      }
    }

    // Has some facts but uncertain
    return {
      dimension: "knowledge_sufficiency",
      state: "LOW",
      method: "computed",
      confidence: 0.65,
      reason: `Limited knowledge: ${facts.length} facts, avg confidence ${avgConfidence.toFixed(2)}`,
    }
  }

  /**
   * Assess certainty alignment.
   * Defaults to LLM assessment.
   *
   * LOW: Uncertain about high-stakes action (dangerous)
   * HEALTHY: Confidence matches stakes
   * HIGH: Overconfident (may miss edge cases)
   */
  private async assessCertaintyAlignment(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // TODO: Replace heuristic with LLM assessment in future iteration
    // For now, check if message contains uncertainty markers or risky keywords

    const message = context.currentMessage.toLowerCase()

    // Detect uncertainty markers
    const uncertaintyMarkers = [
      "not sure",
      "uncertain",
      "might",
      "maybe",
      "i think",
      "possibly",
      "not confident",
      "unclear",
    ]
    const hasUncertainty = uncertaintyMarkers.some((marker) =>
      message.includes(marker),
    )

    // Detect high-stakes keywords
    const highStakesKeywords = [
      "delete",
      "drop",
      "remove",
      "irreversible",
      "production",
      "deploy",
      "publish",
      "force push",
      "hard reset",
    ]
    const isHighStakes = highStakesKeywords.some((keyword) =>
      message.includes(keyword),
    )

    // LOW: Uncertainty about high-stakes action
    if (hasUncertainty && isHighStakes) {
      return {
        dimension: "certainty_alignment",
        state: "LOW",
        method: "computed",
        confidence: 0.7,
        reason: "Expressing uncertainty about high-stakes action",
      }
    }

    // HIGH: No uncertainty about high-stakes action (overconfident?)
    if (!hasUncertainty && isHighStakes) {
      return {
        dimension: "certainty_alignment",
        state: "HIGH",
        method: "computed",
        confidence: 0.65,
        reason: "High confidence on high-stakes action - verify carefully",
      }
    }

    // HEALTHY: Balanced confidence
    return {
      dimension: "certainty_alignment",
      state: "HEALTHY",
      method: "computed",
      confidence: 0.6,
      reason: "Confidence appears aligned with stakes",
    }
  }

  /**
   * Assess progress momentum.
   * Uses computed assessment, upgrades to LLM if signal is unclear.
   *
   * LOW: Stuck (no progress, spinning)
   * HEALTHY: Steady forward progress
   * HIGH: Rushing (too fast, may introduce bugs)
   */
  private async assessProgressMomentum(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // Use computed assessment (fast)
    const computed = this._assessProgressMomentumComputed(context)

    // For now, just use computed assessment
    // TODO: In A3, add LLM upgrade path when confidence < 0.7
    return computed
  }

  /**
   * Assess communication health.
   * Uses computed assessment.
   *
   * LOW: Silent (communication breakdown)
   * HEALTHY: Regular check-ins
   * HIGH: Over-communicating (spamming)
   */
  private async assessCommunicationHealth(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // Use computed assessment (sufficient for this dimension)
    return this._assessCommunicationHealthComputed(context)
  }

  /**
   * Assess productive engagement.
   * Uses computed assessment, upgrades to LLM for nuance.
   *
   * LOW: Idle (no task, wasting time)
   * HEALTHY: Engaged in meaningful work
   * HIGH: Overloaded (too many tasks)
   */
  private async assessProductiveEngagement(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // Use computed assessment (fast)
    const computed = this._assessProductiveEngagementComputed(context)

    // For now, just use computed assessment
    // TODO: In A3, add LLM upgrade path for detecting overload
    return computed
  }

  /**
   * Assess knowledge application balance.
   * Requires LLM to evaluate research vs building time.
   *
   * LOW: Too much building, not enough research (may miss solutions)
   * HEALTHY: Balanced learning and doing
   * HIGH: Too much research, not enough building (analysis paralysis)
   */
  private async assessKnowledgeApplication(
    context: AgentContext,
  ): Promise<DimensionAssessment> {
    // TODO: Replace heuristic with LLM assessment in future iteration
    // For now, use time spent researching vs building as proxy

    const researchTime = context.timeSpentResearching ?? 0
    const buildingTime = context.timeSpentBuilding ?? 0
    const totalTime = researchTime + buildingTime

    // No time data - cannot assess
    if (totalTime === 0) {
      return {
        dimension: "knowledge_application",
        state: "HEALTHY",
        method: "computed",
        confidence: 0.4,
        reason: "No time tracking data available",
      }
    }

    const researchRatio = researchTime / totalTime

    // HIGH: Too much research (>80% of time)
    if (researchRatio > 0.8) {
      return {
        dimension: "knowledge_application",
        state: "HIGH",
        method: "computed",
        confidence: 0.75,
        reason: `Analysis paralysis: ${(researchRatio * 100).toFixed(0)}% time spent researching`,
      }
    }

    // LOW: Too much building (<20% research)
    if (researchRatio < 0.2) {
      return {
        dimension: "knowledge_application",
        state: "LOW",
        method: "computed",
        confidence: 0.75,
        reason: `Insufficient research: only ${(researchRatio * 100).toFixed(0)}% time spent learning`,
      }
    }

    // HEALTHY: Balanced (20-80%)
    return {
      dimension: "knowledge_application",
      state: "HEALTHY",
      method: "computed",
      confidence: 0.7,
      reason: `Balanced: ${(researchRatio * 100).toFixed(0)}% research, ${((1 - researchRatio) * 100).toFixed(0)}% building`,
    }
  }
}

/**
 * Create a new HomeostasisEngine instance.
 * Convenience factory function.
 */
export function createHomeostasisEngine(): HomeostasisEngine {
  return new HomeostasisEngine()
}
