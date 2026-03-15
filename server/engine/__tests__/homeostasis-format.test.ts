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
})
