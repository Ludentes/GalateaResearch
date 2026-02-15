import { stemmer } from "stemmer"
import { getHomeostasisConfig } from "./config"

/**
 * Minimum prefix length for the short-stem heuristic.
 * When a stem is longer than this, we also add its truncated form to the set.
 * This ensures cross-text matching for abbreviated forms:
 *   "auth" (stays "auth") matches "authentication" (stems to "authent",
 *   short-stem "auth").
 */
const SHORT_STEM_LENGTH = 4

/**
 * Tokenize text into a Set of stemmed words.
 *
 * Uses Porter stemming to normalize inflected forms ("fixing" -> "fix",
 * "authentication" -> "authent") so Jaccard similarity works across
 * vocabulary substitutions.
 *
 * Also adds a short-stem variant (first 4 chars) for stems longer than 4,
 * enabling cross-text prefix matching. This handles cases where Porter
 * stemming doesn't fully normalize abbreviations
 * (e.g. "auth" stays "auth" while "authentication" -> "authent").
 */
export function stemTokenize(text: string): Set<string> {
  const cfg = getHomeostasisConfig()
  const minLen = cfg.keyword_min_length

  const result = new Set<string>()

  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= minLen)

  for (const word of words) {
    const stem = stemmer(word)
    result.add(stem)

    // Add short-stem variant for cross-text prefix matching
    if (stem.length > SHORT_STEM_LENGTH) {
      result.add(stem.slice(0, SHORT_STEM_LENGTH))
    }
  }

  return result
}
