# Memory Lifecycle

**Date:** 2026-02-07
**Status:** Draft
**Source of Truth:** [PSYCHOLOGICAL_ARCHITECTURE.md](../PSYCHOLOGICAL_ARCHITECTURE.md)
**Related:**
- [OBSERVATION_PIPELINE.md](../OBSERVATION_PIPELINE.md) (Layer 4: Memory Formation)
- [GATEKEEPER.md](../memory/GATEKEEPER.md) (Conversation filtering)
- [REFERENCE_SCENARIOS.md](../REFERENCE_SCENARIOS.md) (Expected behavior)
- [memory-system-design.md](./2026-02-02-memory-system-design.md) (Original design)
- [unified-memory-extraction-design.md](./2026-02-06-unified-memory-extraction-design.md) (Extraction approach)
- [pluggable-extraction-interface.md](./2026-02-06-pluggable-extraction-interface.md) (Extractor abstraction)

---

## Overview

This document traces the complete lifecycle of every memory type in Galatea:
how each is **created**, **stored**, **retrieved**, **edited/superseded**, and **promoted**.

The extraction design (pattern-based + pluggable LLM fallback) is the extraction
layer within this larger system. It is NOT the whole memory system.

---

## Memory Types

PSYCHOLOGICAL_ARCHITECTURE.md defines 3 memory types + 4 cognitive models:

### 1. Episodic Memory (Events)

**What it captures:** Timestamped events with context, outcome, and lessons.

```typescript
interface EpisodeRecord {
  id: string;
  timestamp: Date;
  summary: string;              // "Tried JWT auth, failed, switched to Clerk"
  participants: string[];       // ["user", "galatea"]
  emotional_valence: number;    // -1 to 1 (frustrated → relieved)
  outcome: string;              // "success" | "failure" | "partial"
  lessons?: string[];           // ["JWT has mobile refresh issues"]

  embedding: number[];
  session_id: string;
}
```

**Examples:**
- "Feb 1: Tried JWT auth, failed, switched to Clerk (150 min, frustrated→relieved)"
- "Feb 2: Found NativeWind animation workaround using inline styles"
- "Feb 2: PR review feedback — Agent-1 missed null checks again"

### 2. Semantic Memory (Facts)

**What it captures:** Knowledge with confidence and temporal validity.

```typescript
interface Fact {
  id: string;
  content: string;              // "Prefer Clerk over JWT for mobile auth"
  confidence: number;           // 0-1
  source: string;               // episode_id or "user_stated" or "manual"
  domain?: string;              // "expo-auth"

  // Temporal validity
  valid_from: Date;
  valid_until?: Date;           // null = still valid
  superseded_by?: string;       // reference to replacement fact
}
```

**Sub-types (same schema, different behavior):**

| Sub-type | Confidence | Retrieval | Example |
|----------|-----------|-----------|---------|
| **Preference** | 0.8-0.95 | Semantic search | "I prefer dark mode" |
| **Policy** | 0.9-1.0 | Semantic search | "We always use Prettier" |
| **Hard Rule** | 1.0 | **Guaranteed injection** (no threshold) | "Never use Realm database" |
| **Domain Fact** | 0.5-0.95 | Semantic search | "NativeWind <4.1 has animation bug" |

**Hard rules are special:** They are ALWAYS injected into context regardless of
similarity score. They use a separate guaranteed retrieval path, not
similarity-dependent search.

### 3. Procedural Memory (How-To)

**What it captures:** Trigger → steps patterns with success tracking.

```typescript
interface Procedure {
  id: string;
  name: string;                 // "Handle NativeWind animation flicker"

  trigger: {
    pattern: string;            // "Pressable animation flickering"
    context?: string[];         // ["nativewind", "animation"]
  };

  steps: {
    order: number;
    instruction: string;
    tool_call?: string;         // MCP tool
  }[];

  // Learning metadata
  success_rate: number;         // Updated after each use
  times_used: number;
  learned_from: string[];       // Episode IDs

  // Temporal validity
  valid_until?: string;         // "NativeWind 4.1 release"
  superseded_by?: string;
}
```

**Examples:**
- Trigger: "Need auth in mobile app" → Steps: Consider Clerk → install → provider → screens
- Trigger: "Pressable animation flickering" → Steps: Keep static in className → animated in inline

### 4. Cognitive Models (Self, User, Domain, Relationship)

These **consume** memory, they don't produce it directly. They are updated as a
side effect of memory creation and retrieval.

