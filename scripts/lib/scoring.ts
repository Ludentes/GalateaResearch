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
