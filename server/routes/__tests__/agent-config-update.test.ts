import { describe, expect, it } from "vitest"
import { validateConfigUpdate } from "../../routes/api/agent/config-validation"

// @vitest-environment node

describe("validateConfigUpdate", () => {
  it("should validate retrieval.max_entries is positive integer", () => {
    const invalid = { retrieval: { max_entries: -5 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/max_entries.*positive/)
  })

  it("should validate retrieval.max_entries does not exceed 100", () => {
    const invalid = { retrieval: { max_entries: 150 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/cannot exceed 100/)
  })

  it("should validate extraction_strategy.strategy is valid enum", () => {
    const invalid = { extraction_strategy: { strategy: "invalid_strategy" } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
  })

  it("should accept valid retrieval settings", () => {
    const valid = { retrieval: { max_entries: 25 } }
    const error = validateConfigUpdate(valid)
    expect(error).toBeNull()
  })

  it("should accept valid extraction strategy", () => {
    const valid = {
      extraction_strategy: { strategy: "heuristics-only" },
    }
    const error = validateConfigUpdate(valid)
    expect(error).toBeNull()
  })

  it("should accept valid signal settings", () => {
    const valid = {
      signal: { greeting_max_length: 50 },
    }
    const error = validateConfigUpdate(valid)
    expect(error).toBeNull()
  })

  it("should reject keys that are not updatable", () => {
    const invalid = { homeostasis: { some_setting: 123 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/not updatable/)
  })

  it("should validate entity_name_min_length is between 1 and 20", () => {
    const invalid = { retrieval: { entity_name_min_length: 0 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()

    const also_invalid = { retrieval: { entity_name_min_length: 30 } }
    const error2 = validateConfigUpdate(also_invalid)
    expect(error2).toBeDefined()
  })

  it("should validate greeting_max_length is between 10 and 200", () => {
    const invalid = { signal: { greeting_max_length: 5 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()

    const also_invalid = { signal: { greeting_max_length: 300 } }
    const error2 = validateConfigUpdate(also_invalid)
    expect(error2).toBeDefined()
  })
})
