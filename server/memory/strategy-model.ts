import type { LanguageModel } from "ai"
import type { ExtractionStrategyConfig } from "../engine/config"
import { getModel } from "../providers/index"

/**
 * Return the appropriate LanguageModel for the configured extraction strategy.
 *
 * - heuristics-only: null (no LLM needed)
 * - cloud: uses cfg.cloud.provider and cfg.cloud.model via getModel()
 * - hybrid: uses the default LLM provider (from LLM_PROVIDER env var) via getModel()
 */
export function getStrategyModel(
  cfg: ExtractionStrategyConfig,
): LanguageModel | null {
  switch (cfg.strategy) {
    case "heuristics-only":
      return null
    case "cloud":
      return getModel(cfg.cloud.provider, cfg.cloud.model).model
    case "hybrid":
      return getModel().model
  }
}
