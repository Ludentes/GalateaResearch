# Cognitive Models Design

**Date:** 2026-02-12
**Status:** Implemented (Phase C) — views over knowledge store
**Supersedes:** Cognitive Models section in `docs/PSYCHOLOGICAL_ARCHITECTURE.md`
**Implementation:** `server/memory/types.ts`, `server/memory/knowledge-store.ts`
**Tests:** `server/memory/__tests__/cognitive-models.test.ts`

---

## Design Decision

The original Psychological Architecture defined 4 cognitive models as separate TypeScript interfaces with dedicated storage. In v2, we chose a different approach:

**Models are views over the knowledge store, not separate data structures.**

Each `KnowledgeEntry` has an optional `about` field that tags the subject. A model is constructed by filtering entries.

### Why Views, Not Structures?

| Concern | Separate Structures | Views Over Store |
|---------|--------------------|--------------------|
| Storage | 5 files (user.json, domain.json...) | 1 file (entries.jsonl) |
| Extraction | Separate extraction per model | Single extraction tags `about` |
| Consistency | Models can drift from facts | Models ARE the facts |
| Querying | Load specific model file | Filter by `about.type` |
| Lifecycle | Each model needs decay/consolidation | Standard entry lifecycle |
| Schema evolution | Add fields to each interface | Add fields once to KnowledgeEntry |

**Key insight:** A "User Model for Alina" is just the set of all things we know about Alina. There's no value in duplicating that into a separate `UserModel` object — it would just be a cached query result.

**Escape hatch:** If we later need materialized model objects (e.g., for caching, for LLM prompt construction), we can build them from the store. The `about` field preserves enough information. Zero information loss.

---

## The `about` Field

```typescript
export interface KnowledgeAbout {
  entity: string             // "alina", "paul", "umka", "mobile-dev"
  type: KnowledgeSubjectType // "user" | "project" | "agent" | "domain" | "team"
}

export interface KnowledgeEntry {
  // ... existing fields ...
  about?: KnowledgeAbout     // omit = project-scoped (default)
}
```

### Subject Types

| Type | What It Represents | Examples |
|------|-------------------|----------|
| `user` | A specific person | Alina, Paul, the developer |
| `project` | The codebase/product | Umka, Galatea (default when `about` omitted) |
| `agent` | The AI agent itself | Galatea agent capabilities, limitations |
| `domain` | Problem space / technology | Payload CMS specifics, IoT constraints |
| `team` | Team dynamics | Communication norms, language, processes |

### Predicate Structure

Each entry is implicitly a predicate triple:

```
subject(about.entity) → predicate(type + content) → object(content details)
```

Examples:
```
alina     → fact      → "lacks understanding of IoT concepts"
alina     → procedure → "create a quiz to verify understanding"
umka-team → fact      → "speaks Russian, docs should be in Russian"
developer → preference→ "runs infra from Docker, app logic via pnpm dev"
(project) → rule      → "MQTT client must persist across hot reloads"
(project) → decision  → "ContentPackage has 1:1 relationship with Kiosks"
```

### Omission Convention

When `about` is omitted, the entry is about the **current project**. This is the most common case (~95% of entries). Only tag `about` when the knowledge is about a specific person, team, domain, or the agent itself.

---

## The Five Models

### 1. User Model

**Query:** `entriesByEntity(entries, "alina")`

