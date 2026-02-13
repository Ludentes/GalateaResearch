# Domain Model: Real-World Context for Traces

**Date:** 2026-02-13
**Status:** In Progress
**Purpose:** Document the real projects, users, and data available on this machine for grounding end-to-end traces in reality.

---

## Projects on This Machine

| Project | Sessions | Character | Primary Work |
|---------|----------|-----------|-------------|
| **Umka** | 32 | Content-heavy | Museum kiosk, Payload CMS, MQTT IoT, some game dev |
| **ContextForge** (ContextForgeTS) | 92 | Dev-heavy | Context window management, Claude Code provider, zone-based caching, compression, skill system |
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
| MQTT | Umka | High |
| Payload CMS | Umka | High |
| Claude Code | ContextForge, Galatea | High |
| Vercel AI SDK | Galatea, ContextForge | High |
| Convex | ContextForge | High |
| Ollama | Galatea, ContextForge | High |
| React / TanStack | Galatea, ContextForge | Medium |
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

### ContextForge (not yet extracted, see `docs/research/contextforgets-analysis.md`)

92 sessions available. Project is a context window management app (Convex + React 19) with:
- **Claude Code as LLM provider** via `@anthropic-ai/claude-agent-sdk` (subprocess, DB-backed streaming)
- **Zone-based prompt caching** (PERMANENT → STABLE → WORKING, 50-90% cost savings)
- **LLM-based compression** (semantic/structural/statistical, quality-gated)
- **Skill system** (SKILL.md parser, import from local/URL/ZIP, export)
- **Token budgets** (per-zone limits, visual warnings at 80%/95%)
- **Multi-provider** (Ollama, Claude Code, OpenRouter — three different streaming patterns)

Expected extraction density:
- TypeScript patterns and decisions
- Claude Code provider implementation details
- Convex real-time architecture decisions
- Context assembly and caching strategies
- Compression quality control approaches

**Key divergence from Galatea:** ContextForge is a tool for humans to manage LLM context. Galatea is an agent that manages its own context. ContextForge optimizes human-LLM interaction; Galatea optimizes agent self-regulation.

**Reusable for Galatea:** Zone-based caching (when switching to Claude/OpenRouter primary), compression for sliding window, SKILL.md parser for Phase D auto-generation, token budget approach for T5 gap.

### Galatea (not yet extracted)

37 sessions available. Meta-knowledge:
- Architecture decisions (homeostasis, memory, v2 redesign)
- Process preferences (research-first, YAGNI, conventional commits)
- Tool preferences (pnpm, shadcn/ui, vitest)

## LLM Provider Strategy

**Intended design:** Ollama for small tasks (extraction, guard/jailbreak), configurable primary LLM (Claude/ChatGPT via OpenRouter) for main thinking.

**Current state:**
- Chat: Multi-provider via `getModel("ollama" | "openrouter" | "claude-code", modelId)` — per-request overrides already work
- Extraction: Hardcoded to Ollama in `server/routes/api/extract.post.ts` — uses same `LanguageModel` interface, ~10 lines to make configurable
- All three providers installed: `ai-sdk-ollama`, `@openrouter/ai-sdk-provider`, `ai-sdk-provider-claude-code`

**Gap:** Small. Extraction route needs to use `getModel()` factory instead of hardcoding `createOllamaModel()`. Add `EXTRACTION_PROVIDER` env var. Everything downstream (extraction pipeline, knowledge extractor) is already provider-agnostic.

**ContextForge validates this split:** Uses Claude Code for thinking/compression, could use Ollama for lightweight tasks. Patterns are compatible.

---

## Cross-Project Knowledge Challenges

### Entity Ambiguity
- "TypeScript" appears everywhere — need project scoping
- "the agent" could mean Galatea itself or a ContextForge agent
- "context" could mean LLM context window (ContextForge) or agent context (Galatea)
- "streaming" has different implementations per project (HTTP vs DB-backed vs SSE)

### Resolution via `about` field
```
about: {entity: "umka", type: "project"}       # Umka-specific MQTT
about: {entity: "contextforge", type: "project"} # ContextForge-specific context assembly
about: {entity: "typescript", type: "domain"}    # General TypeScript knowledge
```

### Open Question
When user says "context assembly needs caching" in a Galatea session:
1. Should we retrieve ContextForge's caching knowledge too? (cross-pollination)
2. Or only Galatea-tagged entries? (strict scoping)
3. Or domain-tagged entries + project-tagged entries? (hybrid)

**Recommendation:** Hybrid. Retrieve:
- All entries with `about.entity = "contextforge"`
- All entries with `about.type = "domain"` matching message entities
- Umka entries only if explicitly cross-referenced or high confidence

This is a retrieval/relevance problem for Phase D's fact retrieval implementation.
