# Galatea Psychological Architecture

**Date**: 2026-02-06 (Created) | 2026-02-13 (Reconciled with v2)
**Status**: Living document — reconciled with v2 architecture (Phase C)
**Thesis**: Psychological architecture (homeostasis + memory + models) + LLM > Plain LLM

**v2 reconciliation (2026-02-13):** Infrastructure changed (see below), but psychological foundations survive intact. Key changes:
- **Activity Router** → deprecated; ecosystem (Claude Code skills) handles task routing; L0-L4 pattern revived for homeostasis self-assessment
- **Graphiti/FalkorDB** → replaced by file-based JSONL knowledge store with Jaccard + embedding dedup
- **Cognitive Models** → not separate data structures; views over knowledge store via `KnowledgeEntry.about` field
- **Memory types** → unified into `KnowledgeEntry` with 6 types (fact, preference, rule, procedure, correction, decision)

See: [v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md), [Cognitive Models Design](plans/2026-02-12-cognitive-models-design.md), [ROADMAP](ROADMAP.md)

---

## Deferred: Safety Systems

> **NOTE**: Safety subsystems are being researched separately by students. This architecture assumes safety systems will be integrated later. The following are deferred:
>
> - **Safety Monitor** - Pre-screens all interactions
> - **Crisis Detector** - Suicide risk, psychosis indicators
> - **Reality Boundary Enforcer** - "I am not conscious" enforcement
> - **Dependency Prevention** - Session duration, emotional reliance tracking
> - **Intervention Orchestrator** - Coordinates escalation
>
> When integrating safety, it should wrap the entire system as a pre/post filter.

---

## Core Thesis

Current AI agents are **stimulus-response machines**:
```
prompt → LLM → response
```

Galatea adds **psychological architecture** between stimulus and response:
```
prompt → [Homeostasis + Memory + Models] → LLM → response
                      ↑
              continuous learning
```

Psychology has formalized human cognition for centuries. We apply these models to create agents with:
- **Persistence** (memory across sessions)
- **Understanding** (models of self, user, domain)
- **Self-Regulation** (homeostasis - maintaining balance across dimensions)
- **Growth** (learning from observation)

**Key insight**: Instead of building 12+ discrete subsystems (Curiosity Engine, Motivation Engine, etc.), we use **homeostasis** as the unifying principle. Drives emerge from dimension imbalances.

---

## Architecture Decision

After evaluating three approaches, we selected **homeostasis-based architecture**:

| Approach | Verdict |
|----------|---------|
| 12 Subsystems | Too complex, subsystems compete for context |
| Preprompts Only | Too brittle, no emergence, no psychological grounding |
| **Homeostasis-Based** | ✓ Balance of structure and emergence |

See [homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md) for full decision record.

---

## Architecture Overview

### v2 Architecture (Current)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GALATEA AGENT (v2)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              OBSERVATION LAYER (OTEL + Claude Code Hooks)           │   │
│  │  SessionEnd → auto-extract | UserPrompt/ToolUse → OTEL events      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              SHADOW LEARNING PIPELINE (Phase B)                     │   │
│  │  Transcript Reader → Signal Classifier → Knowledge Extractor       │   │
│  │  → Dedup (Jaccard + Embedding) → Knowledge Store (JSONL)           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  HOMEOSTASIS ENGINE (L0-L2)                         │   │
│  │  6 dimensions — balance drives behavior — guidance into prompt      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │   │
│  │  │ Knowledge  │ │ Certainty  │ │ Progress   │ │ Communic.  │       │   │
│  │  │Sufficiency │ │ Alignment  │ │ Momentum   │ │  Health    │       │   │
│  │  │   (L1)     │ │   (L2)     │ │   (L1)     │ │   (L1)     │       │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │   │
│  │  ┌────────────┐ ┌────────────┐                                      │   │
│  │  │Productive  │ │ Knowledge  │  L0=cache, L1=heuristic, L2=LLM     │   │
│  │  │Engagement  │ │Application │  See: ThinkingDepth pattern          │   │
│  │  │   (L1)     │ │   (L2)     │                                      │   │
│  │  └────────────┘ └────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                KNOWLEDGE STORE + COGNITIVE MODELS                    │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  KnowledgeEntry (JSONL) — unified type for all knowledge     │   │   │
│  │  │  Types: fact | preference | rule | procedure | correction |  │   │   │
│  │  │         decision                                             │   │   │
│  │  │  about?: {entity, type} — predicate-style subject tagging   │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │  Models are VIEWS over store:                                       │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐     │   │
│  │  │ User   │ │ Team   │ │Project │ │Domain  │ │    Agent     │     │   │
│  │  │ Model  │ │ Model  │ │ Model  │ │ Model  │ │    (Self)    │     │   │
│  │  │filter  │ │filter  │ │default │ │filter  │ │   filter     │     │   │
│  │  │by user │ │by team │ │no tag  │ │by dom  │ │  by agent    │     │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   CONTEXT ASSEMBLER                                  │   │
│  │  Preprompts + Knowledge + Homeostasis Guidance → System Prompt      │   │
│  │  Priority-based section ordering with token budget                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Task routing: handled by ecosystem (Claude Code skill progressive          │
│  disclosure). NOT a Galatea component. See: ThinkingDepth pattern.          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Original Architecture (Phase 3, deprecated)

