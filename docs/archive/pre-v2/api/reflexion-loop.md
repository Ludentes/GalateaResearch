# ReflexionLoop API Reference

> Source: `server/engine/reflexion-loop.ts`
> Types: `server/engine/types.ts`

Implements the Draft -> Critique -> Revise loop for Level 3 tasks. Used when tasks require deep reasoning, have knowledge gaps, or involve high-stakes/irreversible actions.

## Factory

```typescript
import { createReflexionLoop } from "~/engine/reflexion-loop"
import type { LanguageModel } from "ai"

const loop = createReflexionLoop(model)
```

`createReflexionLoop(model: LanguageModel): ReflexionLoop` -- Returns a new `ReflexionLoop` instance. Equivalent to `new ReflexionLoop(model)`.

## Constructor

```typescript
new ReflexionLoop(model: LanguageModel)
```

Takes an AI SDK `LanguageModel` instance. This model is used for all `generateText` calls within the loop (drafting, revising, and critiquing).

---

## Methods

### `execute(task: Task, context: AgentContext, maxIterations?: number): Promise<ReflexionResult>`

Run the full Reflexion loop. Default `maxIterations` is 3.

```typescript
const result = await loop.execute(
  { message: "How do I set up database migrations?", sessionId: "abc" },
  {
    sessionId: "abc",
    currentMessage: "How do I set up database migrations?",
    messageHistory: [],
    retrievedFacts: [
      { content: "Use drizzle-kit for migrations", confidence: 0.85 },
    ],
    retrievedProcedures: [],
  },
  3,  // maxIterations (optional, default: 3)
)
// result.success => true (if critique passed) or false (if max iterations hit)
// result.final_draft => "To set up database migrations..."
// result.iterations => [{...}, {...}]
// result.total_llm_calls => 4 (2 per iteration: draft + critique)
// result.total_tokens => 2847
```

---

## Loop Flow

```
Iteration 1:
  1. Generate initial draft (generateText with task + context + retrieved knowledge)
  2. Gather evidence (from context.retrievedFacts and context.retrievedProcedures)
  3. Generate critique (LLM evaluates draft against evidence, returns JSON)
  4. If critique.passes === true -> return {success: true, final_draft: draft}
  5. If iteration === maxIterations -> return {success: false, final_draft: draft}

Iteration 2+:
  1. Revise draft (generateText with previous draft + critique feedback)
  2. Gather evidence (same source: context fields)
  3. Generate critique (LLM evaluates revised draft)
  4. Same exit conditions as above
```

### Step details

**Generate Initial Draft** (`_generateInitialDraft`):
- Includes `task.message` in the prompt
- Includes last 3 messages from `context.messageHistory`
- Includes all `context.retrievedFacts` with confidence scores
- Includes all `context.retrievedProcedures` with success rates
- Single `generateText` call

**Gather Evidence** (`_gatherEvidence`):
- Converts `context.retrievedFacts` to `Evidence` objects with `source: "memory"`
- Converts `context.retrievedProcedures` to `Evidence` objects with `source: "memory"`
- No external search, no LLM call, no codebase scanning
- Returns empty array if no context data

**Generate Critique** (`_generateCritique`):
- Prompts LLM to identify issues in 3 categories: MISSING, UNSUPPORTED, INCORRECT
- Expects JSON response with `issues[]`, `confidence`, and `passes` boolean
- Single `generateText` call

**Revise Draft** (`_reviseDraft`):
- Includes original task, previous draft, all critique issues with severity and suggested fixes
- Includes last 3 messages from `context.messageHistory`
- Includes `context.retrievedFacts` (without confidence scores in revision prompt)
- Single `generateText` call

---

## Exit Conditions

| Condition | `success` value |
|---|---|
| `critique.passes === true` (issues empty or all minor) | `true` |
| `iterationNumber === maxIterations` (exhausted attempts) | `false` |

---

## Critique Pass/Fail Rules

The LLM is prompted to set `passes` based on:
- `true` if the `issues` array is empty OR all issues have severity `"minor"`
- `false` if any issue has severity `"major"` or `"critical"`

The actual pass/fail decision is made by the LLM, not enforced in code. The code uses whatever `passes` value the LLM returns.

---

## Token Tracking

Each `generateText` call returns `usage.totalTokens`. The loop accumulates these:

- `total_tokens`: Sum of `usage.totalTokens` from every `generateText` call across all iterations
- `total_llm_calls`: Count of `generateText` calls. Per iteration: 1 (draft or revise) + 1 (critique) = 2. Evidence gathering does not make LLM calls.

For a 3-iteration run: up to 6 LLM calls and their accumulated token counts.

---

## Graceful Degradation

**Critique JSON parse failure:** If the LLM returns text that cannot be parsed as JSON (e.g., wraps it in markdown code fences), the catch block treats it as a pass:

```typescript
// From _generateCritique catch block:
critique: {
  issues: [],
  confidence: 0.5,
  passes: true,
}
```

This means a malformed critique always results in the current draft being accepted.

**Loop-level failure:** If the `ReflexionLoop.execute()` method itself throws an unhandled error, the caller is expected to catch it and fall back to direct LLM generation (no reflexion). This fallback is handled by the caller, not by the ReflexionLoop class.

---

## Types

### `ReflexionResult`

```typescript
interface ReflexionResult {
  final_draft: string
  iterations: ReflexionIteration[]
  total_llm_calls: number
  total_tokens: number      // Total tokens used across all LLM calls
  success: boolean           // true if critique passed, false if max iterations hit
}
```

### `ReflexionIteration`

```typescript
interface ReflexionIteration {
  iteration_number: number
  draft: string
  evidence: Evidence[]
  critique: Critique
  revised: boolean           // false for iteration 1, true for subsequent
}
```

### `Evidence`

```typescript
interface Evidence {
  source: "memory" | "codebase" | "documentation"
  content: string
  relevance: number          // 0-1
  supports_claim?: string    // Description of what this evidence supports
}
```

Currently, only `"memory"` is used as a source. The `"codebase"` and `"documentation"` sources are defined in the type but not produced by any code path.

### `Critique`

```typescript
interface Critique {
  issues: Issue[]
  confidence: number         // 0-1
  passes: boolean            // Does draft pass quality bar?
}
```

### `Issue`

```typescript
interface Issue {
  type: "missing" | "unsupported" | "incorrect"
  description: string
  severity: "minor" | "major" | "critical"
  suggested_fix?: string
}
```

---

## Known Limitations

These were identified during Stage G reference scenario testing:

1. **Critique JSON parse issue.** LLMs frequently wrap JSON responses in markdown code fences (`` ```json ... ``` ``). The parser uses `JSON.parse(result.text)` directly, which fails on fenced output. The fallback treats this as a pass, meaning the loop often exits after 1 iteration with the unreviewed initial draft accepted (Stage G Finding 3).

2. **Evidence gathering is context-only.** The `_gatherEvidence` method only reads from `context.retrievedFacts` and `context.retrievedProcedures`. It does not search the codebase, fetch documentation, or make any external calls. Evidence is the same across all iterations.

3. **Level 3 cannot stream.** The Reflexion loop uses `generateText` (not `streamText`), so it returns the complete final draft as a single string. The caller cannot stream partial results to the user.

4. **3-4x slower than Level 2.** In testing with Ollama, Level 3 tasks took 110-145 seconds compared to 15-65 seconds for Level 2. This is due to multiple sequential LLM calls per iteration.

5. **Revision prompt omits fact confidence.** The `_reviseDraft` method includes retrieved facts but strips the confidence scores (unlike `_generateInitialDraft` which includes them). This is a minor inconsistency in the prompt construction.
