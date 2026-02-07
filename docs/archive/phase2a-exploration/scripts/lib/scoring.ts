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

export interface ExpectedOutput {
  entities: Array<{ name: string; labels?: string[] }>
  facts: Array<{
    fact: string
    source_entity: string
    target_entity: string
  }>
}

export interface ExtractedOutput {
  entities: Array<{ name: string; labels?: string[] }>
  facts: Array<{
    fact: string
    source: string
    target: string
  }>
  parse_success: boolean
  latency_ms: number
  error?: string
}

export interface Scores {
  entity_precision: number
  entity_recall: number
  entity_f1: number
  fact_precision: number
  fact_recall: number
  fact_f1: number
  parse_success: boolean
  total_entities: number
  total_facts: number
  latency_ms: number
}

/**
 * Calculate precision/recall/F1 scores for entity and fact extraction.
 */
export function calculateScores(
  expected: ExpectedOutput,
  extracted: ExtractedOutput
): Scores {
  // Entity scoring
  // Precision: Of extracted entities, how many match expected?
  const matchedExtractedEntities = extracted.entities.filter(e =>
    expected.entities.some(exp => matchEntity(e.name, exp.name))
  )

  const entity_precision = extracted.entities.length > 0
    ? matchedExtractedEntities.length / extracted.entities.length
    : (expected.entities.length === 0 ? 1.0 : 0)

  // Recall: Of expected entities, how many were found in extracted?
  const matchedExpectedEntities = expected.entities.filter(exp =>
    extracted.entities.some(e => matchEntity(e.name, exp.name))
  )

  const entity_recall = expected.entities.length > 0
    ? matchedExpectedEntities.length / expected.entities.length
    : 1.0  // No ground truth to miss

  const entity_f1 = (entity_precision + entity_recall) > 0
    ? 2 * (entity_precision * entity_recall) / (entity_precision + entity_recall)
    : 0

  // Fact scoring
  // Precision: Of extracted facts, how many match expected?
  const matchedExtractedFacts = extracted.facts.filter(f => {
    const extractedFact: Fact = {
      fact: f.fact,
      source: f.source,
      target: f.target
    }
    return expected.facts.some(exp => {
      const expectedFact: Fact = {
        fact: exp.fact,
        source: exp.source_entity,
        target: exp.target_entity
      }
      return matchFact(extractedFact, expectedFact)
    })
  })

  const fact_precision = extracted.facts.length > 0
    ? matchedExtractedFacts.length / extracted.facts.length
    : (expected.facts.length === 0 ? 1.0 : 0)

  // Recall: Of expected facts, how many were found in extracted?
  const matchedExpectedFacts = expected.facts.filter(exp => {
    const expectedFact: Fact = {
      fact: exp.fact,
      source: exp.source_entity,
      target: exp.target_entity
    }
    return extracted.facts.some(f => {
      const extractedFact: Fact = {
        fact: f.fact,
        source: f.source,
        target: f.target
      }
      return matchFact(extractedFact, expectedFact)
    })
  })

  const fact_recall = expected.facts.length > 0
    ? matchedExpectedFacts.length / expected.facts.length
    : 1.0  // No ground truth to miss

  const fact_f1 = (fact_precision + fact_recall) > 0
    ? 2 * (fact_precision * fact_recall) / (fact_precision + fact_recall)
    : 0

  return {
    entity_precision,
    entity_recall,
    entity_f1,
    fact_precision,
    fact_recall,
    fact_f1,
    parse_success: extracted.parse_success,
    total_entities: extracted.entities.length,
    total_facts: extracted.facts.length,
    latency_ms: extracted.latency_ms
  }
}