**What it captures:**
- Personal preferences (communication style, tool choices)
- Expertise level (what they know, don't know)
- Working patterns (when they're available, how they give feedback)
- Role-specific context (stakeholder, developer, PM)

**Real example (Umka — Alina):**
```
[fact]      Alina lacks understanding of technical IoT concepts
[decision]  Presentation simplified for Alina (can present, not go into detail)
[procedure] Create handoff document explaining reading order and priorities
[procedure] Create quiz (5-7 questions) to verify she read the docs
[decision]  Alina needs a technical glossary for IoT terms
```

This tells the agent: "Alina is non-technical. Simplify. Verify comprehension."

**Real example (Umka — developer):**
```
[preference] Runs infra via Docker Compose, app logic via pnpm dev
[preference] Dislikes hardcoded demo content — wants full sync flow
[preference] Wants fully documented project that works under high uncertainty
```

This tells the agent: "Developer values documentation, real demos, Docker+local hybrid."

### 2. Team Model

**Query:** `entriesBySubjectType(entries, "team")`

**What it captures:**
- Communication norms (language, channels, frequency)
- Decision-making patterns (who decides what)
- Shared conventions (naming, processes)

**Real example (Umka):**
```
[fact]     Team speaks Russian — all docs should be in Russian
[decision] Team will use Payload CMS native dashboard widgets (not Grafana)
[fact]     Tech docs are thoughts and ideas — team needs to decide format
```

This tells the agent: "Write docs in Russian. Don't introduce Grafana. Docs need structure."

### 3. Project Model

**Query:** `entriesBySubjectType(entries, "project")`

**What it captures:**
- Architecture decisions (tech stack, data model, integrations)
- Constraints (deadlines, scope, budget)
- Conventions (package manager, scaffolding, coding standards)

This is the **default** — entries without `about` are project-scoped. ~95% of all entries.

**Real example (Umka, top entries):**
```
[preference] Package Manager: Use pnpm
[decision]   ContentPackage has 1:1 relationship with Kiosks
[rule]       MQTT client must persist across Next.js hot reloads
[fact]       Primary client is ALROSA museum, ~15-18 kiosks
[correction] Seed script must load .env to access secret key
```

### 4. Domain Model

**Query:** `entriesBySubjectType(entries, "domain")`

**What it captures:**
- Technology-specific constraints (not project-specific, but general to the tech)
- Best practices for a technology or problem space
- Pitfalls and gotchas that apply beyond this project

**When to use `domain` vs `project`:**
- "Our MQTT broker runs on port 1883" → **project** (specific to our setup)
- "MQTT WebSocket connections use port 9001 (Mosquitto standard)" → **domain** (general Mosquitto knowledge)

### 5. Agent Model (Self)

**Query:** `entriesBySubjectType(entries, "agent")`

**What it captures:**
- What the agent is good/bad at (learned from corrections)
- Capabilities and limitations
- Operational preferences

**Not yet populated** — will emerge as the agent learns from its own mistakes.

**Future example:**
```
[correction] Agent incorrectly assumed M:N relationship — check with user first
[fact]       Agent is unreliable with date calculations
[preference] Agent should ask before making architecture decisions
```

### 6. Relationship Model (Derived)

**Not stored as entries.** Derived from session metadata:

```typescript
interface RelationshipView {
  entity: string              // "alina"
  firstSeen: Date             // earliest entry.extractedAt
  entryCount: number          // entries.length
  lastSeen: Date              // latest entry.extractedAt
  types: KnowledgeType[]      // unique entry types we have about them
}
```

This is computed on demand, not stored. When we need trust levels or relationship phases, we can add entries:
```
[fact] about:{entity:"alina", type:"user"} → "Alina has been responsive and provides clear feedback"
```

---

## Query API

```typescript
import {
  entriesBySubjectType,
  entriesByEntity,
  distinctEntities,
} from "./knowledge-store"

// Build User Model for Alina
const alinaModel = entriesByEntity(entries, "alina")

// List all known users
const users = distinctEntities(entries, "user")
// → ["alina", "developer"]

// Get all team knowledge
const teamModel = entriesBySubjectType(entries, "team")

// Get project knowledge (entries without about + explicit project)
const projectModel = entriesBySubjectType(entries, "project")
```

---

## Extraction: How `about` Gets Tagged

The extraction prompt (`server/memory/knowledge-extractor.ts`) instructs the LLM:

```
Subject tagging (about field):
- Tag WHO or WHAT the knowledge is about
- "Mary prefers Discord" → about: {entity: "mary", type: "user"}
- "Never push to main" → omit (project default)
- "Mobile apps need offline support" → about: {entity: "mobile-dev", type: "domain"}
- Use the person's first name (lowercase) as entity
- When a user states a personal preference, tag it as about that user
```

### Entity Naming Convention

| Convention | Example | Why |
|-----------|---------|-----|
| First name, lowercase | `alina`, `paul` | Simple, human-readable |
| Project name, lowercase | `umka`, `galatea` | Matches project identifier |
| Team with project prefix | `umka-team` | Distinguishes teams across projects |
| Domain as slug | `payload-cms`, `mobile-dev` | Technology/domain identifier |
| `developer` (special) | First-person preferences | When user says "I prefer..." |

### Ambiguity Rules

- If unclear who the subject is → omit `about` (project default)
- "We prefer pnpm" → project preference (no specific person)
- "I prefer pnpm" → `about: {entity: "developer", type: "user"}` (first person)
- "Alina prefers simple docs" → `about: {entity: "alina", type: "user"}`

---

## Lifecycle: How Models Change Over Time

Models inherit the lifecycle of their underlying entries:

| Lifecycle Event | What Happens to Models |
|----------------|----------------------|
| **New extraction** | New entries may add to any model |
| **Confidence decay** (Phase D) | Old entries decay → model "forgets" stale knowledge |
| **Consolidation** (Phase D) | High-confidence entries promoted to CLAUDE.md |
| **Supersession** | Entry replaced → model view automatically uses newer entry |
| **Entity merge** | If "Alina" and "alina_pm" are the same → rename entity |

### Model-Specific Considerations

**User Model decay:**
- Person-specific knowledge decays if the person leaves the team
- Preferences are more stable than situational facts
- "Alina doesn't know IoT" might become false after she learns

**Team Model evolution:**
- Team norms can change ("we switched from Russian to English docs")
- New entries with higher confidence supersede old ones

**Domain Model stability:**
- Domain knowledge is the most stable (tech constraints rarely change)
- Exception: library updates (Payload CMS 3.0 → 4.0 changes behavior)
- This is where `valid_until` metadata (Phase D) matters most

---

## Evaluation: Umka Baseline

The cognitive models test suite (`server/memory/__tests__/cognitive-models.test.ts`) defines expected classifications for 8 real Umka entries:

| Entry | Expected `about` |
|-------|-----------------|
| "Alina lacks understanding of IoT concepts" | `{entity: "alina", type: "user"}` |
| "Presentation for Alina simplified" | `{entity: "alina", type: "user"}` |
| "Team speaks Russian, docs in Russian" | `{entity: "umka-team", type: "team"}` |
| "Package Manager: Use pnpm" | omitted (project default) |
| "ContentPackage 1:1 with Kiosks" | omitted (project default) |
| "Admin panel in Russian (MVP)" | `{entity: "umka", type: "project"}` |
| "MQTT must persist across hot reloads" | `{entity: "payload-cms", type: "domain"}` |
| "Infra via Docker, app via pnpm dev" | `{entity: "developer", type: "user"}` |

These serve as the evaluation baseline for extraction prompt quality.

### Coverage in Umka Data (259 entries)

Estimated distribution with correct tagging:

| Model | Estimated Entries | % |
|-------|------------------|---|
| Project (default) | ~248 | 96% |
| User (alina) | ~5 | 2% |
| User (developer) | ~3 | 1% |
| Team | ~3 | 1% |
| Domain | TBD | <1% |
| Agent | 0 | 0% |

Most entries are project-scoped. The `about` field matters most for the ~5% that aren't — these are where model-specific context prevents mistakes (e.g., simplifying language for Alina).

---

## Future: Materialized Models

If we need materialized model objects (e.g., for prompt engineering, for caching), build them from the store:

```typescript
interface MaterializedUserModel {
  entity: string
  preferences: KnowledgeEntry[]   // type === "preference"
  facts: KnowledgeEntry[]         // type === "fact"
  corrections: KnowledgeEntry[]   // type === "correction"
  expertise: Record<string, number> // derived from facts
  lastSeen: Date                   // max(extractedAt)
}

function materializeUserModel(
  entries: KnowledgeEntry[],
  entity: string
): MaterializedUserModel {
  const userEntries = entriesByEntity(entries, entity)
  return {
    entity,
    preferences: userEntries.filter(e => e.type === "preference"),
    facts: userEntries.filter(e => e.type === "fact"),
    corrections: userEntries.filter(e => e.type === "correction"),
    expertise: {}, // TODO: derive from facts
    lastSeen: new Date(Math.max(
      ...userEntries.map(e => new Date(e.extractedAt).getTime())
    )),
  }
}
```

This is NOT implemented yet. Build it when needed. The `about` field preserves all information needed to construct it.

---

## Mapping: Original Psych Arch → v2

| Original Psych Arch Field | v2 Equivalent |
|--------------------------|---------------|
| `SelfModel.identity` | Preprompts (`data/preprompts/`) |
| `SelfModel.capabilities` | `entriesBySubjectType(entries, "agent")` |
| `SelfModel.available_models` | Config (not learned) |
| `SelfModel.current_state` | `AgentContext` (ephemeral) |
| `UserModel.theories` | `entriesByEntity(entries, "alina")` where type is `fact` |
| `UserModel.preferences` | `entriesByEntity(entries, "alina")` where type is `preference` |
| `UserModel.expertise` | Derived from facts (future) |
| `DomainModel.characteristics` | `entriesBySubjectType(entries, "domain")` |
| `DomainModel.behavior_rules` | `entriesBySubjectType(entries, "domain")` where type is `rule` |
| `RelationshipModel.history` | Derived from session metadata |
| `RelationshipModel.trust_level` | Not tracked (future: derive from interaction patterns) |

---

*Design Created: 2026-02-12*
*Based on: PSYCHOLOGICAL_ARCHITECTURE.md cognitive models + Umka extraction data*
*Implementation: server/memory/types.ts (about field), server/memory/knowledge-store.ts (query functions)*