```typescript
// Updated when agent makes mistakes or succeeds
interface SelfModel {
  capabilities: { strong: string[]; weak: string[] };
  limitations: string[];
}

// Updated from dialogue, preferences, observations
interface UserModel {
  theories: { statement: string; confidence: number; evidence_for: string[] }[];
  preferences: Record<string, string>;
  expertise: Record<string, number>;
}
```

---

## Lifecycle Phase 1: Creation

Memory enters the system through 5 distinct pathways:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CREATION PATHWAYS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① Observation Pipeline ──────────→ Episodic                   │
│     (OTEL → Activity → Enrichment → Dialogue → Episode)        │
│                                                                 │
│  ② Conversation Gatekeeper ───────→ Semantic                   │
│     (Chat turn → Pattern match / LLM → Fact)                   │
│                                                                 │
│  ③ Dialogue Validation ──────────→ Episodic + Semantic         │
│     (Agent asks user → User confirms/corrects → Both)          │
│                                                                 │
│  ④ Manual Entry ─────────────────→ Semantic (Hard Rules)       │
│     (User explicitly adds knowledge → Confidence 1.0)          │
│                                                                 │
│  ⑤ Promotion ────────────────────→ All types                   │
│     (episode→observation→fact→rule→procedure→shared)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pathway ①: Observation Pipeline → Episodic

**Source:** OBSERVATION_PIPELINE.md Layers 0-4

```
OTEL events (Layer 0)
  → Activity ingestion (Layer 1)
  → Activity session enrichment (Layer 2)
  → Dialogue validation (Layer 3)
  → Memory formation (Layer 4)
  → EpisodeRecord created
```

Layer 4 (`formMemoriesFromDialogue`) creates episodic memories from validated
activity sessions. The agent observed the user doing something, asked about it,
and the user confirmed/corrected.

**What gets extracted:**
- Episode summary (what happened)
- Outcome (success/failure/partial)
- Duration and emotional arc
- Lessons learned

**This is where our extraction design fits:** The extraction layer (pattern-based
+ pluggable LLM) operates within Layer 4 to also extract semantic facts from the
dialogue. But the primary output of this pathway is **episodic**, not semantic.

```
Layer 4 output:
  ├── EpisodeRecord (always created)
  └── ExtractedFacts[] (if patterns match or LLM extracts)
```

### Pathway ②: Conversation Gatekeeper → Semantic

**Source:** GATEKEEPER.md

Every chat turn passes through the gatekeeper:

```
User message + Assistant response
  → Gatekeeper evaluation
  → SKIP (greeting, confirmation, pure question)
  → INGEST (preference, policy, decision, correction)
  → UNSURE → LLM fallback (via pluggable extractor)
```

**This is where our pattern-based extraction lives:**

```typescript
// Pattern match (fast path, 70%)
PREFERENCE_RE → Semantic fact (preference sub-type)
POLICY_RE     → Semantic fact (policy sub-type)
DECISION_RE   → Semantic fact (decision sub-type)
CORRECTION_RE → Semantic fact + updates existing memory

// LLM fallback (30%)
ExtractionOrchestrator → Semantic facts via pluggable extractor
```

**Fail-open default:** If no pattern matches AND LLM is unsure, ingest anyway
(prefer noise over lost knowledge). The confidence score will be lower.

### Pathway ③: Dialogue Validation → Episodic + Semantic

**Source:** OBSERVATION_PIPELINE.md Layer 3

When the agent asks the user a clarifying question:

```
Agent: "I noticed you switched from JWT to Clerk. What should I learn?"
User:  "JWT has issues specifically in mobile/Expo"
```

This creates both:
- **Episodic:** The dialogue itself (what was asked, what was answered)
- **Semantic:** The extracted fact ("JWT has mobile token refresh issues")
  with confidence 0.95+ (user explicitly stated)

### Pathway ④: Manual Entry → Hard Rules

**Source:** REFERENCE_SCENARIOS.md

User explicitly adds knowledge:

```
User: "Never use Realm database"
→ Hard Rule (confidence: 1.0, severity: block)
→ Guaranteed injection path (not similarity-dependent)
```

Hard rules bypass the gatekeeper entirely. They are always stored and always
retrieved.

### Pathway ⑤: Promotion → All Types

**Source:** memory-system-design.md

Memory promotion creates new, higher-level memories from existing ones.
See "Lifecycle Phase 4: Promotion" below.

---

## Lifecycle Phase 2: Storage

