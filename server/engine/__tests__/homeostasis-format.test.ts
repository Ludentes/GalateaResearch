// @vitest-environment node
import { describe, expect, it } from "vitest"
import { formatHomeostasisState } from "../homeostasis-engine"
import type { HomeostasisState } from "../types"

const healthyState: HomeostasisState = {
  knowledge_sufficiency: "HEALTHY",
  certainty_alignment: "HEALTHY",
  progress_momentum: "HEALTHY",
  communication_health: "HEALTHY",
  productive_engagement: "HEALTHY",
  knowledge_application: "HEALTHY",
  self_preservation: "HEALTHY",
  assessed_at: new Date(),
  assessment_method: {
    knowledge_sufficiency: "computed",
    certainty_alignment: "computed",
    progress_momentum: "computed",
    communication_health: "computed",
    productive_engagement: "computed",
    knowledge_application: "computed",
    self_preservation: "computed",
  },
}

describe("formatHomeostasisState", () => {
  it("formats all-healthy state", () => {
    const result = formatHomeostasisState(healthyState)
    expect(result).toContain("Knowledge Sufficiency")
    expect(result).toContain("HEALTHY")
    expect(result).not.toContain("assessed_at")
    expect(result).not.toContain("assessment_method")
  })

  it("includes imbalanced dimensions", () => {
    const state = { ...healthyState, knowledge_sufficiency: "LOW" as const }
    const result = formatHomeostasisState(state)
    expect(result).toContain("LOW")
    expect(result).toContain("Knowledge Sufficiency")
  })

  it("returns 7 dimension lines", () => {
    const result = formatHomeostasisState(healthyState)
    const dimensionLines = result
      .split("\n")
      .filter((l) => l.startsWith("- **"))
    expect(dimensionLines).toHaveLength(7)
  })

  it("handles empty state object", () => {
    const emptyState = {
      assessed_at: new Date(),
      assessment_method: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
        progress_momentum: "computed",
        communication_health: "computed",
        productive_engagement: "computed",
        knowledge_application: "computed",
        self_preservation: "computed",
      },
    } as unknown as HomeostasisState
    const result = formatHomeostasisState(emptyState)
    // All entries are filtered out (only assessed_at and assessment_method)
    expect(result).toBe("")
  })

  it("returns empty string when state has only assessed_at and assessment_method", () => {
    const metadataOnlyState = {
      assessed_at: new Date(),
      assessment_method: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
        progress_momentum: "computed",
        communication_health: "computed",
        productive_engagement: "computed",
        knowledge_application: "computed",
        self_preservation: "computed",
      },
    } as unknown as HomeostasisState
    const result = formatHomeostasisState(metadataOnlyState)
    expect(result).toBe("")
    expect(result).not.toContain("assessed_at")
    expect(result).not.toContain("assessment_method")
  })

  it("handles mixed healthy and imbalanced state", () => {
    const mixedState = {
      ...healthyState,
      knowledge_sufficiency: "LOW" as const,
      progress_momentum: "HIGH" as const,
    }
    const result = formatHomeostasisState(mixedState)
    expect(result).toContain("- **Knowledge Sufficiency**: LOW")
    expect(result).toContain("- **Progress Momentum**: HIGH")
    // All 7 dimensions should be present
    const dimensionLines = result
      .split("\n")
      .filter((l) => l.startsWith("- **"))
    expect(dimensionLines).toHaveLength(7)
  })

  it("excludes metadata fields from output", () => {
    const result = formatHomeostasisState(healthyState)
    // Should not contain the literal field names
    expect(result).not.toContain("assessed_at")
    expect(result).not.toContain("assessment_method")
    // Should only contain dimension status lines
    const lines = result.split("\n").filter((l) => l.trim().length > 0)
    expect(lines.every((l) => l.startsWith("- **"))).toBe(true)
  })

  it("falls back to raw key name for unknown dimension labels", () => {
    const stateWithUnknown = {
      ...healthyState,
      experimental_dimension: "HEALTHY",
    } as unknown as HomeostasisState
    const result = formatHomeostasisState(stateWithUnknown)
    // DIMENSION_LABELS has no entry for this key, so raw key is used
    expect(result).toContain("- **experimental_dimension**: HEALTHY")
  })
})
