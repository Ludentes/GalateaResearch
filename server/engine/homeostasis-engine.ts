// =============================================================================
// v1 Homeostasis Engine — REMOVED in v2 cleanup (2026-02-11)
// =============================================================================
//
// What lived here:
//   Class-based engine that assessed 6 psychological dimensions:
//   - knowledge_sufficiency, certainty_alignment, progress_momentum
//   - communication_health, productive_engagement, knowledge_application
//   Each dimension: LOW | HEALTHY | HIGH
//   Assessment methods: computed (rule-based) and LLM
//   Guidance system loaded from guidance.yaml
//
// v2 plan:
//   Homeostasis becomes a Claude Code SKILL.md, not a DB-backed engine.
//   The observation service fires heartbeats; the skill evaluates dimensions.
//   See: docs/plans/2026-02-11-galatea-v2-architecture-design.md
//   See: server/engine/types.ts (preserved) for dimension type definitions
//   See: server/engine/guidance.yaml (preserved) for guidance text reference
// =============================================================================

export {}
