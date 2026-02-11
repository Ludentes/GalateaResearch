// =============================================================================
// v1 Activity Router — REMOVED in v2 cleanup (2026-02-11)
// =============================================================================
//
// What lived here:
//   Classified tasks into activity levels (0-3):
//   - Level 0: Direct execution (no LLM)
//   - Level 1: Pattern-based (cheap model, Haiku)
//   - Level 2: Reasoning (capable model, Sonnet)
//   - Level 3: Deep reflection (Reflexion Loop)
//   Used task flags (isHighStakes, isIrreversible, hasKnowledgeGap)
//   and homeostasis state to route.
//
// v2 plan:
//   Activity routing will be handled by the heartbeat scheduler in the
//   observation service. The observation service decides WHEN to act;
//   the Claude Code agent (guided by skills) decides WHAT to do.
//   See: docs/plans/2026-02-11-galatea-v2-architecture-design.md
//   See: server/engine/types.ts (preserved) for ActivityLevel, Task types
// =============================================================================

export {}