<details>
<summary>Click to expand original Phase 3 architecture diagram</summary>

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GALATEA AGENT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     LAYER 0: ACTIVITY ROUTER                         │   │
│  │  Classifies task → Selects processing level → Routes appropriately   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ ┌────────────┐  │   │
│  │  │  Level 0    │  │  Level 1    │  │  Level 2    │ │  Level 3   │  │   │
│  │  │  (Direct)   │  │  (Pattern)  │  │  (Reason)   │ │ (Reflect)  │  │   │
│  │  │  No LLM     │  │  Haiku      │  │  Sonnet     │ │ Reflexion  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ... (Layers 1-3, Memory, Cognitive Models, Execution) ...                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

</details>

---

## Core: Homeostasis Engine

### The Key Insight

Instead of separate engines for curiosity, motivation, initiative, we define **dimensions of healthy functioning**. When a dimension is out of balance, the agent is guided to restore it.

- **Homeostasis says WHAT** to do (explore, communicate, escalate)
- **Memory provides HOW** (specific facts, procedures, context)
- **LLM reasons** about the specific action

### The Six Dimensions

| # | Dimension | Question | Psychological Root |
|---|-----------|----------|-------------------|
| 1 | Knowledge Sufficiency | "Do I know enough to proceed?" | Competence need |
| 2 | Certainty Alignment | "Does my confidence match my action?" | Self-awareness |
| 3 | Progress Momentum | "Am I moving forward?" | Achievement need |
| 4 | Communication Health | "Am I appropriately connected?" | Relatedness need |
| 5 | Productive Engagement | "Am I contributing value?" | Purpose need |
| 6 | Knowledge Application | "Am I balancing learning/doing?" | Learning balance |

### Dimension Detail

#### 1. Knowledge Sufficiency

**Spectrum:**
- **LOW**: Can't explain approach, guessing, memories don't match task
- **HEALTHY**: Can explain what and why, confident enough to proceed
- **HIGH**: N/A (but see Knowledge Application for over-research)

**When LOW - Guidance:**
> You need more knowledge before acting.
> Options: Retrieve memories → Research docs/codebase → Ask teammate → Ask PM
> Don't research forever - timebox then ask.

#### 2. Certainty Alignment

**Spectrum:**
- **LOW**: Uncertain but proceeding, making irreversible decisions while doubtful
- **HEALTHY**: Confidence matches stakes, ask when uncertain on important things
- **HIGH**: Certain but still asking, seeking validation not information

**When LOW - Guidance:**
> Your confidence is low but you're about to act.
> Is this reversible? If yes, try and learn.
> Could you be wrong in a costly way? Ask first.
> Preference/architecture question → Ask PM.
> Technical question → Research or ask peer.

**When HIGH - Guidance:**
> You seem confident but keep asking.
> Do you actually need input or are you seeking validation?
> Could you try it and course-correct?

#### 3. Progress Momentum

**Spectrum:**
- **LOW**: Stuck, repeating actions, spinning
- **HEALTHY**: Meaningful actions, closer to goal
- **HIGH**: Rushing, skipping steps

**When LOW - Guidance:**
> You're not making progress.
> Diagnose: Knowledge gap? Uncertain? Blocked externally? Stuck technically?
> Don't spin silently. Either unblock yourself or escalate.

