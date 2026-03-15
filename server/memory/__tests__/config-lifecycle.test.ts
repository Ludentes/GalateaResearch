// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadConfig, resetConfigCache } from "../../engine/config"

describe("Evidence-based lifecycle config", () => {
  it("loads extraction novelty_filter setting", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.extraction.novelty_filter).toBe(true)
    expect(config.extraction.inferred_confidence_cap).toBe(0.7)
    expect(config.extraction.auto_approve_explicit_threshold).toBe(0.9)
  })

  it("loads artifact_generation settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.artifact_generation).toBeDefined()
    expect(config.artifact_generation.claude_md.max_lines).toBe(200)
    expect(config.artifact_generation.skills.max_count).toBe(3)
    expect(config.artifact_generation.hooks.auto_convert).toBe(false)
  })

  it("loads decay origin_grace_multipliers", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.memory.decay.origin_grace_multipliers).toBeDefined()
    expect(
      config.memory.decay.origin_grace_multipliers["explicit-statement"],
    ).toBe(2.0)
    expect(config.memory.decay.origin_grace_multipliers.inferred).toBe(0.5)
  })

  it("loads curation queue settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.curation).toBeDefined()
    expect(config.curation.queue_max_items).toBe(20)
  })

  it("loads feedback loop settings", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.feedback).toBeDefined()
    expect(config.feedback.min_sessions_for_impact).toBe(3)
  })
})
