/**
 * Phase 3: Activity Router
 *
 * Routes tasks to appropriate activity levels (0-3) based on complexity,
 * risk, and knowledge requirements. Determines optimal model selection.
 *
 * Activity Levels:
 * - Level 0 (Direct): No LLM needed (templates, tool calls)
 * - Level 1 (Pattern): Cheap model (Haiku) following procedures
 * - Level 2 (Reason): Capable model (Sonnet) for implementation
 * - Level 3 (Reflect): Deep reasoning (Sonnet + Reflexion loop)
 *
 * Model Selection:
 * - Level 0 → none (direct execution)
 * - Level 1 → haiku (cheap, fast, pattern-following)
 * - Level 2 → sonnet (capable, reasoning)
 * - Level 3 → sonnet (with reflexion loop)
 *
 * Usage:
 *   const router = new ActivityRouter()
 *   const classification = await router.classify(task, procedure, homeostasis)
 *   const model = router.selectModel(classification.level)
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import YAML from "yaml"
import {
  enrichTaskWithFlags,
  hasProcedureMatch,
} from "./classification-helpers"
import type {
  ActivityClassification,
  ActivityLevel,
  HomeostasisState,
  ModelSpec,
  Procedure,
  Task,
} from "./types"

// ============================================================================
// Model Configuration Types
// ============================================================================

interface ModelsConfig {
  models: Record<string, ModelSpec>
}

// Cache models config (loaded once on first use)
let modelsConfigCache: ModelsConfig | null = null

/**
 * Get default models configuration (fallback when YAML fails to load).
 */
function getDefaultModelsConfig(): ModelsConfig {
  return {
    models: {
      none: {
        id: "none",
        provider: "none",
        model_id: "none",
        characteristics: ["direct-execution"],
        suitable_for: [0],
        cost_per_1k_tokens: 0,
      },
      haiku: {
        id: "haiku",
        provider: "anthropic",
        model_id: "claude-haiku-4-5-20251001",
        characteristics: ["fast", "cheap", "pattern-following"],
        suitable_for: [1],
        cost_per_1k_tokens: 0.001,
      },
      sonnet: {
        id: "sonnet",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250929",
        characteristics: ["capable", "reasoning", "implementation"],
        suitable_for: [2, 3],
        cost_per_1k_tokens: 0.015,
      },
    },
  }
}

/**
 * Load models configuration from YAML file.
 * Cached after first load. Falls back to defaults if loading fails.
 */
function loadModelsConfig(): ModelsConfig {
  if (modelsConfigCache) {
    return modelsConfigCache
  }

  try {
    const modelsPath = join(__dirname, "..", "..", "config", "models.yaml")
    const yamlContent = readFileSync(modelsPath, "utf-8")
    const parsed = YAML.parse(yamlContent)

    // Basic validation
    if (!parsed || typeof parsed !== "object" || !parsed.models) {
      throw new Error("Invalid YAML structure")
    }

    modelsConfigCache = parsed as ModelsConfig
    return modelsConfigCache
  } catch (error) {
    console.error(
      "[ActivityRouter] Failed to load config/models.yaml, using defaults:",
      error instanceof Error ? error.message : String(error),
    )
    modelsConfigCache = getDefaultModelsConfig()
    return modelsConfigCache
  }
}

/**
 * Activity Router
 *
 * Classifies tasks into activity levels (0-3) and selects appropriate
 * model for execution. Integrates with HomeostasisEngine for intelligent routing.
 */
