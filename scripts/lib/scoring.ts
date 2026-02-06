/**
 * Scoring engine for Graphiti LLM benchmark evaluation.
 *
 * Calculates precision, recall, and F1 scores for entity and fact extraction.
 */

/**
 * Normalize string for fuzzy matching: lowercase, trim, collapse whitespace.
 */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Match two entity names with fuzzy normalization.
 */
export function matchEntity(extracted: string, expected: string): boolean {
  return normalize(extracted) === normalize(expected)
}

export interface Fact {
  fact: string
  source: string | { name: string }
  target: string | { name: string }
}

/**
 * Match two facts: must match source AND target entities AND fact text.
 */
export function matchFact(
  extracted: Fact,
  expected: Fact
): boolean {
  // Extract entity names (handle both string and object formats)
  const extractedSource = typeof extracted.source === 'string'
    ? extracted.source
    : extracted.source.name
  const extractedTarget = typeof extracted.target === 'string'
    ? extracted.target
    : extracted.target.name
  const expectedSource = typeof expected.source === 'string'
    ? expected.source
    : expected.source.name
  const expectedTarget = typeof expected.target === 'string'
    ? expected.target
    : expected.target.name

  // Must match source AND target entities
  const entitiesMatch =
    matchEntity(extractedSource, expectedSource) &&
    matchEntity(extractedTarget, expectedTarget)

  if (!entitiesMatch) return false

  // Fact text must also match (normalized)
  return normalize(extracted.fact) === normalize(expected.fact)
}
