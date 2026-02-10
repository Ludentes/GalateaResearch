# ActivityRouter API Reference

> Source: `server/engine/activity-router.ts`
> Helpers: `server/engine/classification-helpers.ts`
> Types: `server/engine/types.ts`

Routes tasks to activity levels (0-3) based on complexity, risk, and knowledge requirements. Determines the appropriate model for each level.

## Factory

```typescript
import { createActivityRouter } from "~/engine/activity-router"

const router = createActivityRouter()
```

`createActivityRouter(): ActivityRouter` -- Returns a new `ActivityRouter` instance. No arguments. Equivalent to `new ActivityRouter()`.

---

## Methods

### `classify(task: Task, procedure: Procedure | null, homeostasis: HomeostasisState | null): Promise<ActivityClassification>`

Classify a task into one of 4 activity levels. The method enriches the task with computed flags (via `enrichTaskWithFlags`), then walks a decision tree.

**Decision tree (evaluated top-to-bottom, first match wins):**

1. **Level 0 (Direct):** `task.isToolCall` OR `task.isTemplate` is true
2. **Level 3 (Reflect):** `_needsReflexion(task, homeostasis)` returns true
3. **Level 1 (Pattern):** `hasProcedureMatch(procedure)` returns true
4. **Level 2 (Reason):** Default -- all remaining tasks

```typescript
const classification = await router.classify(
  { message: "How do I set up database migrations?", sessionId: "abc" },
  null,  // no matching procedure
  null,  // no homeostasis state
)
// classification.level => 3
// classification.reason => "Knowledge gap detected - requires research and reflection"
// classification.model => "sonnet"
// classification.skipMemory => false
// classification.skipHomeostasis => false
```

**Classification results by level:**

| Level | Model | skipMemory | skipHomeostasis |
|---|---|---|---|
| 0 (Direct) | `"none"` | true | true |
| 1 (Pattern) | `"haiku"` | false | true |
| 2 (Reason) | `"sonnet"` | false | false |
| 3 (Reflect) | `"sonnet"` | false | false |

### `selectModel(level: ActivityLevel): ModelSpec`

Get the model configuration for a given activity level. Loads from `config/models.yaml` (cached after first load), falls back to hardcoded defaults if the file does not exist or fails to parse.

**Note:** As of this writing, `config/models.yaml` does not exist in the repository. The hardcoded defaults are always used.

```typescript
const model = router.selectModel(2)
// model.id => "sonnet"
// model.provider => "anthropic"
// model.model_id => "claude-sonnet-4-5-20250929"
// model.characteristics => ["capable", "reasoning", "implementation"]
// model.suitable_for => [2, 3]
// model.cost_per_1k_tokens => 0.015
```

**Default model configuration:**

| Level | Model ID | Provider | Model ID (API) | Cost/1k tokens |
|---|---|---|---|---|
| 0 | `none` | `none` | `none` | 0 |
| 1 | `haiku` | `anthropic` | `claude-haiku-4-5-20251001` | 0.001 |
| 2 | `sonnet` | `anthropic` | `claude-sonnet-4-5-20250929` | 0.015 |
| 3 | `sonnet` | `anthropic` | `claude-sonnet-4-5-20250929` | 0.015 |

If no model is configured for a given level, falls back to `sonnet` with a console warning.

---

## Level 3 Triggers

The private method `_needsReflexion(task, homeostasis)` determines whether a task requires the Reflexion loop. It checks the following conditions in order (first match wins):

1. `task.hasKnowledgeGap === true` -- Knowledge gap markers detected in the message
2. `task.isHighStakes && task.isIrreversible` -- Both flags must be true
3. `homeostasis.knowledge_sufficiency === "LOW" && task.isHighStakes` -- Requires homeostasis state
4. `homeostasis.certainty_alignment === "LOW" && task.isIrreversible` -- Requires homeostasis state

If `homeostasis` is `null`, conditions 3 and 4 are skipped.

---

## Classification Helpers

Defined in `server/engine/classification-helpers.ts`. These are deterministic, pattern-based checks with no LLM calls.

### `enrichTaskWithFlags(task: Task): Task`

Runs all helper checks and returns a new task object with all boolean flags computed. Flags already set on the input task are preserved (not overwritten).