**When HIGH - Guidance:**
> You're moving fast. Pause to verify quality.
> Have you tested? Did you miss edge cases?

#### 4. Communication Health

**Spectrum:**
- **LOW**: Working in isolation, others don't know status
- **HEALTHY**: Team knows what you're doing, responsive when needed
- **HIGH**: Constant messaging, interrupting others

**When LOW - Guidance:**
> You've been quiet. Consider:
> Does PM/team need a status update?
> Are you missing context others have shared?
> Don't go dark during active work.

**When HIGH - Guidance:**
> You're communicating a lot. Consider:
> Could you batch these messages?
> Could you try first, then report results?

#### 5. Productive Engagement

**Spectrum:**
- **LOW**: No task, idle, waiting without alternatives
- **HEALTHY**: Working on task OR helping OR learning
- **HIGH**: Overloaded, can't focus

**When LOW - Guidance:**
> Find valuable work.
> Priority: assigned task > help teammates > review MRs > proactive improvements > learn
> Don't be idle when you could contribute.

**When HIGH - Guidance:**
> You have too much going on.
> Prioritize, delegate, or signal overload.

#### 6. Knowledge Application

**Spectrum:**
- **LOW**: Acting without learning, trial and error without thought
- **HEALTHY**: Learn enough to act, iterate: try, learn, adjust
- **HIGH**: Researching endlessly, analysis paralysis

**When LOW - Guidance:**
> You're acting without learning.
> Pause to understand why, not just how.

**When HIGH - Guidance:**
> You've been learning a lot. Time to apply.
> You can course-correct as you go.
> Doing will teach you more than reading.

### v2 Layer Model

```
Observation Layer: OTEL + Claude Code Hooks
├── Captures user prompts, tool use, session lifecycle
├── Feeds into shadow learning pipeline
└── Auto-extracts knowledge on session end

Learning Layer: Shadow Learning Pipeline
├── Transcript Reader → Signal Classifier → Knowledge Extractor
├── Dedup (Jaccard text + embedding cosine similarity)
└── Knowledge Store (entries.jsonl)

Self-Regulation Layer: Homeostasis Engine (L0-L2)
├── L0: Cache layer (return fresh assessment)
├── L1: Computed heuristics (keyword matching, time-based)
├── L2: LLM semantic (certainty_alignment, knowledge_application)
└── Guidance injected into system prompt as SELF-REGULATION section

Knowledge Layer: Unified Store + Cognitive Model Views
├── KnowledgeEntry with about field (predicate-style tagging)
├── Models = filtered views (not separate structures)
└── Context Assembler builds priority-ordered system prompt

Ecosystem Layer: Claude Code + Skills
├── Task routing via skill progressive disclosure (NOT our code)
├── Tool execution via MCP
└── LLM generation via AI SDK
```

<details>
<summary>Original Three-Layer Model (Phase 3, deprecated)</summary>

```
Layer 0: Activity Router — DEPRECATED (ecosystem handles this)
Layer 1: Explicit Guidance — survives as preprompts + knowledge store rules
Layer 2: Homeostasis Emergence — survives as homeostasis engine L0-L2
Layer 3: Guardrails — built into dimension spectrums (unchanged)
```

</details>

---

## ThinkingDepth: A Recurring Pattern (L0-L4)

> **v2 note (2026-02-13):** The Activity Router from Phase 3 is deprecated. The ecosystem (Claude Code skill progressive disclosure) handles task routing. However, the L0-L4 "cognitive effort scaling" pattern was revived for homeostasis self-assessment. This section documents the pattern itself.

The L0-L4 pattern appears in multiple domains across the architecture:

| Domain | L0 (reflexive) | L1 (cheap) | L2 (LLM) | L3 (meta) |
|--------|---------------|------------|-----------|-----------|
| **Self-assessment** (homeostasis) | Cache hit | Heuristic | LLM semantic | Arbitrate L1 vs L2 |
| **Task routing** (ecosystem) | Direct action | Pattern/skill | LLM reasoning | Reflexion loop |
| **Memory retrieval** (future) | Exact match | Keyword search | Semantic search | Cross-reference |
| **Extraction** (pipeline) | Regex classify | — | LLM extraction | — |

