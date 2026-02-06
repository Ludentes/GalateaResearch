/**
 * Memory Gatekeeper — decides whether a conversation turn should be
 * ingested into the knowledge graph.
 *
 * Uses pattern-based rules for fast classification:
 *   - Always skip: greetings, bare confirmations
 *   - Always keep: corrections, preferences, policies, decisions
 *   - Default: ingest (fail-OPEN — better noise than lost knowledge)
 *
 * Failure policy: fail-OPEN. If anything goes wrong, return shouldIngest=true.
 */

import type { GatekeeperDecision } from "./types"

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

const GREETING_RE =
  /^(hi|hello|hey|good (morning|afternoon|evening)|howdy|sup|what'?s up)\b/i

const CONFIRMATION_RE =
  /^(ok|okay|k|got it|sure|thanks|thank you|ty|great|yes|no|yep|nope|alright|understood|roger|ack|cool|nice)\s*[.!?]?$/i

const PREFERENCE_RE =
  /\b(i (prefer|like|want|love|hate|dislike|always|never|usually))\b/i

const CORRECTION_RE =
  /\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i

const POLICY_RE =
  /\b(we (always|never|should|must)|our (standard|convention|policy|rule)|don'?t (ever|use))\b/i

const DECISION_RE =
  /\b(let'?s (go with|use|choose|pick)|i'?ve decided|we'?ll use|the decision is)\b/i

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a conversation exchange should be ingested into the
 * knowledge graph. Pure function — no I/O, no LLM calls.
 */
export function evaluateGatekeeper(
  userMessage: string,
  assistantResponse: string,
): GatekeeperDecision {
  const trimmedUser = userMessage.trim()

  // Fast-skip: short greetings
  if (GREETING_RE.test(trimmedUser) && trimmedUser.length < 50) {
    return {
      shouldIngest: false,
      reason: "Greeting",
      category: "greeting",
    }
  }

  // Fast-skip: bare confirmations
  if (CONFIRMATION_RE.test(trimmedUser)) {
    return {
      shouldIngest: false,
      reason: "Bare confirmation",
      category: "other",
    }
  }

  // Fast-keep: user corrections
  if (CORRECTION_RE.test(trimmedUser)) {
    return {
      shouldIngest: true,
      reason: "User correction detected",
      category: "correction",
    }
  }

  // Fast-keep: user preferences
  if (PREFERENCE_RE.test(trimmedUser)) {
    return {
      shouldIngest: true,
      reason: "User preference expressed",
      category: "preference",
    }
  }

  // Fast-keep: policies / conventions
  const combined = `${trimmedUser}\n${assistantResponse}`
  if (POLICY_RE.test(combined)) {
    return {
      shouldIngest: true,
      reason: "Policy or convention mentioned",
      category: "policy",
    }
  }

  // Fast-keep: decisions
  if (DECISION_RE.test(combined)) {
    return {
      shouldIngest: true,
      reason: "Decision made",
      category: "decision",
    }
  }

  // Short exchanges with no clear signal — likely noise
  if (trimmedUser.length < 20 && assistantResponse.trim().length < 100) {
    return {
      shouldIngest: false,
      reason: "Short exchange with no meaningful signal",
      category: "other",
    }
  }

  // Default: ingest (fail-OPEN)
  return {
    shouldIngest: true,
    reason: "Default: ingest for safety",
    category: "other",
  }
}
