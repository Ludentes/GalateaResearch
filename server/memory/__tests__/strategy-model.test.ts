// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { ExtractionStrategyConfig } from "../../engine/config"

vi.mock("../../providers/index", () => ({
  getModel: vi.fn(
    (provider?: string, model?: string) =>
      ({
        model: { modelId: model ?? "default-model" },
        modelName: model ?? "default-model",
      }),
  ),
}))

import { getStrategyModel } from "../strategy-model"

describe("getStrategyModel", () => {
  it("returns null for heuristics-only", () => {
    const cfg = {
      strategy: "heuristics-only",
      cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
      consolidation: {
        enabled: false,
        max_new_entries: 20,
        provider: null,
        model: null,
      },
      optimized_prompt: true,
    } as ExtractionStrategyConfig
    const result = getStrategyModel(cfg)
    expect(result).toBeNull()
  })

  it("returns a model for cloud strategy", () => {
    const cfg = {
      strategy: "cloud",
      cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
      consolidation: {
        enabled: false,
        max_new_entries: 20,
        provider: null,
        model: null,
      },
      optimized_prompt: true,
    } as ExtractionStrategyConfig
    const result = getStrategyModel(cfg)
    expect(result).not.toBeNull()
  })

  it("returns a model for hybrid strategy", () => {
    const cfg = {
      strategy: "hybrid",
      cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
      consolidation: {
        enabled: false,
        max_new_entries: 20,
        provider: null,
        model: null,
      },
      optimized_prompt: true,
    } as ExtractionStrategyConfig
    const result = getStrategyModel(cfg)
    expect(result).not.toBeNull()
  })
})