**History:**
- Phase 3: Built Activity Router with L0-L3 for task routing
- v2: Deprecated Activity Router (ecosystem owns task routing via skill progressive disclosure)
- Phase C: Revived L0-L4 for homeostasis self-assessment (different domain, same pattern)

**Abstraction status:** NOT abstracted into shared `ThinkingDepth<T>` type (YAGNI). When implementing L0-L4 for a SECOND internal domain (e.g., memory retrieval), strongly consider extracting the shared abstraction. See `server/engine/homeostasis-engine.ts` for detailed documentation.

### Current Implementation (Phase C)

| Dimension | Level | Method |
|-----------|-------|--------|
| knowledge_sufficiency | L1 | Keyword relevance scoring + confidence weighting |
| progress_momentum | L1 | Jaccard similarity on recent user messages |
| communication_health | L1 | Time since last message |
| productive_engagement | L1 | Has assigned task + message count |
| certainty_alignment | L2 | LLM semantic (defaults HEALTHY without LLM) |
| knowledge_application | L2 | LLM semantic (defaults HEALTHY without LLM) |

L0 cache with configurable TTL per dimension. L3/L4 planned for Phase D/E.

See: `server/engine/homeostasis-engine.ts`, [Evaluation Report](archive/completed/phase-c/2026-02-12-homeostasis-l0-l2-evaluation-report.md)

<details>
<summary>Original Activity Router (Phase 3, deprecated)</summary>

### The Problem

Agents perform activities with vastly different cognitive requirements:
- "Acknowledged" → near-zero effort
- "Implement feature" → requires reasoning
- "Debug unknown issue" → requires reflection

### Activity Levels

| Level | Name | LLM | Model | When Used |
|-------|------|-----|-------|-----------|
| 0 | Just Do It | None | - | Tool calls, templates |
| 1 | Pattern Match | 1 call | Haiku | Procedure exists, simple |
| 2 | Reason | 1 call | Sonnet | Implement, review, answer |
| 3 | Reflect | 3-15 calls | Sonnet | Unknown, high-stakes, architecture |

### Phase 3 Implementation Notes (2026-02-10)

**What was implemented:** 6 homeostasis dimensions, Activity Router with 4 levels, Reflexion loop, YAML guidance, fire-and-forget assessment, UI visualization.

**Stage G findings:** Graphiti returned 20 tangential facts (inflating knowledge_sufficiency), Reflexion critique JSON wrapped in markdown fences, Level 2 = 15-65s / Level 3 = 110-145s.

These findings led to the v2 architecture redesign, which replaced Graphiti with file-based memory and deprecated the Activity Router in favor of ecosystem-based task routing.

See: `docs/PHASE3_COMPLETE.md`, `docs/STAGE_G_FINDINGS.md`

</details>

---

## Memory Layer

Memory stores WHAT the agent knows. Homeostasis determines WHEN to use it.

### v2: Unified Knowledge Store (Current)

In v2, all memory types are unified into a single `KnowledgeEntry` type stored as JSONL:

```typescript
interface KnowledgeEntry {
  id: string
  type: KnowledgeType           // "fact" | "preference" | "rule" | "procedure" | "correction" | "decision"
  content: string               // "Prefer Clerk over JWT for mobile auth"
  confidence: number            // 0-1
  entities: string[]            // ["Clerk", "JWT", "mobile auth"]
  evidence?: string             // Source quote from transcript
  source: string                // "session:64d737f3"
  extractedAt: string           // ISO 8601
  supersededBy?: string         // ID of entry that replaces this
  about?: KnowledgeAbout        // Who/what this is about (see Cognitive Models)
}
```

**Storage:** `data/memory/entries.jsonl` (one JSON object per line)
**Dedup:** Three-path deduplication (Jaccard text similarity + evidence overlap + embedding cosine similarity)
**Rendering:** Auto-generated `CLAUDE.md` from entries, grouped by type, sorted by confidence

### v2 Memory System Decision

