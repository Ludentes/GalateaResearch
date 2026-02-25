import { getSignalConfig } from "../engine/config"
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
  remember: /@remember\b/i,
  forget: /@forget\b/i,
  preference:
    /\b(i (prefer|like|want|love|hate|dislike|always|never|usually))\b/i,
  correction:
    /\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i,
  policy:
    /\b(we (always|never|should|must|don'?t)|our (standard|convention|policy|rule))\b/i,
  imperative_rule:
    /(?:^|[.!?]\s+)(never|always|don'?t|do not|must not|must)\b/i,
  decision:
    /\b(let'?s (go with|use|choose|pick)|i'?ve decided|we'?ll use|the decision is)\b/i,
  procedure: /(?:^|\n)\s*1[.)]\s.+(?:\n\s*2[.)]\s)/i,
}

export function classifyTurn(turn: TranscriptTurn): SignalClassification {
  const cfg = getSignalConfig()

  if (turn.role !== "user") {
    return { type: "noise", confidence: 1.0 }
  }

  const text = turn.content.trim()
  if (!text) {
    return { type: "noise", confidence: 1.0 }
  }

  // Check noise — only for short messages (greetings in long messages lose to signal)
  if (NOISE_PATTERNS.greeting.test(text) && text.length < cfg.greeting_max_length) {
    return { type: "noise", pattern: "greeting", confidence: cfg.noise_confidence }
  }
  if (NOISE_PATTERNS.confirmation.test(text)) {
    return { type: "noise", pattern: "confirmation", confidence: cfg.noise_confidence }
  }

  // Check signal patterns (first match wins, order matters)
  for (const [type, regex] of Object.entries(SIGNAL_PATTERNS)) {
    const m = regex.exec(text)
    if (m) {
      return {
        type: type as SignalType,
        pattern: type,
        confidence: cfg.signal_confidence,
        match: m[0],
        matchIndex: m.index,
      }
    }
  }

  // Fallback: substantial messages may contain facts
  if (text.length > cfg.factual_min_length) {
    return { type: "factual", confidence: cfg.factual_confidence }
  }

  return { type: "noise", confidence: cfg.default_noise_confidence }
}

export function filterSignalTurns(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.filter((turn) => classifyTurn(turn).type !== "noise")
}