export class ActivityRouter {
  /**
   * Classify a task to determine activity level and execution strategy.
   *
   * Decision tree:
   * 1. Level 0: Direct execution (templates, tool calls)
   * 2. Level 3: High-risk situations (knowledge gaps + high stakes, irreversible actions)
   * 3. Level 1: Procedure match with high success rate (>0.8)
   * 4. Level 2: Default for reasoning tasks
   *
   * @param task - Task information (message, flags)
   * @param procedure - Matched procedure (if any)
   * @param homeostasis - Current homeostasis state (if assessed)
   * @returns Classification with level, model, and routing flags
   */
  async classify(
    task: Task,
    procedure: Procedure | null,
    homeostasis: HomeostasisState | null,
  ): Promise<ActivityClassification> {
    // Enrich task with computed flags if not already present
    const enrichedTask = enrichTaskWithFlags(task)

    // Level 0: Direct execution (no LLM needed)
    if (enrichedTask.isToolCall || enrichedTask.isTemplate) {
      return {
        level: 0,
        reason: enrichedTask.isToolCall
          ? "Direct tool call - no LLM needed"
          : "Template message - no LLM needed",
        model: "none",
        skipMemory: true,
        skipHomeostasis: true,
      }
    }

    // Level 3: High-risk situations requiring deep reflection
    const needsReflection = this._needsReflexion(enrichedTask, homeostasis)
    if (needsReflection.needs) {
      return {
        level: 3,
        reason: needsReflection.reason,
        model: "sonnet",
        skipMemory: false,
        skipHomeostasis: false,
      }
    }

    // Level 1: Strong procedure match
    if (hasProcedureMatch(procedure)) {
      return {
        level: 1,
        reason: `Strong procedure match: "${procedure!.name}" (${(procedure!.success_rate * 100).toFixed(0)}% success, ${procedure!.times_used} uses)`,
        model: "haiku",
        skipMemory: false,
        skipHomeostasis: true, // Computed-only for Level 1
      }
    }

    // Level 2: Default reasoning (most tasks)
    return {
      level: 2,
      reason: "Standard reasoning task",
      model: "sonnet",
      skipMemory: false,
      skipHomeostasis: false,
    }
  }

  /**
   * Select model for a given activity level.
   *
   * @param level - Activity level (0-3)
   * @returns Model specification
   */
  selectModel(level: ActivityLevel): ModelSpec {
    const config = loadModelsConfig()

    // Find model suitable for this level
    for (const model of Object.values(config.models)) {
      if (model.suitable_for.includes(level)) {
        return model
      }
    }

    // Fallback to sonnet if no suitable model found
    console.warn(
      `[ActivityRouter] No model configured for level ${level}, falling back to sonnet`,
    )
    return config.models.sonnet || getDefaultModelsConfig().models.sonnet
  }

  /**
   * Determine if task requires Level 3 reflexion.
   *
   * Triggers:
   * - Knowledge gaps (LOW knowledge_sufficiency) + high stakes
   * - Irreversible actions + uncertainty
   * - Explicit knowledge gap flag in task
   *
   * @param task - Task information
   * @param homeostasis - Homeostasis state (if available)
   * @returns Whether reflexion is needed and why
   */
  private _needsReflexion(
    task: Task,
    homeostasis: HomeostasisState | null,
  ): { needs: boolean; reason: string } {
    // Explicit knowledge gap flag
    if (task.hasKnowledgeGap) {
      return {
        needs: true,
        reason: "Knowledge gap detected - requires research and reflection",
      }
    }

    // High-stakes + irreversible
    if (task.isHighStakes && task.isIrreversible) {
      return {
        needs: true,
        reason:
          "High-stakes irreversible action - requires careful deliberation",
      }
    }

    // Low knowledge sufficiency + high stakes
    if (
      homeostasis &&
      homeostasis.knowledge_sufficiency === "LOW" &&
      task.isHighStakes
    ) {
      return {
        needs: true,
        reason:
          "Knowledge gap + high stakes - reflexion needed to gather evidence",
      }
    }

    // Uncertainty + irreversible action
    if (
      homeostasis &&
      homeostasis.certainty_alignment === "LOW" &&
      task.isIrreversible
    ) {
      return {
        needs: true,
        reason:
          "Uncertainty about irreversible action - reflexion needed for verification",
      }
    }

    return { needs: false, reason: "" }
  }
}

/**
 * Create a new ActivityRouter instance.
 * Convenience factory function.
 */
export function createActivityRouter(): ActivityRouter {
  return new ActivityRouter()
}