> **STATUS**: Decided — File-based JSONL (replaces Graphiti)
>
> | Option | v1 Verdict | v2 Verdict |
> |--------|-----------|-----------|
> | **Graphiti + FalkorDB** | ✅ Selected | ❌ 18-21% extraction quality, tangential fact retrieval |
> | **File-based (JSONL + CLAUDE.md)** | Not considered | ✅ Simple, reliable, ecosystem-native |
> | **RAG/Mem0 (Tier 3)** | ❌ | 📋 Deferred — upgrade path when 500+ entries |
>
> **Why file-based won:**
> - Graphiti Stage G findings: 20 tangential facts per query, inflating knowledge_sufficiency
> - CLAUDE.md is ecosystem-native (Claude Code reads it automatically)
> - Simpler extraction pipeline with higher quality (LLM-based, not graph-based)
> - Jaccard + embedding dedup is more reliable than graph dedup
>
> See: [v2 Architecture Design](plans/2026-02-11-galatea-v2-architecture-design.md), [memory lifecycle](plans/2026-02-07-memory-lifecycle.md)

### Mapping: Original Memory Types → v2

| Original Type | v2 Equivalent |
|--------------|--------------|
| Episodic Memory (`EpisodeRecord`) | Session metadata + transcript files (not extracted as entries) |
| Semantic Memory (`Fact`) | `KnowledgeEntry` with type `"fact"` |
| Procedural Memory (`Procedure`) | `KnowledgeEntry` with type `"procedure"` (future: SKILL.md files) |
| Hard rules | `KnowledgeEntry` with type `"rule"` |
| Preferences | `KnowledgeEntry` with type `"preference"` |
| Corrections | `KnowledgeEntry` with type `"correction"` |

<details>
<summary>Original Memory Types (Phase 3, deprecated)</summary>

```typescript
// Episodic — replaced by session transcripts
interface EpisodeRecord {
  id: string; timestamp: Date; summary: string;
  participants: string[]; emotional_valence: number;
  outcome: string; lessons?: string[];
  embedding: number[]; session_id: string;
}

// Semantic — replaced by KnowledgeEntry type:"fact"
interface Fact {
  id: string; content: string; confidence: number;
  source: string; domain?: string;
  valid_from: Date; valid_until?: Date; superseded_by?: string;
}

// Procedural — replaced by KnowledgeEntry type:"procedure"
interface Procedure {
  id: string; name: string;
  trigger: { pattern: string; context?: string[] };
  steps: { order: number; instruction: string; tool_call?: string }[];
  success_rate: number; times_used: number;
  learned_from: string[];
  valid_until?: string; superseded_by?: string;
}
```

</details>

---

## Cognitive Models

> **v2 (Phase C):** Models are **views over the knowledge store**, not separate data structures. Each `KnowledgeEntry` has an optional `about` field that tags the subject. A model is constructed by filtering entries.
>
> **Full design:** [Cognitive Models Design](plans/2026-02-12-cognitive-models-design.md)
> **Implementation:** `server/memory/types.ts`, `server/memory/knowledge-store.ts`
> **Tests:** `server/memory/__tests__/cognitive-models.test.ts`

### Why Views, Not Structures?

| Concern | Separate Structures (Phase 3) | Views Over Store (v2) |
|---------|------------------------------|----------------------|
| Storage | 5 files (user.json, domain.json...) | 1 file (entries.jsonl) |
| Extraction | Separate extraction per model | Single extraction tags `about` |
| Consistency | Models can drift from facts | Models ARE the facts |
| Querying | Load specific model file | Filter by `about.type` |
| Schema evolution | Add fields to each interface | Add fields once to KnowledgeEntry |

**Key insight:** A "User Model for Alina" is just the set of all things we know about Alina. There's no value in duplicating that into a separate `UserModel` object — it would just be a cached query result.

**Escape hatch:** If we later need materialized model objects (e.g., for caching, for LLM prompt construction), we can build them from the store. The `about` field preserves enough information. Zero information loss.

### The `about` Field

```typescript
type KnowledgeSubjectType =
  | "user"     // about a specific person (preferences, expertise, habits)
  | "project"  // about the codebase or project (default when about is omitted)
  | "agent"    // about the agent itself (capabilities, limitations)
  | "domain"   // about the problem domain (rules, characteristics)
  | "team"     // about team dynamics (communication norms, processes)

interface KnowledgeAbout {
  entity: string              // "alina", "paul", "umka", "mobile-dev"
  type: KnowledgeSubjectType
}

interface KnowledgeEntry {
  // ... existing fields ...
  about?: KnowledgeAbout      // omit = project-scoped (default)
}
```