### Schema Requirements

All memory types share temporal validity:

```typescript
interface MemoryNode {
  created_at: Date;             // When memory was created
  valid_from: Date;             // When knowledge became true
  valid_until: Date | null;     // When it stopped being true (null = current)
  superseded_by?: string;       // Reference to replacement memory
}
```

### Storage Design

The original architecture chose Graphiti + FalkorDB for 5 reasons:

1. **Hard rules guaranteed** (not similarity-dependent)
2. **Temporal validity** ("was true then, not now")
3. **Procedure success tracking**
4. **Memory promotion** (episode → fact → procedure)
5. **Cross-agent pattern detection**

Our benchmarks showed Graphiti has poor fact extraction quality (18-21% recall).
**But extraction quality ≠ storage quality.** We can use our unified extraction
(pattern + pluggable LLM) for the extraction step while still using a proper
storage backend that supports the above 5 requirements.

### Storage Options

| Requirement | PostgreSQL + pgvector | FalkorDB (Graph) |
|---|---|---|
| Hard rule guaranteed injection | ✓ Category filter query | ✓ Cypher label query |
| Temporal validity | ✓ valid_from/valid_until columns | ✓ Bi-temporal properties |
| Procedure success tracking | ✓ success_rate column | ✓ Property on node |
| Memory promotion | ✓ Promotion table + triggers | ✓ SUPERSEDES edges |
| Cross-agent patterns | ✓ visibility + GROUP BY | ✓ Cross-graph queries |
| Relationship traversal | ✗ Requires JOINs | ✓ Native graph traversal |
| Supersession history | Requires extra table | ✓ Native edge history |

**Decision deferred.** Storage backend is independent of extraction layer.
What matters is the schema supports all 5 requirements.

### Minimum Schema (Any Backend)

```
Episodic Memory:
  id, timestamp, summary, participants[], emotional_valence,
  outcome, lessons[], embedding, session_id,
  valid_from, valid_until

Semantic Memory:
  id, content, confidence, source, domain,
  sub_type (preference | policy | hard_rule | fact),
  entities[], embedding,
  valid_from, valid_until, superseded_by

Procedural Memory:
  id, name, trigger_pattern, trigger_context[],
  steps[] (order, instruction, tool_call),
  success_rate, times_used, learned_from[],
  valid_until, superseded_by

Cognitive Models:
  self_model (capabilities, limitations, current_state)
  user_model (theories[], preferences, expertise)
  domain_model (characteristics, behavior_rules)
  relationship_model (history, trust_level, phase)
```

---

## Lifecycle Phase 3: Retrieval

### Retrieval Flow

When the agent receives a task, memory retrieval runs in parallel:

```
Task: "Add user profile screen with avatar upload"
                    │
    ┌───────────────┼───────────────┬──────────────────┐
    ▼               ▼               ▼                  ▼
Hard Rules      Semantic        Procedures         Models
(guaranteed)    (ranked)        (trigger match)    (self+user)
    │               │               │                  │
    ▼               ▼               ▼                  ▼
ALL rules      Top N by:       Best by:           Current
no threshold   similarity*0.4  trigger_sim *      self + user
               recency*0.2     success_rate       context
               confidence*0.3
               source*0.1
    │               │               │                  │
    └───────────────┴───────┬───────┴──────────────────┘
                            ▼
                    Priority Budget Assembly
                    ├── Hard Rules: 500 tokens (RESERVED)
                    ├── Procedures: 1500 tokens max
                    ├── Facts: 4000 tokens max
                    ├── Models: 1000 tokens max
                    └── Episodes: 1000 tokens max
                            │
                            ▼
                    Context → LLM prompt
```

### Hard Rules: Guaranteed Injection

Hard rules are NEVER filtered by similarity. They are always included:

```sql
-- All active hard rules for this domain (or global)
SELECT content, severity, reason
FROM semantic_memory
WHERE sub_type = 'hard_rule'
  AND valid_until IS NULL
  AND (domain = $current_domain OR domain IS NULL)
ORDER BY severity DESC
```

### Semantic Search: Ranked by Score

```
finalScore = similarity * 0.4
           + recency * 0.2
           + confidence * 0.3
           + source_boost * 0.1
```

Only currently valid facts (valid_until IS NULL).

### Procedure Match: Trigger-Based

```sql
-- Match triggers semantically, rank by success
SELECT name, steps, success_rate
FROM procedural_memory
WHERE valid_until IS NULL
  AND trigger_similarity($task) > 0.7
ORDER BY trigger_similarity * success_rate DESC
LIMIT 3
```

