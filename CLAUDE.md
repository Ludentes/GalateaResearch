# Galatea

Homeostasis-based AI agent system. TanStack Start v1, AI SDK v6, Drizzle ORM, PostgreSQL, FalkorDB.

## Key Files

- `docs/ARCHITECTURE.md` — system architecture and implementation status
- `docs/plans/2026-03-11-beta-simulation-design.md` — current design direction
- `server/engine/config.yaml` — all thresholds and strategies

## Conventions

- Biome: double quotes, no semicolons, 2-space indent, 80 char width
- Vitest 4 with `// @vitest-environment node` directive
- pnpm package manager
- Dev server: port 13000, PostgreSQL: 15432, FalkorDB: 16379

## Shadow Learning

This project uses shadow learning. Learned patterns and entity context are stored in the auto memory directory.

Before work that involves judgment (reviews, architecture, writing):
- Read `patterns/*.md` files in the memory directory for domain-specific rules
- Read `entities/*.md` files for context about people, services, or systems
- Read `docs/playbooks/*.md` in the project repo for repeatable procedures

When the user corrects you, note the correction explicitly — it will be extracted later.
