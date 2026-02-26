import { getSignalConfig } from "../engine/config"
import { stripIdeWrappers } from "./transcript-reader"
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

/**
 * For "I always/never/usually X", verify X is a meaningful action verb.
 * Rejects incomplete/nonsensical phrases like "I always scare of".
 */
const HABIT_VERB_RE =
  /\bi\s+(always|never|usually)\s+(use|prefer|run|write|do|build|deploy|test|check|lint|commit|push|pull|start|want|make|put|set|add|avoid|skip|keep|install|create|go|have|try|work|format|review|require)\b/i

const SIGNAL_PATTERNS: Record<string, RegExp> = {
  remember: /@remember\b/i,
  forget: /@forget\b/i,
  preference:
    /(?<!\bif\s)\b(i (prefer|like|want|love|hate|dislike|always|never|usually))\b/i,
  correction:
    /\b(no,?\s+(that'?s|it'?s|i meant|actually)|not what i|i said)\b|\bincorrect,/i,
  policy:
    /\b(we (always|never|should|must|don'?t)|our (standard|convention|policy|rule))\b/i,
  imperative_rule:
    /(?:^|[.!?,;:]\s+)(never|always|don'?t|do not|must not|must)\b/i,
  decision:
    /\b(let'?s (go with|use|choose|pick)|i'?ve decided|we'?ll use|the decision is)\b/i,
  // Lettered option selection (answering assistant's structured question)
  option_selection: /^\s*[a-dA-D][.)]\s+\S/m,
  // Constraint specification (limits, caps, thresholds with numbers)
  constraint: /\b(max|min|limit|cap|threshold|maximum|minimum)\b.*\d+/i,
  procedure: /(?:^|\n)\s*1[.)]\s.+(?:\n\s*2[.)]\s)/i,
}

export function classifyTurn(turn: TranscriptTurn): SignalClassification {
  const cfg = getSignalConfig()

  if (turn.role !== "user") {
    return { type: "noise", confidence: 1.0 }
  }

  const text = stripIdeWrappers(turn.content)
  if (!text) {
    return { type: "noise", pattern: "ide-empty", confidence: 1.0 }
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
      // Questions with signal patterns are usually asking, not stating
      // Exception: @remember and @forget are always intentional
      // Scope check to the sentence containing the match, not the full text
      if (type !== "remember" && type !== "forget") {
        const matchStart = m.index ?? 0
        const matchEnd = matchStart + m[0].length

        // Find the sentence boundary after the match
        const afterMatch = text.slice(matchEnd)
        const sentenceEndMatch = afterMatch.match(/[.!?]/)
        const sentenceEnd = sentenceEndMatch
          ? matchEnd + (sentenceEndMatch.index ?? 0) + 1
          : text.length

        // Extract the sentence containing the match
        const sentenceBeforeStart = text.lastIndexOf(".", matchStart - 1)
        const sentenceStart =
          sentenceBeforeStart >= 0 ? sentenceBeforeStart + 1 : 0
        const matchedSentence = text.slice(sentenceStart, sentenceEnd).trim()

        if (/\?\s*$/.test(matchedSentence)) {
          continue
        }
      }

      // For "I always/never/usually X", require X to be a known action verb
      if (type === "preference" && /\bi\s+(always|never|usually)\b/i.test(m[0])) {
        if (!HABIT_VERB_RE.test(text)) {
          continue
        }
      }

      // Map option_selection and constraint to decision type
      const effectiveType =
        type === "option_selection" || type === "constraint"
          ? "decision"
          : type

      return {
        type: effectiveType as SignalType,
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