---

## Lifecycle Phase 4: Editing & Supersession

### Core Principle: Never Delete, Always Supersede

```typescript
async function supersede(
  oldMemoryId: string,
  newMemory: Memory,
  reason: string
): Promise<void> {
  // 1. Mark old as no longer valid
  await update(oldMemoryId, { valid_until: new Date() })

  // 2. Store new memory
  const newId = await store(newMemory)

  // 3. Create supersession link
  await update(oldMemoryId, { superseded_by: newId })

  // 4. Log for provenance
  await logSupersession(oldMemoryId, newId, reason)
}
```

### Editing Scenarios

**Scenario 1: Fact Correction**
```
Old: "We use JWT for auth" (confidence: 0.9, valid_from: Jan 1)
New: "We use Clerk for auth" (confidence: 0.95, valid_from: Feb 1)

Result:
  old.valid_until = Feb 1
  old.superseded_by = new.id
  new.valid_from = Feb 1
  new.valid_until = null (current)
```

**Scenario 2: Procedure Invalidation**
```
Old procedure: "NativeWind flicker → use inline styles"
  valid_until was null (current)

NativeWind 4.1 released, fixes the bug.

Result:
  old.valid_until = "2026-03-15"
  old.superseded_by = new_fact.id
  new_fact: "NativeWind 4.1 fixes Pressable animation flicker"
```

**Scenario 3: Confidence Decay**
```
Fact unused for 90 days, confidence < 0.3:
  → Archive to cold storage
  → Keep stub in main storage (provenance)
  → NOT deleted, just archived
```

### Contradiction Handling

When new memory contradicts existing:

```
Existing: "Prefer Clerk" (confidence: 0.95, recent)
Incoming: "Firebase Auth is cheaper" (confidence: 0.6, new)

Resolution:
  IF incoming.confidence > existing.confidence:
    supersede(existing, incoming)
  ELSE IF both > 0.7 and different aspects:
    keep both (not contradictory, complementary)
  ELSE:
    keep existing, store incoming with lower confidence
    flag for user review
```

---

## Lifecycle Phase 5: Promotion

Memory promotion creates higher-level memories from lower-level ones:

```
episode → observation → fact → rule → procedure → shared
   │           │          │       │        │          │
   │           │          │       │        │          └─ Cross-agent
   │           │          │       │        └─ Trigger → steps
   │           │          │       └─ High confidence (0.9+)
   │           │          └─ Extracted knowledge
   │           └─ Pattern detected (2 similar episodes)
   └─ Raw event
```

### Promotion Rules

**Episode → Observation** (2 similar episodes, >1h apart)
```
Episode 1 (Feb 1): "Tried JWT, failed, switched to Clerk"
Episode 2 (Feb 5): "JWT refused to work, used Clerk instead"
→ Both >0.85 similar, 4 days apart
→ Observation: "JWT has issues, prefer Clerk"
```

**Observation → Fact** (3 supporting observations, no contradictions)
```
Obs 1: "JWT has refresh issues" (source: episode)
Obs 2: "JWT failed in mobile" (source: user)
Obs 3: "JWT problematic for Expo" (source: dialogue)
→ 3 observations, no contradictions
→ Fact: "JWT has token refresh issues in mobile apps" (confidence: 0.8)
```

**Fact → Rule** (confidence ≥ 0.9, consequence severity ≥ medium)
```
Fact: "Never use Realm" (confidence: 0.95, severity: HIGH)
→ Rule: BLOCK - "Never use Realm database"
→ Moves to guaranteed injection path
```

**Rule → Procedure** (2+ successful applications, has trigger + steps)
```
Rule: "Prefer Clerk for auth"
+ Episode 1: "Used Clerk, success"
+ Episode 2: "Used Clerk, success"
→ Procedure:
   trigger: "Need auth in mobile app"
   steps: [install Clerk, setup provider, create screens]
   success_rate: 1.0
```

**Observation → Shared** (3+ agents with same pattern)
```
Agent-1: "Missed null check" (PR #456)
Agent-1: "Missed null check" (PR #523)
Agent-2: "Missed null check" (PR #612)
→ Shared: "Team tends to miss null checks"
→ Added to PR checklist
```

### Promotion Safeguards