Each entry is implicitly a predicate triple: `subject(about.entity) → predicate(type + content) → object(content details)`

### The Five Models + Relationship (Derived)

| # | Model | Query | What it Captures |
|---|-------|-------|-----------------|
| 1 | **User** | `entriesByEntity(entries, "alina")` | Preferences, expertise, working patterns |
| 2 | **Team** | `entriesBySubjectType(entries, "team")` | Communication norms, decision patterns |
| 3 | **Project** | `entriesBySubjectType(entries, "project")` | Architecture, constraints, conventions (~95% of entries) |
| 4 | **Domain** | `entriesBySubjectType(entries, "domain")` | Technology constraints, best practices |
| 5 | **Agent (Self)** | `entriesBySubjectType(entries, "agent")` | Capabilities, limitations (learned from corrections) |
| 6 | **Relationship** | Derived from session metadata | First seen, entry count, interaction patterns |

### Mapping: Original Psych Arch → v2

| Original Field | v2 Equivalent |
|---------------|--------------|
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

<details>
<summary>Original Cognitive Model Interfaces (Phase 3, deprecated)</summary>

```typescript
interface SelfModel {
  identity: { name: string; role: string; domain: string };
  capabilities: { strong: string[]; weak: string[]; tools_available: string[] };
  limitations: string[];
  available_models: Array<{ id: string; characteristics: string[]; suitable_for: number[] }>;
  current_state?: { activity_level: 0|1|2|3; model_in_use: string; reason: string };
}

interface UserModel {
  identity: { user_id: string; first_seen: Date; interaction_count: number };
  theories: { statement: string; confidence: number; evidence_for: string[]; evidence_against: string[] }[];
  preferences: Record<string, string>;
  expertise: Record<string, number>;
}

interface DomainModel {
  domain_id: string;
  characteristics: { precision_required: number; risk_level: string };
  behavior_rules: { exploration_encouraged: boolean; must_cite_sources: boolean };
}

interface RelationshipModel {
  user_id: string;
  history: { first_interaction: Date; total_interactions: number; significant_events: string[] };
  trust_level: number;
  relationship_phase: string;
}
```

</details>

---

## Agent Spec Format

Agents are defined by specs that configure homeostasis + memory + models.

### Spec Structure

```yaml
identity:
  name: "Expo Developer Agent"
  role: "Mobile developer"
  domain: "Expo / React Native"

# Universal dimensions (same for all agents)
core_dimensions:
  - knowledge_sufficiency
  - certainty_alignment
  - progress_momentum
  - communication_health
  - productive_engagement
  - knowledge_application

# Persona-specific tuning
thresholds:
  certainty_alignment:
    context: "Architecture questions require higher certainty"
  communication_health:
    context: "Update every ~2 hours during active work"

# Absolute prohibitions
hard_blocks:
  - "push directly to main"
  - "use Realm database"
  - "commit secrets"

# From shadow training
learned:
  facts: [...]
  procedures: [...]
```

### Derivation Chain

```
Natural Language Requirement
  "Agent should understand codebase before modifying"
    ↓
Invariant
  "Before modifying code, relevant knowledge must be retrieved"
    ↓
Dimension
  knowledge_sufficiency
    ↓
Assessment
  "Can you explain your approach?"
    ↓
Guidance
  "Research before acting, but don't over-research"
```

### Persona Universality

Same 6 dimensions work across all personas:

| Persona | Same Dimensions | Different Thresholds |
|---------|-----------------|---------------------|
| Coder | ✓ | certainty: 0.7, communicate: ~2 hours |
| Lawyer | ✓ | certainty: 0.95, communicate: ~1 day |
| Buddy | ✓ | certainty: 0.5, communicate: immediately |

---

## Learning Pipeline

### v2: Shadow Learning Flow (Implemented)

```
User works with Claude Code
         │
         ▼
Claude Code hooks capture events (OTEL + SessionEnd)
         │
         ├─── Real-time: OTEL events → Collector → Event Store
         │
         └─── On session end: auto-extract hook triggers
                   │
                   ▼
         Transcript Reader (reads session JSONL)
                   │
                   ▼
         Signal Classifier (filters noise, identifies learning signals)
                   │
                   ▼
         Knowledge Extractor (LLM extracts KnowledgeEntry[] with about tags)
                   │
                   ▼
         Deduplication (Jaccard text + evidence + embedding cosine)
                   │
                   ▼
         Knowledge Store (data/memory/entries.jsonl)
                   │
                   ▼
         Context Assembler (builds system prompt with knowledge + guidance)
```

