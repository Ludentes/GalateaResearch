/**
 * Confabulation Guard — Post-extraction validation.
 *
 * Catches hallucinated content before it enters the knowledge store:
 * 1. Entities not mentioned in source text → removed from entry
 * 2. about.entity not in source text → about field cleared
 * 3. Uniform confidence (all 1.0) → adjusted downward
 * 4. Uniform type (all "fact") → warning logged
 */

import type { KnowledgeEntry } from "./types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuardResult {
  entries: KnowledgeEntry[]
  warnings: string[]
  dropped: number
  modified: number
}

// ---------------------------------------------------------------------------
// Main guard function
// ---------------------------------------------------------------------------

export function validateExtraction(
  entries: KnowledgeEntry[],
  sourceText: string,
  knownPeople: string[] = [],
): GuardResult {
  const warnings: string[] = []
  let dropped = 0
  let modified = 0
  const sourceLower = sourceText.toLowerCase()

  // Pass 1: Check individual entries
  const validated: KnowledgeEntry[] = []
  for (const entry of entries) {
    let changed = false

    // Check entities against source text
    const validEntities = entry.entities.filter((e) =>
      sourceLower.includes(e.toLowerCase()),
    )
    if (validEntities.length < entry.entities.length) {
      const hallucinated = entry.entities.filter(
        (e) => !sourceLower.includes(e.toLowerCase()),
      )
      // If ALL entities are hallucinated and entry has no about, drop it
      if (validEntities.length === 0 && !entry.about) {
        warnings.push(
          `Dropped entry "${entry.content.slice(0, 60)}": hallucinated entities [${hallucinated.join(", ")}]`,
        )
        dropped++
        continue
      }
      // Otherwise, keep entry but remove hallucinated entities
      warnings.push(
        `Removed hallucinated entities [${hallucinated.join(", ")}] from "${entry.content.slice(0, 60)}"`,
      )
      entry.entities = validEntities
      changed = true
    }

    // Check about.entity against source text + known people
    if (entry.about?.entity) {
      const aboutLower = entry.about.entity.toLowerCase()
      const inSource = sourceLower.includes(aboutLower)
      const isKnown = knownPeople.some((p) => p.toLowerCase() === aboutLower)

      if (!inSource && !isKnown) {
        warnings.push(
          `Cleared about.entity="${entry.about.entity}" from "${entry.content.slice(0, 60)}": not in source text`,
        )
        entry.about = undefined
        changed = true
      }
    }

    if (changed) modified++
    validated.push(entry)
  }

  // Pass 2: Check confidence distribution
  if (validated.length >= 3) {
    const confidences = validated.map((e) => e.confidence)
    const allSame = confidences.every((c) => c === confidences[0])

    if (allSame && confidences[0] === 1.0) {
      warnings.push(
        `Uniform confidence 1.0 across ${validated.length} entries — likely hallucination. Adjusting inferred entries to 0.7.`,
      )
      for (const entry of validated) {
        // Keep explicit rules at 1.0, adjust others
        if (entry.type !== "rule") {
          entry.confidence = 0.7
          modified++
        }
      }
    }
  }

  // Pass 3: Check type distribution
  if (validated.length >= 5) {
    const types = validated.map((e) => e.type)
    const allSameType = types.every((t) => t === types[0])

    if (allSameType) {
      warnings.push(
        `All ${validated.length} entries are type="${types[0]}" — may be misclassified`,
      )
    }
  }

  return { entries: validated, warnings, dropped, modified }
}