Circular promotion prevention:
```typescript
function canPromote(evidence: Evidence[], target: MemoryNode): boolean {
  const external = evidence.filter(e => !e.source_tag.includes(target.id))
  const self = evidence.filter(e => e.source_tag.includes(target.id))

  // Self-reinforcing evidence gets 50% discount
  const effectiveCount = external.length + (self.length * 0.5)
  return effectiveCount >= promotionThreshold
}
```

---

## Where Extraction Design Fits

Our unified extraction (pattern-based + pluggable LLM) is the **extraction layer**
within creation pathways ② and ①:

```
┌────────────────────────────────────────────────────────────┐
│                    MEMORY SYSTEM                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              EXTRACTION LAYER                         │ │
│  │  (unified-memory-extraction-design.md)                │ │
│  │                                                       │ │
│  │  Pattern-based extraction (70%, <1ms, $0)             │ │
│  │  Pluggable LLM fallback (30%, 200-500ms, $0)         │ │
│  │    ├── OllamaExtractor                                │ │
│  │    ├── Mem0Extractor (wraps existing)                 │ │
│  │    ├── GraphitiExtractor (wraps existing)             │ │
│  │    └── ClaudeExtractor                                │ │
│  │                                                       │ │
│  │  Produces: ExtractedFact[]                            │ │
│  └──────────────────────┬───────────────────────────────┘ │
│                         │                                  │
│                         ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              STORAGE LAYER                            │ │
│  │                                                       │ │
│  │  Episodic: EpisodeRecord (events with outcomes)       │ │
│  │  Semantic: Fact (with temporal validity + sub-types)   │ │
│  │  Procedural: Procedure (trigger → steps)              │ │
│  │  Models: Self, User, Domain, Relationship             │ │
│  │                                                       │ │
│  │  All with: valid_from, valid_until, superseded_by     │ │
│  └──────────────────────┬───────────────────────────────┘ │
│                         │                                  │
│                         ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              RETRIEVAL LAYER                          │ │
│  │                                                       │ │
│  │  Hard rules: guaranteed injection                     │ │
│  │  Semantic: hybrid search (vector + BM25)              │ │
│  │  Procedural: trigger matching + success ranking       │ │
│  │  Models: direct query                                 │ │
│  │                                                       │ │
│  │  Priority budget: 8000 tokens                         │ │
│  └──────────────────────┬───────────────────────────────┘ │
│                         │                                  │
│                         ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              LIFECYCLE LAYER                          │ │
│  │                                                       │ │
│  │  Supersession (never delete)                          │ │
│  │  Confidence decay (archive after 90 days unused)      │ │
│  │  Promotion (episode→obs→fact→rule→procedure→shared)   │ │
│  │  Contradiction resolution                             │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The extraction design is a component, not the system.

---

## Complete Lifecycle Example

### Day 1: JWT → Clerk Migration

**14:00 - Observation Pipeline captures activity (Pathway ①)**
```
OTEL events: user editing auth.ts, searching "expo jwt refresh",
installing @clerk/clerk-expo, removing jwt dependencies

Layer 2 enrichment:
  ActivitySession: "Working on authentication, switching from JWT to Clerk"

Layer 3 dialogue:
  Agent: "I noticed you switched from JWT to Clerk. What should I learn?"
  User: "JWT has token refresh issues in mobile/Expo"
```

**14:30 - Layer 4 Memory Formation**
```
Output 1 - Episodic:
  EpisodeRecord {
    summary: "Implemented auth, switched from JWT to Clerk"
    outcome: "success_after_pivot"
    emotional_valence: 0.6 (frustrated→relieved)
    lessons: ["JWT has mobile refresh issues"]
  }

Output 2 - Semantic (via extraction layer):
  Pattern match: "switched from JWT to Clerk"
  → Fact {
      content: "Team switched from JWT to Clerk for mobile auth"
      confidence: 0.95 (user confirmed in dialogue)
      source: episode_001
      domain: "expo-auth"
      sub_type: "preference"
      valid_from: 2026-02-01
    }
```

**15:00 - Chat conversation (Pathway ②)**
```
User: "I prefer Clerk for mobile auth going forward"

Gatekeeper:
  Pattern match: PREFERENCE_RE ✓
  → Fact {
      content: "User prefers Clerk for mobile auth"
      confidence: 0.9
      source: "gatekeeper_pattern"
      sub_type: "preference"
    }
```

**Day 2-7 - Promotion kicks in**
```
Day 2: Episode — used Clerk again, success
Day 5: Episode — recommended Clerk to teammate
Day 7: Episode — explained Clerk in code review