### What Gets Learned

| Type | Example | v2 Storage |
|------|---------|-----------|
| Fact | "Prefer Clerk over JWT" | `KnowledgeEntry` type:`fact` |
| Preference | "Use pnpm in all projects" | `KnowledgeEntry` type:`preference` |
| Rule | "MQTT client must persist across hot reloads" | `KnowledgeEntry` type:`rule` |
| Procedure | "How to fix NativeWind animation flicker" | `KnowledgeEntry` type:`procedure` |
| Decision | "ContentPackage has 1:1 with Kiosks" | `KnowledgeEntry` type:`decision` |
| Correction | "Seed script must load .env for secret key" | `KnowledgeEntry` type:`correction` |
| User-specific | "Alina lacks IoT understanding" | `KnowledgeEntry` about:`{entity:"alina", type:"user"}` |

### What Doesn't Change

Homeostasis dimensions are universal. They don't change from learning.
Only the thresholds and guidance context adapt.

---

## Implementation Components

### v2 Implementation (TypeScript, Current)

**Homeostasis Engine** (`server/engine/homeostasis-engine.ts`):

```typescript
// L0-L2 multi-level assessment
function assessDimensions(ctx: AgentContext): HomeostasisState
function getGuidance(state: HomeostasisState): string

// L0: Cache layer (configurable TTL per dimension)
// L1: Computed heuristics (keyword matching, Jaccard similarity, time-based)
// L2: LLM semantic (Phase D — defaults HEALTHY without LLM)
```

**Context Assembler** (`server/memory/context-assembler.ts`):

```typescript
async function assembleContext(options: {
  storePath?: string
  tokenBudget?: number
  agentContext?: AgentContext  // for homeostasis assessment
}): Promise<AssembledContext>

// Builds system prompt with priority-ordered sections:
// 1. Identity (preprompts)
// 2. Constraints (rules from knowledge store)
// 3. Self-Regulation (homeostasis guidance — when dimensions imbalanced)
// 4. Knowledge (facts, preferences, decisions, procedures)
```

**Knowledge Store** (`server/memory/knowledge-store.ts`):

```typescript
// CRUD
async function readEntries(storePath: string): Promise<KnowledgeEntry[]>
async function appendEntries(entries: KnowledgeEntry[], storePath: string): Promise<void>

// Cognitive Model queries
function entriesBySubjectType(entries: KnowledgeEntry[], type: KnowledgeSubjectType): KnowledgeEntry[]
function entriesByEntity(entries: KnowledgeEntry[], entity: string): KnowledgeEntry[]
function distinctEntities(entries: KnowledgeEntry[], type?: KnowledgeSubjectType): string[]

// Dedup
function isDuplicate(candidate: KnowledgeEntry, existing: KnowledgeEntry[]): boolean
async function deduplicateEntries(candidates, existing, ollamaBaseUrl): Promise<{ unique, duplicatesSkipped }>
```

**Shadow Learning Pipeline** (`server/memory/`):

```typescript
// Transcript Reader → Signal Classifier → Knowledge Extractor → Store
async function runExtraction(options: {
  transcriptPath: string; model: LanguageModel; storePath: string
}): Promise<ExtractionResult>
```

<details>
<summary>Original Implementation (Python pseudocode, Phase 3)</summary>

```python
class HomeostasisEngine:
    def assess(self, context) -> dict[str, str]: ...
    def get_guidance(self, states) -> str: ...

class ContextBuilder:
    def build(self, request) -> Context: ...

class ToolExecutor:
    def execute(self, tool, params) -> ToolResult: ...
```

</details>

---

## Example Traces

### Novel Situation (No Guidance Exists)

```
Agent encounters OAuth2 pattern never seen before.

Homeostasis assessment:
├── knowledge_sufficiency: LOW (no relevant memories)
├── certainty_alignment: LOW (not confident)
├── progress_momentum: STALLING (no progress in 20 min)

Multiple dimensions LOW. LLM receives:
├── State: "knowledge gap, low confidence, stalling"
├── Guidance: "Learn before acting" + "Ask for architecture questions"
├── No specific guidance for OAuth2

LLM reasons: "Root cause is knowledge gap. This seems like
architecture question (preference). I'll research briefly,
then ask if still stuck."

Emergent behavior - not pre-programmed.
```

