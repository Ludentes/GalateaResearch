import type { SignalClassification, SignalType, TranscriptTurn } from "./types"

/**
 * Pattern-based signal classification for conversation turns.
 *
 * Patterns preserved from v1 gatekeeper (server/memory/gatekeeper.ts).
 * Used as pre-filter before LLM extraction to reduce noise and cost.
 */

const NOISE_PATTERNS: Record<string, RegExp> = {
  greeting:
    /^(hi|hello|hey|good (morning|afternoon|evening)|howdy|sup|what'?s up)\b/i,
  confirmation:
    /^(ok|okay|k|got it|sure|thanks|thank you|ty|great|yes|no|yep|nope|alright|understood|roger|ack|cool|nice)\s*[.!?]?$/i,
}

const SIGNAL_PATTERNS: Record<string, RegExp> = {
  preference:
    /\b(i (prefer|like|want|love|hate|dislike|always|never|usually))\b/i,
  correction:
    /\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i,
  policy:
    /\b(we (always|never|should|must)|our (standard|convention|policy|rule)|don'?t (ever|use))\b/i,
  decision:
    /\b(let'?s (go with|use|choose|pick)|i'?ve decided|we'?ll use|the decision is)\b/i,
}

export function classifyTurn(turn: TranscriptTurn): SignalClassification {
  if (turn.role !== "user") {
    return { type: "noise", confidence: 1.0 }
  }

  const text = turn.content.trim()
  if (!text) {
    return { type: "noise", confidence: 1.0 }
  }

  // Check noise — only for short messages (greetings in long messages lose to signal)
  if (NOISE_PATTERNS.greeting.test(text) && text.length < 30) {
    return { type: "noise", pattern: "greeting", confidence: 0.95 }
  }
  if (NOISE_PATTERNS.confirmation.test(text)) {
    return { type: "noise", pattern: "confirmation", confidence: 0.95 }
  }

  // Check signal patterns (order: preference > correction > policy > decision)
  for (const [type, regex] of Object.entries(SIGNAL_PATTERNS)) {
    if (regex.test(text)) {
      return { type: type as SignalType, pattern: type, confidence: 0.8 }
    }
  }

  // Fallback: substantial messages may contain facts
  if (text.length > 50) {
    return { type: "factual", confidence: 0.5 }
  }

  return { type: "noise", confidence: 0.6 }
}

export function filterSignalTurns(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.filter((turn) => classifyTurn(turn).type !== "noise")
}
