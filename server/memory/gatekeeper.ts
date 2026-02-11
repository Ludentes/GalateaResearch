// =============================================================================
// v1 Memory Gatekeeper — REMOVED in v2 cleanup (2026-02-11)
// =============================================================================
//
// What lived here:
//   Pattern-based classification of conversation turns for ingestion.
//   Pure function, no I/O, no LLM calls. Fail-OPEN policy.
//
// Preserved patterns (useful for v2 shadow learning extraction):
//
//   GREETING:     /^(hi|hello|hey|good (morning|afternoon|evening)|howdy|sup|what'?s up)\b/i
//   CONFIRMATION: /^(ok|okay|k|got it|sure|thanks|thank you|ty|great|yes|no|yep|nope|alright|understood|roger|ack|cool|nice)\s*[.!?]?$/i
//   PREFERENCE:   /\b(i (prefer|like|want|love|hate|dislike|always|never|usually))\b/i
//   CORRECTION:   /\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i
//   POLICY:       /\b(we (always|never|should|must)|our (standard|convention|policy|rule)|don'?t (ever|use))\b/i
//   DECISION:     /\b(let'?s (go with|use|choose|pick)|i'?ve decided|we'?ll use|the decision is)\b/i
//
// v2 plan:
//   Pattern matching is part of the shadow learning extraction pipeline.
//   These patterns identify signal (preferences, corrections, policies)
//   vs noise (greetings, confirmations) in session transcripts.
//   See: docs/plans/2026-02-11-shadow-learning-experiment.md
// =============================================================================

export {}