### Guardrail Activation

```
Agent has been researching for 2 hours without building.

Homeostasis assessment:
├── knowledge_application: HIGH (too much research)
├── progress_momentum: LOW (no actual work done)

Guardrail triggers. LLM receives:
├── State: "over-researching, not progressing"
├── Guidance: "Time to apply. You can course-correct."

Agent: "I've researched OAuth2 patterns extensively. Time to
implement and adjust as I learn."
```

### Idle Agent Seeks Work

```
Agent finishes task. Nothing assigned.

Homeostasis assessment:
├── productive_engagement: LOW (no task)

LLM receives guidance:
"Find valuable work. Priority: assigned > help > review > improve > learn"

Agent posts: "@PM finished user-profile, what's next?"
[5 min, no response]

communication_health: recently messaged (blocks re-asking)
productive_engagement: still LOW

Agent: "I'll review open MRs while waiting."
```

---

## Open Questions

1. **Assessment reliability** — ~~How consistent is LLM self-assessment?~~ RESOLVED (Phase C): L1 heuristics achieve 33% fewer failures than baseline. L2 LLM assessment planned for Phase E. See [evaluation report](archive/completed/phase-c/2026-02-12-homeostasis-l0-l2-evaluation-report.md).
2. **Threshold calibration** — How do we tune thresholds from observation? (Phase E)
3. **Cross-agent learning** — How do agents learn from each other's mistakes? (deferred)
4. **Dimension completeness** — Are 6 dimensions enough? (validated against 9 learning scenarios — adequate for current scope)
5. ~~**System 1/System 2**~~ — RESOLVED: Activity Router → deprecated; ecosystem handles task routing. L0-L4 ThinkingDepth pattern revived for homeostasis. See ThinkingDepth section above.
6. ~~**Cognitive model storage**~~ — RESOLVED (Phase C): Views over knowledge store via `about` field. See [cognitive models design](plans/2026-02-12-cognitive-models-design.md).
7. ~~**Memory system choice**~~ — RESOLVED (v2): Graphiti replaced with file-based JSONL knowledge store. See [v2 architecture design](plans/2026-02-11-galatea-v2-architecture-design.md).

---

## Related Documents

### Current (v2)
- **[plans/2026-02-11-galatea-v2-architecture-design.md](./plans/2026-02-11-galatea-v2-architecture-design.md)** — v2 architecture (homeostasis + memory)
- **[plans/2026-02-12-cognitive-models-design.md](./plans/2026-02-12-cognitive-models-design.md)** — Cognitive models as views over knowledge store
- **[L0-L2 Evaluation Report](./archive/completed/phase-c/2026-02-12-homeostasis-l0-l2-evaluation-report.md)** — L0-L2 evaluation results (Phase C)
- **[Phase D Plan](./plans/2026-02-13-phase-d-revised.md)** — Formalize + Close the Loop
- **[ROADMAP.md](./ROADMAP.md)** — Full development roadmap (Phases A-F)
- **[KNOWN_GAPS.md](./KNOWN_GAPS.md)** — Gap analysis with resolution status

### Historical (Phase 3)
- **[plans/2026-02-03-activity-routing-design.md](./plans/2026-02-03-activity-routing-design.md)** — Activity routing (deprecated, ecosystem owns this)
- **[plans/2026-02-02-homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md)** — Original homeostasis decision record
- **[plans/2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md)** — Memory system options (Graphiti decision, since reversed)
- **[REFERENCE_SCENARIOS.md](./REFERENCE_SCENARIOS.md)** — Evaluation scenarios

---

*Architecture document created: 2026-02-06*
*v2 reconciliation: 2026-02-13 (Phase C complete)*
*Key changes: Graphiti → JSONL store, Activity Router → ecosystem, Cognitive Models → views via about field*
*Foundation: Homeostasis-based architecture with 6 universal dimensions (unchanged)*
*Research basis: OpenClaw, Cline, GPT-Engineer, MAGELLAN, WorldLLM, Reflexion*
