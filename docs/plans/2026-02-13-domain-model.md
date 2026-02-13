# Domain Model: Real-World Context for Traces

**Date:** 2026-02-13
**Status:** In Progress
**Purpose:** Document the real projects, users, and data available on this machine for grounding end-to-end traces in reality.

---

## Projects on This Machine

| Project | Sessions | Character | Primary Work |
|---------|----------|-----------|-------------|
| **Umka** | 32 | Content-heavy | Museum kiosk, Payload CMS, MQTT IoT, some game dev |
| **ContextForge** (ContextForgeTS) | 92 | Dev-heavy | TypeScript library, Claude Code as LLM provider, structured output |
| **Galatea** | 37 | Meta | Agent developing itself, homeostasis, memory, extraction |
| **telejobs** | ~5 | Backend | Telegram bot, Poetry/Python processing service |
| **mygamebook** (games-with-llms) | ~3 | Experimental | LLM-powered game narratives |
| **Umka-game** | ~3 | Game dev | Game mechanics for museum kiosk |
| **CV** | — | EXCLUDED | Personal, avoid in traces |
| **Expo** (planned) | 0 | Future test | Will add as test data for multi-project scenarios |

### Session Data Locations

```
~/.claude/projects/-home-newub-w-Umka/                          # 32 sessions
~/.claude/projects/-home-newub-w-ContextLibrary-ContextForgeTS/  # 92 sessions
~/.claude/projects/-home-newub-w-galatea/                        # 37 sessions
~/.claude/projects/-home-newub-w-telejobs/                       # ~5 sessions
~/.claude/projects/-home-newub-w-mygamebook-games-with-llms/     # ~3 sessions
~/.claude/projects/-home-newub-w-Umka-game/                      # ~3 sessions
```

## People

| Person | Role | Known Preferences | Projects |
|--------|------|-------------------|----------|
| **User (developer)** | Primary user, architect | pnpm, conventional commits, research-first, terse instructions | All |
| **Alina** | PM / stakeholder | Lacks IoT understanding, needs step-by-step guides | Umka |
| **Students** | Safety research | Working on safety subsystems separately | Galatea (indirectly) |

## Key Technologies Across Projects

| Technology | Projects | Knowledge Density |
|-----------|----------|------------------|
| TypeScript | All | Very High |
| MQTT | Umka, ContextForge | High |
| Payload CMS | Umka | High |
| Claude Code | ContextForge, Galatea | High |
| Vercel AI SDK | Galatea, ContextForge | High |
| Ollama | Galatea | High |
| React / TanStack | Galatea | Medium |
| Drizzle ORM | Galatea | Medium |
| PostgreSQL | Galatea, Umka | Medium |
| Docker | Galatea, Umka | Medium |
| Python / Poetry | telejobs | Low |
| Expo / React Native | (planned) | None yet |

## Extracted Knowledge (Current State)

### Umka (259 entries from session:64d737f3)

Breakdown by type:
- 86 facts
- 85 decisions
- 49 procedures
- 17 preferences
- 12 rules
- 10 corrections

Notable entries (samples):
- `[fact, 0.95]` ContentPackage has 1:1 relationship with Kiosks
- `[rule, 1.0]` Seed script must load .env for PAYLOAD_SECRET
- `[preference, 0.9]` Use collection-level hooks instead of field-level hooks
- `[procedure, 0.85]` MQTT message handling: parse JSON, validate schema, update state
- `[decision, 0.9]` Chose Payload CMS over Strapi for content management

### ContextForge (not yet extracted)

92 sessions available. Expected high density of:
- TypeScript patterns and decisions
- Claude Code provider implementation details
- Structured output / schema design decisions
- Library architecture decisions

### Galatea (not yet extracted)

37 sessions available. Meta-knowledge:
- Architecture decisions (homeostasis, memory, v2 redesign)
- Process preferences (research-first, YAGNI, conventional commits)
- Tool preferences (pnpm, shadcn/ui, vitest)

## Cross-Project Knowledge Challenges

### Entity Ambiguity
- "MQTT" appears in both Umka and ContextForge — different contexts
- "TypeScript" appears everywhere — need project scoping
- "the agent" could mean Galatea itself or a ContextForge agent

### Resolution via `about` field
```
about: {entity: "umka", type: "project"}       # Umka-specific MQTT
about: {entity: "contextforge", type: "project"} # ContextForge-specific MQTT
about: {entity: "mqtt", type: "domain"}          # General MQTT knowledge
```

### Open Question
When user says "MQTT client needs to persist" in a ContextForge session:
1. Should we retrieve Umka's MQTT knowledge too? (cross-pollination)
2. Or only ContextForge-tagged entries? (strict scoping)
3. Or domain-tagged "mqtt" entries + project-tagged entries? (hybrid)

**Recommendation:** Hybrid. Retrieve:
- All entries with `about.entity = "contextforge"`
- All entries with `about.type = "domain"` matching message entities
- Umka entries only if explicitly cross-referenced or high confidence

This is a retrieval/relevance problem for Phase D's fact retrieval implementation.
