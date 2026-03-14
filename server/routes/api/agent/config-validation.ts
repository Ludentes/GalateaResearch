const ALLOWED_KEYS = ["retrieval", "extraction_strategy", "signal"]

interface ConfigUpdateRequest {
  [key: string]: Record<string, any>
}

export function validateConfigUpdate(
  updates: ConfigUpdateRequest,
): { message: string } | null {
  // Check allowed keys
  for (const key of Object.keys(updates)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return { message: `Key "${key}" is not updatable` }
    }
  }

  // Validate retrieval settings
  if (updates.retrieval?.max_entries !== undefined) {
    const val = updates.retrieval.max_entries
    if (!Number.isInteger(val) || val <= 0) {
      return {
        message: "retrieval.max_entries must be a positive integer",
      }
    }
    if (val > 100) {
      return { message: "retrieval.max_entries cannot exceed 100" }
    }
  }

  if (updates.retrieval?.entity_name_min_length !== undefined) {
    const val = updates.retrieval.entity_name_min_length
    if (!Number.isInteger(val) || val < 1 || val > 20) {
      return {
        message: "entity_name_min_length must be between 1 and 20",
      }
    }
  }

  // Validate extraction strategy
  if (updates.extraction_strategy?.strategy !== undefined) {
    const val = updates.extraction_strategy.strategy
    const validStrategies = ["heuristics-only", "cloud", "hybrid"]
    if (!validStrategies.includes(val)) {
      return {
        message: `Invalid strategy. Must be one of: ${validStrategies.join(", ")}`,
      }
    }
  }

  // Validate signal settings
  if (updates.signal?.greeting_max_length !== undefined) {
    const val = updates.signal.greeting_max_length
    if (!Number.isInteger(val) || val < 10 || val > 200) {
      return {
        message: "greeting_max_length must be between 10 and 200",
      }
    }
  }

  return null
}