Promotion rule: 2 similar episodes → observation
  → Observation: "Clerk consistently works well for mobile auth"

Promotion rule: 3 observations → fact
  → Fact promoted from observation (confidence rises to 0.95)
```

**End of week - Procedural consolidation**
```
Promotion rule: fact + 2 successful uses → procedure

  Procedure {
    name: "Add authentication to Expo app"
    trigger: "Need auth in mobile app"
    steps: [
      { order: 1, instruction: "Consider Clerk first (not custom JWT)" },
      { order: 2, instruction: "Install @clerk/clerk-expo" },
      { order: 3, instruction: "Setup ClerkProvider in _layout.tsx" },
      { order: 4, instruction: "Create sign-in/sign-up screens" },
      { order: 5, instruction: "Add protected route logic" }
    ]
    success_rate: 1.0
    times_used: 2
    learned_from: [episode_001, episode_003]
  }
```

**Later - Supersession**
```
User: "We're switching to Firebase Auth for cost reasons"

New fact created:
  Fact {
    content: "Team switching to Firebase Auth (cost reasons)"
    valid_from: 2026-03-01
  }

Old fact superseded:
  old_fact.valid_until = 2026-03-01
  old_fact.superseded_by = new_fact.id

Old procedure superseded:
  old_procedure.valid_until = "Switching to Firebase"
  old_procedure.superseded_by = new_procedure.id