```typescript
const enriched = enrichTaskWithFlags({
  message: "force push to main",
  sessionId: "abc",
})
// enriched.isToolCall => false
// enriched.isTemplate => false
// enriched.isIrreversible => true (matches "force push")
// enriched.isHighStakes => false
// enriched.hasKnowledgeGap => false
```

### `isDirectToolCall(task: Task): boolean`

Returns `task.isToolCall ?? false`. No message analysis.

### `isTemplateMessage(task: Task): boolean`

Returns `true` if `task.isTemplate` is true, OR if the message matches one of these regex patterns (case-insensitive, after trim):

- `^done$`
- `^ok$`
- `^yes$`
- `^no$`
- `^ready$`
- `^completed?$` (matches "complete" or "completed")
- `^task completed$`
- `^pr created$`
- `^tests? (pass|passing)$` (matches "test pass", "tests passing", etc.)

### `isIrreversibleAction(task: Task): boolean`

Returns `true` if `task.isIrreversible` is true, OR if the lowercased message contains any of these substrings:

`force push`, `force-push`, `--force`, `git push -f`, `drop table`, `drop database`, `delete database`, `rm -rf`, `delete production`, `prod deploy`, `deploy to production`, `hard reset`, `git reset --hard`, `delete branch`, `prune`, `truncate table`

**Uses exact substring match** (`message.includes(keyword)`), not word-boundary matching.

### `isHighStakesAction(task: Task): boolean`

Returns `true` if `task.isHighStakes` is true, OR if the lowercased message contains any of these substrings:

`production`, `deploy`, `release`, `publish`, `security`, `authentication`, `authorization`, `permissions`, `credentials`, `database migration`, `schema change`, `public api`, `breaking change`

**Uses exact substring match** (`message.includes(keyword)`).

### `hasKnowledgeGap(task: Task): boolean`

Returns `true` if `task.hasKnowledgeGap` is true, OR if the lowercased message contains any of these substrings:

`how do i`, `how to`, `not sure`, `don't know`, `unclear`, `help me`, `what is`, `explain`, `never done`, `first time`

### `hasProcedureMatch(procedure: Procedure | null): boolean`

Returns `true` if `procedure` is not null AND:
- `procedure.success_rate >= 0.8`
- `procedure.times_used >= 5`

Both conditions must be met.

---

## Types

### `ActivityLevel`

```typescript
type ActivityLevel = 0 | 1 | 2 | 3
```

### `ModelType`

```typescript
type ModelType = "none" | "haiku" | "sonnet"
```

### `ActivityClassification`

```typescript
interface ActivityClassification {
  level: ActivityLevel
  reason: string
  model: ModelType
  skipMemory: boolean       // Skip memory retrieval for this activity
  skipHomeostasis: boolean  // Skip homeostasis assessment for this activity
}
```

### `Task`

```typescript
interface Task {
  message: string
  sessionId: string
  requiresLLM?: boolean
  isToolCall?: boolean
  isTemplate?: boolean
  isIrreversible?: boolean
  hasKnowledgeGap?: boolean
  isHighStakes?: boolean
}
```

### `Procedure`

```typescript
interface Procedure {
  id: number
  name: string
  trigger_pattern: string
  trigger_context: string[]
  steps: Array<{ order: number; instruction: string; tool_call?: string }>
  success_rate: number
  times_used: number
}
```

### `ModelSpec`

```typescript
interface ModelSpec {
  id: string
  provider: string
  model_id: string
  characteristics: string[]
  suitable_for: ActivityLevel[]
  cost_per_1k_tokens: number
}
```

---

## Known Limitations

These were identified during Stage G reference scenario testing:

1. **`isIrreversibleAction` uses exact substring matching.** The check `message.includes("deploy to production")` will match "deploy to production" but NOT "deploy the profile service to production" because the substring is not present as-is. This means multi-word irreversible patterns can be circumvented by inserting words between the keywords (Stage G Finding 2).

2. **`isHighStakes` alone does not trigger Level 3.** A message like "deploy to staging" will set `isHighStakes = true` (matches "deploy") but will only reach Level 3 if one of the other conditions is also met: `hasKnowledgeGap`, `isIrreversible`, or a LOW homeostasis dimension. Without these, it routes to Level 2 (Stage G Finding 2).

3. **`config/models.yaml` does not exist.** The router always uses the hardcoded default model configuration. The YAML loading path exists but is untested in production.
