# Phase 2a Exploration Archive

**Archived:** 2026-02-07

These documents represent the Phase 2a exploration period where we:

1. Integrated Graphiti + FalkorDB as the memory backend
2. Benchmarked Graphiti's extraction quality (18-21% recall)
3. Benchmarked Mem0 as an alternative (similar issues)
4. Explored unified extraction approaches (pattern + LLM)
5. Designed pluggable extraction interfaces

**Key finding:** Graphiti/Mem0 extract only 18-21% of facts from conversations. This led to the decision to build our own extraction layer (pattern-based + pluggable LLM fallback) while keeping Graphiti for episodic storage and graph queries.

**What replaced these:** The comprehensive Phase 2 plan (`~/.claude/plans/snappy-crafting-unicorn.md`) incorporates the useful ideas from these documents into a complete memory layer design.

## Directory Structure

- `plans/` — Superseded Phase 2 design docs, progress reports, and testing plans
- `benchmarks/` — Graphiti and Mem0 benchmark results and comparisons
- `guides/` — Graphiti-specific operational guides (fork workflow, benchmark usage)
- Root — Memory browser docs (tied to old Graphiti browser UI)

## Documents Still Relevant (not archived)

- `docs/plans/2026-02-07-memory-lifecycle.md` — Complete memory lifecycle reference
- `docs/plans/2026-02-06-phase3-implementation-plan.md` — Phase 3 plan
- `docs/memory/GATEKEEPER.md` — Gatekeeper design (updated for Phase 2)
- `docs/KNOWN_GAPS.md` — Gap analysis for Phase 2 plan
