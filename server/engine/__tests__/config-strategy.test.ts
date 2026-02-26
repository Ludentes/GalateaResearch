// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  getExtractionStrategyConfig,
  type ExtractionStrategyConfig,
} from "../config"

describe("getExtractionStrategyConfig", () => {
  it("returns a valid strategy config", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.strategy).toMatch(/^(heuristics-only|cloud|hybrid)$/)
  })

  it("has consolidation settings", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.consolidation).toBeDefined()
    expect(typeof cfg.consolidation.enabled).toBe("boolean")
    expect(typeof cfg.consolidation.max_new_entries).toBe("number")
  })

  it("has cloud settings when strategy uses cloud", () => {
    const cfg = getExtractionStrategyConfig()
    expect(cfg.cloud).toBeDefined()
    expect(typeof cfg.cloud.provider).toBe("string")
    expect(typeof cfg.cloud.model).toBe("string")
  })
})
