/**
 * Fuzzy matching and scoring for more lenient fact comparison
 */

/**
 * Normalize string: lowercase, trim, collapse whitespace, remove punctuation
 */
function normalize(s: string): string {
  return s.toLowerCase()
    .trim()
    .replace(/[.,!?;:'"]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
}

/**
 * Fuzzy match entities - exact match after normalization
 */
export function fuzzyMatchEntity(extracted: string, expected: string): boolean {
  return normalize(extracted) === normalize(expected)
}

/**
 * Compute word overlap ratio between two strings
 */
function computeWordOverlap(str1: string, str2: string): number {
  const words1 = new Set(normalize(str1).split(' ').filter(w => w.length > 2))
  const words2 = new Set(normalize(str2).split(' ').filter(w => w.length > 2))

  if (words2.size === 0) return words1.size === 0 ? 1.0 : 0.0

  const overlap = [...words2].filter(w => words1.has(w)).length
  return overlap / words2.size
}

export interface Fact {
  fact: string
  source: string | { name: string }
  target: string | { name: string }
}

/**
 * Fuzzy match facts using word overlap
 * - Entities must match exactly (after normalization)
 * - Fact text must have >= 70% word overlap
 */
export function fuzzyMatchFact(
  extracted: Fact,
  expected: Fact,
  threshold: number = 0.7
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

  // Entities must match exactly (after normalization)
  const entitiesMatch =
    fuzzyMatchEntity(extractedSource, expectedSource) &&
    fuzzyMatchEntity(extractedTarget, expectedTarget)

  if (!entitiesMatch) return false

  // Fact text must have sufficient word overlap
  const overlap = computeWordOverlap(extracted.fact, expected.fact)
  return overlap >= threshold
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
 * Calculate fuzzy scores using word overlap matching
 */
export function calculateFuzzyScores(
  expected: ExpectedOutput,
  extracted: ExtractedOutput,
  factThreshold: number = 0.7
): Scores {
  // Entity scoring (same as strict - already lenient)
  const matchedExtractedEntities = extracted.entities.filter(e =>
    expected.entities.some(exp => fuzzyMatchEntity(e.name, exp.name))
  )

  const entity_precision = extracted.entities.length > 0
    ? matchedExtractedEntities.length / extracted.entities.length
    : (expected.entities.length === 0 ? 1.0 : 0)

  const matchedExpectedEntities = expected.entities.filter(exp =>
    extracted.entities.some(e => fuzzyMatchEntity(e.name, exp.name))
  )

  const entity_recall = expected.entities.length > 0
    ? matchedExpectedEntities.length / expected.entities.length
    : 1.0

  const entity_f1 = (entity_precision + entity_recall) > 0
    ? 2 * (entity_precision * entity_recall) / (entity_precision + entity_recall)
    : 0

  // Fact scoring with fuzzy matching
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
      return fuzzyMatchFact(extractedFact, expectedFact, factThreshold)
    })
  })

  const fact_precision = extracted.facts.length > 0
    ? matchedExtractedFacts.length / extracted.facts.length
    : (expected.facts.length === 0 ? 1.0 : 0)

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
      return fuzzyMatchFact(extractedFact, expectedFact, factThreshold)
    })
  })

  const fact_recall = expected.facts.length > 0
    ? matchedExpectedFacts.length / expected.facts.length
    : 1.0

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