History preserved — we can still query "what did we use before?"
```

---

---

## Scenario Traces

Every scenario from REFERENCE_SCENARIOS.md traced through the full lifecycle.

### Trace A: JWT → Clerk (Scenario 1 / Phase 1 Day 1)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ①: Observation pipeline captures activity (editing auth.ts, searching, installing Clerk). Layer 4 creates EpisodeRecord. Pathway ②: Gatekeeper catches "I prefer Clerk" → pattern match → Semantic fact. Pathway ③: Dialogue "What should I learn?" → user confirms → Semantic fact (confidence 0.95). |
| **STORE** | Episode: `{summary: "switched from JWT to Clerk", outcome: success_after_pivot, emotional_valence: 0.6}`. Fact: `{content: "JWT has refresh issues in mobile", domain: "expo-auth", valid_from: Feb 1, sub_type: preference}`. |
| **RETRIEVE** | Next time auth task assigned: Fact retrieved via semantic search ("auth" + "mobile"). Procedure_002 trigger-matched ("Need auth in mobile app"). Hard rule check: no auth-related hard rules. |
| **EDIT** | If team later switches to Firebase Auth: old fact gets `valid_until: date`, `superseded_by: new_fact_id`. New fact created. Old procedure superseded, new procedure created. History preserved. |
| **PROMOTE** | Day 2: Clerk used again → 2nd episode. Day 5: recommended to teammate → 3rd episode. Promotion: 2 similar episodes → observation. 3 observations → fact (confidence rises). Fact + 2 successful uses → procedure. |

### Trace B: NativeWind Animation Bug (Scenario 4 / Phase 1 Day 2)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ①: Episode from observation (debugging, finding workaround). Pathway ②: Gatekeeper catches workaround description → pattern or LLM → Fact + Procedure. |
| **STORE** | Episode: `{summary: "NativeWind animation workaround", learning_moment: true}`. Fact: `{content: "NativeWind className causes flicker", type: known_issue, valid_until: "NativeWind 4.1"}`. Procedure: `{trigger: "Pressable flickering", steps: [use inline styles], valid_until: "NativeWind 4.1"}`. |
| **RETRIEVE** | When agent encounters animation issues: Procedure trigger-matched. Fact retrieved via semantic search. Both check `valid_until` against current version. |
| **EDIT** | NativeWind 4.1 releases (Scenario 4.4): procedure.valid_until set. fact.valid_until set. New fact: "NativeWind 4.1 fixes flicker". Supersession links created. Old memories NOT deleted. |
| **PROMOTE** | Already starts as fact + procedure (user explicitly described workaround). No further promotion needed. Temporal expiration is the key lifecycle event. |

### Trace C: PR Review Null Checks (Scenario 5 / Cross-Agent)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ①: Episode from PR review. Pathway ②: Gatekeeper catches feedback pattern. Each occurrence creates a new episode + fact. |
| **STORE** | Episode_003: `{summary: "PR feedback - null checks", feedback_received: true}`. Fact: `{content: "Check null on user objects before PR", source: episode_003}`. Self-observation: `{content: "I missed null checks", agent_id: Dev-1}`. |
| **RETRIEVE** | Before PR submission: Fact retrieved ("null checks"). Self-observation retrieved in Self Model context ("I tend to miss null checks"). Procedure_004 trigger-matched ("Submit PR"). |
| **EDIT** | After improvement (PR #601 passes): self-observation confidence decays. Fact remains (it's a team rule, not just a personal weakness). |
| **PROMOTE** | 2 episodes (PR #456, #523) → observation: "Dev-1 misses null checks". 3 agents with same pattern → shared fact: "Team tends to miss null checks". Shared fact → team procedure (add to PR checklist). |

### Trace D: Manual Hard Rule (Scenario 2)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ④: Manual entry. User says "Never use Realm". Confidence 1.0, severity: block. |
| **STORE** | Fact: `{content: "Never use Realm", sub_type: hard_rule, confidence: 1.0, severity: block, alternatives: ["SQLite + Drizzle", "WatermelonDB"]}`. |
| **RETRIEVE** | **Guaranteed injection** — always in context when database decisions are being made. Not dependent on similarity threshold. Alternatives retrieved via semantic search when Realm is mentioned. |
| **EDIT** | Only superseded by explicit user action. Cannot be overridden by observations or promotion. Would require user to say "Actually, Realm is ok now" → supersession with provenance. |
| **PROMOTE** | Already at highest level (hard rule). No further promotion. |

### Trace E: External Content / Liquid Glass (Scenario 3)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ②: User pastes article or URL. Extraction layer processes content. Pattern-based extraction for clear statements. LLM fallback for complex content. User annotations ("use sparingly") create high-confidence facts. |
| **STORE** | Facts: `{content: "Liquid Glass is Apple's design for iOS 26", domain: "ios-design"}`. User annotation: `{content: "Use Liquid Glass sparingly - performance impact", confidence: 1.0, source: user_annotation}`. Procedure: `{trigger: "Designing premium iOS UI", steps: [consider Liquid Glass for hero sections]}`. |
| **RETRIEVE** | When designing iOS UI: Facts retrieved via semantic search. Procedure trigger-matched. Performance caveat included. |
| **EDIT** | When Apple updates design language: old facts superseded. New version facts created. |
| **PROMOTE** | User annotation → fact immediately (confidence 1.0). Extracted facts start at lower confidence, promoted if confirmed by experience. |

### Trace F: Conflicting Information (Scenario 6)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Two sources give different advice. Both stored as facts with source tracking. |
| **STORE** | Fact A: `{content: "Source A recommends X", source: article_123, confidence: 0.7}`. Fact B: `{content: "Source B recommends Y", source: article_456, confidence: 0.7}`. Resolution: `{content: "Prefer Y over X", reasoning: "more recent", decided_by: user}`. |
| **RETRIEVE** | Resolution fact retrieved with highest confidence. Original facts available if user queries history. |
| **EDIT** | Resolution itself can be superseded. If new evidence supports X: new resolution supersedes old. |
| **PROMOTE** | Not applicable — conflicts resolved at fact level, not promoted further. |

### Trace G: Knowledge Gap (Scenario 4.5 / Trace 6)

| Phase | What happens |
|-------|-------------|
| **CREATE** | No creation initially — this is a retrieval failure. After PM answers: Pathway ②: Gatekeeper catches PM's response → fact. Pathway ③: Dialogue creates episode + fact. |
| **STORE** | Fact: `{content: "Team uses expo-notifications for push", source: PM_guidance, confidence: 1.0}`. Episode: `{summary: "Asked PM about push notifications", outcome: knowledge_acquired}`. |
| **RETRIEVE** | Homeostasis detects gap (knowledge_sufficiency: LOW). Empty retrieval triggers guidance: "Research or ask". |
| **EDIT** | Updated if team switches push notification provider. |
| **PROMOTE** | PM guidance → fact immediately (authority source). If used successfully 2+ times → procedure. |

### Trace H: Agent Makes Mistake (Trace 5)

| Phase | What happens |
|-------|-------------|
| **CREATE** | Pathway ①: Episode from MR feedback. Self-observation created: `{content: "I missed null checks even when I know the rule", agent_id: Dev-1, confidence: 0.4}`. Existing fact reinforced (new evidence added). |
| **STORE** | Episode: `{summary: "MR feedback - missed null checks", lessons: ["easy to miss even when aware"]}`. Self-observation stored in Self Model. |
| **RETRIEVE** | Next PR: Self Model retrieved ("I tend to miss null checks"). Fact retrieved ("Check null on user objects"). Both inform more careful behavior. |
| **EDIT** | After consistent improvement: self-observation confidence decays. After regression: confidence increases. |
| **PROMOTE** | Self-observation + cross-agent detection: if 3 agents have same pattern → shared fact. |

---

## Gap Analysis: Missing Lifecycle Coverage

### Scenarios vs Lifecycle Phases

| Lifecycle Phase | Covered | Missing |
|---|---|---|
| **Create: Observation Pipeline** | ✓ JWT, NativeWind, PR review | |
| **Create: Gatekeeper** | ✓ Preferences, policies | Gatekeeper LLM fallback (when patterns don't match) |
| **Create: Dialogue** | ✓ Clarifying questions | Daily rituals (morning/evening) |
| **Create: Manual** | ✓ Hard rules | |
| **Create: Promotion** | Conceptual only | No scenario traces actual promotion trigger moment |
| **Store: Temporal validity** | ✓ NativeWind valid_until | |
| **Store: All 3 types** | ✓ Episodic, Semantic, Procedural | |
| **Retrieve: Hard rules** | ✓ Realm block | |
| **Retrieve: Semantic search** | ✓ Several scenarios | Scoring formula not traced |
| **Retrieve: Procedure match** | ✓ Auth, PR checklist | |
| **Retrieve: Token budget** | Not traced | What happens when too many facts compete? |
| **Retrieve: Cognitive models** | Not traced | Self/User/Domain model assembly |
| **Edit: Supersession** | ✓ NativeWind 4.1 | |
| **Edit: Confidence decay** | Not traced | What happens to unused memories after 90 days? |
| **Edit: Contradiction** | ✓ Scenario 6 | |
| **Promote: Episode→Observation** | Not traced | Actual trigger moment |
| **Promote: Observation→Fact** | Not traced | Actual trigger moment |
| **Promote: Fact→Procedure** | Not traced | Actual trigger moment |
| **Promote: → Shared** | Conceptual only | Full cross-agent promotion flow |
| **Cognitive: Self Model** | Partial (Trace H) | Full Self Model lifecycle |
| **Cognitive: User Model** | Not traced | Theories, expertise tracking |
| **Cognitive: Domain/Relationship** | Not traced | Any coverage |

### Gap Summary

**7 lifecycle gaps need new scenarios:**

1. **Promotion in action** — No scenario shows the moment when 2 episodes become an observation, or 3 observations become a fact
2. **Cognitive model lifecycle** — Self Model partially covered. User Model, Domain Model, Relationship Model not traced
3. **Confidence decay** — No scenario for aging out unused memories
4. **Token budget overflow** — No scenario for when 50 facts compete for 4000 tokens
5. **Gatekeeper LLM fallback** — No scenario for ambiguous messages that patterns miss
6. **Daily rituals** — Morning plan / evening summary not traced
7. **Procedure success_rate updates** — Described in schema but no scenario shows it updating

---

## Implementation Implications

Our extraction design docs need to be updated to:

1. **ExtractedFact must include the fields from PSYCH_ARCH's Fact interface:**
   - `source` (episode_id, gatekeeper_pattern, user_stated, manual)
   - `domain` (expo-auth, nativewind, etc.)
   - `sub_type` (preference, policy, hard_rule, fact)
   - `valid_from` (defaults to now)
   - No `valid_until` at creation (set later via supersession)

2. **Extraction layer must also produce EpisodeRecord** (not just facts):
   - Observation pipeline Layer 4 creates episodes
   - Extraction layer extracts facts from within those episodes
   - Both outputs are stored

3. **Storage must support temporal validity:**
   - valid_from / valid_until on every memory
   - superseded_by links
   - Hard rules as a distinct sub_type with guaranteed retrieval

4. **Retrieval must implement priority budget:**
   - Hard rules: always included (500 tokens reserved)
   - Procedures: trigger match + success rate (1500 tokens)
   - Facts: hybrid search with scoring formula (4000 tokens)
   - Models: self + user context (1000 tokens)

5. **Promotion pipeline is a separate system:**
   - Runs periodically (not per-request)
   - episode → observation → fact → rule → procedure → shared
   - Has safeguards against circular promotion

6. **Pluggable extractors produce ExtractedFact[], not full memories:**
   - The extraction layer is one input to the storage layer
   - Other inputs: observation pipeline, manual entry, promotion
   - Storage layer handles temporal validity, supersession, promotion
