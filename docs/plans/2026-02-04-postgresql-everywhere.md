# Decision: PostgreSQL Everywhere (Drop SQLite)

**Date**: 2026-02-04
**Status**: Accepted
**Supersedes**: SQLite for local dev in `2026-02-03-system-architecture-tanstack.md`

---

## Context

The previous architecture specified SQLite for local development and PostgreSQL for production, with Drizzle ORM abstracting between them. This decision replaces that split with PostgreSQL in all environments.

## Decision

Use PostgreSQL as the only relational database, in all environments. SQLite is removed from the stack entirely.

## Rationale

**Migration parity is the deciding factor.** Drizzle abstracts the query layer but not DDL semantics. Migrations that pass on SQLite can fail on PostgreSQL (different type systems, constraint handling, ALTER TABLE behavior). Debugging these differences hits at deployment time — the worst possible moment.

**Docker is already required.** The local dev stack needs FalkorDB and Mosquitto in containers. Adding a Postgres container is one more `image:` line in docker-compose.yml, not a new category of complexity.

**The relational layer is simple.** Our Drizzle tables store sessions, messages, homeostasis state, personas, preprompts, and observations. This is structured config and event logs — not the interesting database. The heavy lifting (memory graph, semantic search, temporal reasoning) lives in FalkorDB/Graphiti. PostgreSQL handles the boring stuff reliably.

**What we gain:**
- One Drizzle dialect (`pg`), one migration path, zero compatibility surprises
- True dev/prod parity
- `JSONB` available for flexible fields (thresholds, persona config) if needed
- Simpler CI — same database in tests and production

**What we lose:**
- Nothing meaningful. SQLite's only advantage was zero-config local dev, and we already require Docker Compose for infrastructure.

## Local Development Model

**App runs on host. Infrastructure runs in Docker Compose.**

```
Host (macOS/Linux)
├── TanStack Start dev server (pnpm dev)
├── Connects to localhost ports
│
Docker Compose
├── postgres:17          → localhost:5432
├── falkordb/falkordb    → localhost:6379
└── eclipse-mosquitto:2  → localhost:1883, :9001
```

This is a standard pattern: fast iteration on application code (HMR, debugger, native tooling), stable infrastructure in containers.

## Docker Compose Configuration

```yaml
services:
  postgres:
    image: postgres:17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: galatea
      POSTGRES_USER: galatea
      POSTGRES_PASSWORD: galatea
    volumes:
      - postgres_data:/var/lib/postgresql/data

  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  postgres_data:
  falkordb_data:
```

## Environment Configuration

```bash
# Local development
DATABASE_URL=postgres://galatea:galatea@localhost:5432/galatea

# Production (same format, different credentials)
DATABASE_URL=postgres://user:password@prod-host:5432/galatea
```

Single format. No conditional logic. No dialect switching.

## Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",       // Always pg, never sqlite
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## What Changes From Previous Architecture

| Item | Before | After |
|------|--------|-------|
| Local DB | SQLite file (`galatea.db`) | PostgreSQL in Docker |
| Drizzle dialect | `sqlite` (local) / `pg` (prod) | `pg` always |
| Migrations | Two paths | One path |
| Docker requirement | FalkorDB + Mosquitto | + PostgreSQL |
| `.env.local` DATABASE_URL | `file:./galatea.db` | `postgres://...localhost...` |

## Deployment

All deployment targets use Docker Compose (or equivalent orchestration). The same `docker-compose.yml` structure applies, with production credentials and volumes swapped in via environment variables or overrides.

---

*Decision made: 2026-02-04*
*Participants: User + Claude*
