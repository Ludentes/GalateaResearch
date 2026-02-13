> **SUPERSEDED**: This API documents the Phase 3 implementation which is being repackaged in v2. The homeostasis concept survives as sensor code + guidance skill (SKILL.md), not a TypeScript engine class. See [v2 Architecture Redesign](../plans/2026-02-11-galatea-v2-architecture-design.md). Kept as reference for the dimension model and guidance logic.

# HomeostasisEngine API Reference

> Source: `server/engine/homeostasis-engine.ts`
> Types: `server/engine/types.ts`

The psychological core of Galatea. Assesses 6 dimensions of homeostatic balance and provides actionable guidance when imbalances are detected.

## Factory

```typescript
import { createHomeostasisEngine } from "~/engine/homeostasis-engine"

const engine = createHomeostasisEngine()
```

`createHomeostasisEngine(): HomeostasisEngine` -- Returns a new `HomeostasisEngine` instance. No arguments. Equivalent to `new HomeostasisEngine()`.

---

## Methods

### `assessAll(context: AgentContext): Promise<HomeostasisState>`

Full 6-dimension assessment. All dimensions are assessed in parallel via `Promise.all`. Used for Level 2-3 activities.

Returns a complete `HomeostasisState` with all 6 dimension states, `assessed_at` timestamp, and per-dimension `assessment_method`.

```typescript
const state = await engine.assessAll({
  sessionId: "abc-123",
  currentMessage: "Deploy the service to production",
  messageHistory: [
    { role: "user", content: "Let's deploy" },
    { role: "assistant", content: "I'll prepare the deployment." },
  ],
  retrievedFacts: [
    { content: "Production deploy requires CI green", confidence: 0.9 },
  ],
  retrievedProcedures: [
    { name: "standard-deploy", success_rate: 0.85 },
  ],
  lastMessageTime: new Date(Date.now() - 5 * 60 * 1000),
  hasAssignedTask: true,
})
// state.knowledge_sufficiency => "HEALTHY"
// state.certainty_alignment => "HIGH" (high-stakes keyword "production")
// state.communication_health => "HEALTHY" (5 min since last message)
```

### `assessQuick(context: AgentContext): Partial<HomeostasisState>`

Quick assessment of 3 dimensions only: `progress_momentum`, `communication_health`, `productive_engagement`. Synchronous (no async). Used for Level 0-1 activities where speed is critical.

Returns a `Partial<HomeostasisState>` -- only the 3 assessed dimensions plus `assessed_at` are populated. The `assessment_method` map is **not** included.

```typescript
const quick = engine.assessQuick({
  sessionId: "abc-123",
  currentMessage: "ok",
  messageHistory: [],
  lastMessageTime: new Date(Date.now() - 3 * 60 * 1000),
  hasAssignedTask: true,
})
// quick.progress_momentum => "HEALTHY"
// quick.communication_health => "HEALTHY"
// quick.productive_engagement => "HEALTHY"
// quick.knowledge_sufficiency => undefined
```

### `assessDimension(dimension: Dimension, context: AgentContext): Promise<DimensionAssessment>`

Assess a single named dimension. Dispatches to the appropriate private assessment method.

```typescript
const assessment = await engine.assessDimension("knowledge_sufficiency", context)
// assessment.dimension => "knowledge_sufficiency"
// assessment.state => "LOW" | "HEALTHY" | "HIGH"
// assessment.method => "computed"
// assessment.confidence => 0.6
// assessment.reason => "No relevant knowledge retrieved from memory"
```

### `getGuidance(state: HomeostasisState): GuidanceText | null`

Get actionable guidance for the highest-priority imbalanced dimension. Returns `null` if all dimensions are `HEALTHY`.

Loads guidance text from `server/engine/guidance.yaml` on first call, then caches in a module-level variable. Falls back to generic default guidance if the YAML file fails to load or parse.

When multiple dimensions are imbalanced, returns guidance for the dimension with the lowest priority number (highest priority). The `secondary` field comes from the YAML config, or falls back to a count of other imbalanced dimensions.

```typescript
const guidance = engine.getGuidance(state)
if (guidance) {
  // guidance.primary => "**Knowledge gap detected.** Before proceeding, consider:..."
  // guidance.secondary => "It's better to ask now than..."
  // guidance.dimensions => ["knowledge_sufficiency", "certainty_alignment"]
}
```

---

## Types

All types are defined in `server/engine/types.ts`.

### `Dimension`

```typescript
type Dimension =
  | "knowledge_sufficiency"
  | "certainty_alignment"
  | "progress_momentum"
  | "communication_health"
  | "productive_engagement"
  | "knowledge_application"
```

### `DimensionState`

```typescript
type DimensionState = "LOW" | "HEALTHY" | "HIGH"
```

### `AssessmentMethod`

```typescript
type AssessmentMethod = "computed" | "llm"
```

Currently all assessments use `"computed"`. The `"llm"` method is defined but not yet implemented.

### `AgentContext`

```typescript
interface AgentContext {
  sessionId: string
  currentMessage: string
  messageHistory: Array<{ role: "user" | "assistant"; content: string }>
  retrievedFacts?: Array<{ content: string; confidence: number }>
  retrievedProcedures?: Array<{ name: string; success_rate: number }>
  lastMessageTime?: Date
  currentTaskStartTime?: Date
  recentActionCount?: number
  hasAssignedTask?: boolean
  timeSpentResearching?: number   // milliseconds
  timeSpentBuilding?: number      // milliseconds
}
```

### `HomeostasisState`

