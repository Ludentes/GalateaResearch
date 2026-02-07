/**
 * Scoring for atomic facts (Mem0 style) vs structured triples.
 *
 * Instead of matching structured {source, target, fact} triples,
 * we check if atomic fact strings contain the expected information.
 */

/**
 * Normalize string for matching: lowercase, trim, collapse whitespace.
 */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

export interface AtomicFact {
  memory: string
}

export interface ExpectedFact {
  fact: string
  source_entity: string
  target_entity: string
}

/**
 * Check if an atomic fact contains the key information from an expected fact.
 *
 * Strategy:
 * 1. Both entities must be mentioned in the atomic fact
 * 2. Fact text must have >=50% word overlap with atomic fact
 */
export function matchAtomicFact(
  atomic: AtomicFact,
  expected: ExpectedFact,
  entityThreshold = 0.7,
  factThreshold = 0.5
): boolean {
  const atomicNorm = normalize(atomic.memory)
  const atomicWords = new Set(atomicNorm.split(' '))

  // Check if both entities are mentioned
  const sourceNorm = normalize(expected.source_entity)
  const targetNorm = normalize(expected.target_entity)

  const sourceWords = sourceNorm.split(' ')
  const targetWords = targetNorm.split(' ')

  // Entity matching: >=70% of entity words must appear in atomic fact
  const sourceMatches = sourceWords.filter((w: string) => atomicWords.has(w)).length
  const targetMatches = targetWords.filter((w: string) => atomicWords.has(w)).length

  const sourceMatch = sourceMatches / sourceWords.length >= entityThreshold
  const targetMatch = targetMatches / targetWords.length >= entityThreshold

  if (!sourceMatch || !targetMatch) {
    return false
  }

  // Fact content matching: >=50% word overlap
  const expectedNorm = normalize(expected.fact)
  const expectedWords = expectedNorm.split(' ')

  const overlap = expectedWords.filter((w: string) => atomicWords.has(w)).length
  return overlap / expectedWords.length >= factThreshold
}

/**
 * Calculate scores for atomic facts against expected structured facts.
 */
export function scoreAtomicFacts(
  atomicFacts: AtomicFact[],
  expectedFacts: ExpectedFact[]
): {
  precision: number
  recall: number
  f1: number
  matches: number
} {
  if (atomicFacts.length === 0 && expectedFacts.length === 0) {
    return { precision: 1.0, recall: 1.0, f1: 1.0, matches: 0 }
  }

  if (atomicFacts.length === 0) {
    return { precision: 0, recall: 0, f1: 0, matches: 0 }
  }

  if (expectedFacts.length === 0) {
    return { precision: 0, recall: 1.0, f1: 0, matches: 0 }
  }

  // Precision: Of atomic facts, how many match expected?
  let matchedAtomic = 0
  for (const atomic of atomicFacts) {
    if (expectedFacts.some(exp => matchAtomicFact(atomic, exp))) {
      matchedAtomic++
    }
  }

  const precision = matchedAtomic / atomicFacts.length

  // Recall: Of expected facts, how many are covered by atomic facts?
  let matchedExpected = 0
  for (const expected of expectedFacts) {
    if (atomicFacts.some(atomic => matchAtomicFact(atomic, expected))) {
      matchedExpected++
    }
  }

  const recall = matchedExpected / expectedFacts.length

  // F1 score
  const f1 = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0

  return {
    precision,
    recall,
    f1,
    matches: matchedExpected
  }
}

/**
 * Check if an atomic fact contains an entity mention.
 */
export function containsEntity(
  atomic: AtomicFact,
  entityName: string,
  threshold = 0.7
): boolean {
  const atomicNorm = normalize(atomic.memory)
  const atomicWords = new Set(atomicNorm.split(' '))

  const entityNorm = normalize(entityName)
  const entityWords = entityNorm.split(' ')

  const matches = entityWords.filter((w: string) => atomicWords.has(w)).length
  return matches / entityWords.length >= threshold
}

/**
 * Calculate entity coverage from atomic facts.
 */
export function scoreAtomicEntities(
  atomicFacts: AtomicFact[],
  expectedEntities: Array<{ name: string }>
): {
  precision: number
  recall: number
  f1: number
  found: string[]
} {
  if (atomicFacts.length === 0 && expectedEntities.length === 0) {
    return { precision: 1.0, recall: 1.0, f1: 1.0, found: [] }
  }

  if (expectedEntities.length === 0) {
    return { precision: 0, recall: 1.0, f1: 0, found: [] }
  }

  if (atomicFacts.length === 0) {
    return { precision: 0, recall: 0, f1: 0, found: [] }
  }

  // Find which entities are mentioned in atomic facts
  const foundEntities: string[] = []
  for (const entity of expectedEntities) {
    if (atomicFacts.some(atomic => containsEntity(atomic, entity.name))) {
      foundEntities.push(entity.name)
    }
  }

  // Recall: What % of expected entities are mentioned?
  const recall = foundEntities.length / expectedEntities.length

  // For precision, we'd need to extract entities from atomic facts
  // For now, use a simple heuristic: assume each atomic fact mentions 1-2 entities
  const estimatedExtracted = atomicFacts.length * 1.5
  const precision = estimatedExtracted > 0
    ? foundEntities.length / estimatedExtracted
    : 0

  const f1 = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0

  return {
    precision,
    recall,
    f1,
    found: foundEntities
  }
}
