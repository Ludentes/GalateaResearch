// =============================================================================
// v1 Context Assembler — REMOVED in v2 cleanup (2026-02-11)
// =============================================================================
//
// What lived here:
//   Pipeline that assembled system prompts from multiple sources:
//   1. Preprompts (hard rules + procedures from DB)
//   2. Graphiti facts (semantic search, scored by recency + relevance)
//   3. Cognitive models (self-model + user-model from knowledge graph)
//   Token budget allocation across 5 priority sections:
//   - CONSTRAINTS (non-truncatable)
//   - RELEVANT PROCEDURES
//   - RELEVANT KNOWLEDGE
//   - SELF-AWARENESS
//   - USER CONTEXT
//
// v2 plan:
//   Context assembly will read from CLAUDE.md + SKILL.md files instead of
//   PostgreSQL tables and Graphiti. Preprompts may move to CLAUDE.md entries.
//   The token budget concept is still relevant for v2.
//   See: docs/plans/2026-02-11-galatea-v2-architecture-design.md
// =============================================================================

export {}