```typescript
interface HomeostasisState {
  knowledge_sufficiency: DimensionState
  certainty_alignment: DimensionState
  progress_momentum: DimensionState
  communication_health: DimensionState
  productive_engagement: DimensionState
  knowledge_application: DimensionState
  assessed_at: Date
  assessment_method: Record<Dimension, AssessmentMethod>
}
```

### `DimensionAssessment`

```typescript
interface DimensionAssessment {
  dimension: Dimension
  state: DimensionState
  method: AssessmentMethod
  confidence: number    // 0-1
  reason?: string
}
```

### `GuidanceText`

```typescript
interface GuidanceText {
  primary: string       // Most important guidance
  secondary?: string    // Additional considerations
  dimensions: Dimension[]  // Which dimensions triggered this guidance
}
```

---

## Assessment Logic

All 6 dimensions currently use heuristic ("computed") assessments. No LLM assessments are implemented.

### 1. knowledge_sufficiency

Evaluated from `context.retrievedFacts` and `context.retrievedProcedures`.

| Condition | State | Confidence |
|---|---|---|
| 0 facts AND 0 procedures | LOW | 0.6 |
| Any procedure with `success_rate > 0.8` | HEALTHY | 0.75 |
| >20 facts AND avg confidence < 0.5 | HIGH | 0.65 |
| >=5 facts AND avg confidence > 0.7 | HEALTHY | 0.75 |
| Otherwise (few facts or low confidence) | LOW | 0.65 |

Rules are evaluated top-to-bottom; first match wins.

### 2. certainty_alignment

Evaluated from `context.currentMessage` using keyword substring matching (case-insensitive).

Uncertainty markers: `not sure`, `uncertain`, `might`, `maybe`, `i think`, `possibly`, `not confident`, `unclear`

High-stakes keywords: `delete`, `drop`, `remove`, `irreversible`, `production`, `deploy`, `publish`, `force push`, `hard reset`

| Condition | State | Confidence |
|---|---|---|
| Uncertainty marker + high-stakes keyword | LOW | 0.7 |
| No uncertainty + high-stakes keyword | HIGH | 0.65 |
| Otherwise | HEALTHY | 0.6 |

### 3. progress_momentum

Evaluated from `context.currentTaskStartTime` and `context.recentActionCount`.

| Condition | State | Confidence |
|---|---|---|
| No `currentTaskStartTime` | HEALTHY | 0.5 |
| >30 min on task AND <3 actions | LOW | 0.85 |
| <10 min on task AND >10 actions | HIGH | 0.8 |
| Otherwise | HEALTHY | 0.7 |

### 4. communication_health

Evaluated from `context.lastMessageTime`.

| Condition | State | Confidence |
|---|---|---|
| No `lastMessageTime` (first message) | HEALTHY | 1.0 |
| >10 min since last message | LOW | 0.9 |
| <2 min since last message | HIGH | 0.75 |
| 2-10 min since last message | HEALTHY | 0.85 |

### 5. productive_engagement

Evaluated from `context.hasAssignedTask`.

| Condition | State | Confidence |
|---|---|---|
| `hasAssignedTask` is false or undefined | LOW | 0.9 |
| `hasAssignedTask` is true | HEALTHY | 0.6 |

No HIGH state is produced by the computed assessment.

### 6. knowledge_application

Evaluated from `context.timeSpentResearching` and `context.timeSpentBuilding`.

| Condition | State | Confidence |
|---|---|---|
| Both are 0 or undefined (no time data) | HEALTHY | 0.4 |
| Research ratio > 80% | HIGH | 0.75 |
| Research ratio < 20% | LOW | 0.75 |
| Research ratio 20-80% | HEALTHY | 0.7 |

Research ratio = `timeSpentResearching / (timeSpentResearching + timeSpentBuilding)`.

---

## Guidance System

Guidance text is loaded from `server/engine/guidance.yaml`. Each dimension has `LOW` and `HIGH` entries with a `priority` number (1 = highest, 6 = lowest), a `primary` text, and a `secondary` text.

Priority assignments from the YAML:

| Priority | Dimension + State |
|---|---|
| 1 (highest) | `knowledge_sufficiency` LOW, `certainty_alignment` LOW |
| 2 | `progress_momentum` LOW, `productive_engagement` LOW, `knowledge_application` HIGH |
| 3 | `certainty_alignment` HIGH, `communication_health` LOW |
| 4 | `progress_momentum` HIGH, `productive_engagement` HIGH |
| 5 | `knowledge_sufficiency` HIGH, `knowledge_application` LOW |
| 6 (lowest) | `communication_health` HIGH |

When YAML loading fails, the fallback generates generic guidance with priority 3 for LOW states and priority 5 for HIGH states.

---

## Known Limitations

These were identified during Stage G reference scenario testing:

1. **All assessments are "computed" (heuristic).** No LLM-based assessments are implemented yet. The `"llm"` assessment method exists in the type system but is never produced.

2. **knowledge_sufficiency can be inflated by tangential facts.** Graphiti may return facts that are only loosely related to the current task. The engine counts them at face value, which can make knowledge appear sufficient when it is not (Stage G Finding 1).

3. **knowledge_application is effectively dormant.** The `timeSpentResearching` and `timeSpentBuilding` context fields are not populated by any current code path. The dimension always returns HEALTHY with confidence 0.4. This is a Phase 4 dependency.

4. **productive_engagement LOW is undetectable during conversations.** In practice, `hasAssignedTask` is always true when the agent is in a conversation, so this dimension always returns HEALTHY during active sessions.
