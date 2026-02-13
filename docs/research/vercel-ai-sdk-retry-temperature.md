# Vercel AI SDK: Per-Retry Temperature Escalation Research

**Date:** 2026-02-13
**SDK versions investigated:** AI SDK v5 (stable), v6 (latest)

## TL;DR

The Vercel AI SDK does **not** support per-retry parameter modification (temperature escalation, model switching, etc.). The built-in retry mechanism replays the **exact same closure** with identical parameters on every retry. This is confirmed by reading the actual source code. `experimental_repairText` only repairs output text, not the next request. The `ai-sdk-ollama` package adds JSON repair and schema recovery on top, but no temperature escalation either.

---

## 1. Does `generateObject` / `generateText` `maxRetries` support changing parameters between retries?

**No.** The retry mechanism is a simple closure replay.

### Source code evidence

From `packages/ai/src/util/retry-with-exponential-backoff.ts`:

```typescript
export type RetryFunction = <OUTPUT>(
  fn: () => PromiseLike<OUTPUT>,
) => PromiseLike<OUTPUT>;
```

The retry function accepts a zero-argument thunk `fn: () => PromiseLike<OUTPUT>` and simply re-invokes it:

```typescript
async function _retryWithExponentialBackoff<OUTPUT>(
  f: () => PromiseLike<OUTPUT>,
  { maxRetries, delayInMs, backoffFactor, abortSignal },
  errors: unknown[] = [],
): Promise<OUTPUT> {
  try {
    return await f();  // <-- same function, same closure, same parameters
  } catch (error) {
    // ... exponential backoff delay ...
    return _retryWithExponentialBackoff(f, { /* increased delay */ }, newErrors);
  }
}
```

In `generate-object.ts`, the retry wraps a fixed closure:

```typescript
const generateResult = await retry(() =>
  recordSpan({
    // ... all parameters (callSettings, promptMessages, etc.) are
    //     captured from the outer scope and never modified
    fn: async span => {
      const result = await model.doGenerate({
        ...prepareCallSettings(settings),  // settings is const
        prompt: promptMessages,            // promptMessages is const
        // ...
      });
    },
  }),
);
```

**Conclusion:** `maxRetries` only controls how many times the exact same request is replayed. There is no hook, callback, or mechanism to modify temperature, model, or any other parameter between retries.

### What triggers a retry?

Only `APICallError` instances where `error.isRetryable === true`. Typically: HTTP 429 (rate limit), 503 (service unavailable), and similar transient errors. Schema validation failures (`NoObjectGeneratedError`) are NOT retried by this mechanism.

---

## 2. Does `experimental_repairText` allow modifying the next request's parameters?

**No.** It only repairs the raw output text, not the request.

### Source code evidence

From `packages/ai/src/generate-object/repair-text.ts`:

```typescript
export type RepairTextFunction = (options: {
  text: string;
  error: JSONParseError | TypeValidationError;
}) => Promise<string | null>;
```

The function signature takes:
- `text`: the raw model output string
- `error`: the parsing/validation error

It returns `string | null` -- either repaired JSON text or null if repair is impossible.

From `parse-and-validate-object-result.ts`:

```typescript
// Called AFTER the model has already responded, OUTSIDE the retry loop
const object = await parseAndValidateObjectResultWithRepair(
  result,           // raw text from model
  outputStrategy,   // schema validator
  repairText,       // the repair function
  { response, usage, finishReason },
);
```

**Key detail:** `repairText` runs **after** the retry loop completes. It does not trigger another LLM call. It only attempts to fix malformed JSON or type mismatches in the already-received response. There is no way to influence the next request's parameters through this mechanism.

---

## 3. Does `ai-sdk-ollama` (jagreehal) have retry-related configuration?

**Partially.** It has its own reliability layer, but no temperature escalation.

### `ObjectGenerationOptions` interface

```typescript
export interface ObjectGenerationOptions {
  maxRetries?: number;              // default 3
  attemptRecovery?: boolean;        // default true
  useFallbacks?: boolean;           // default true
  fallbackValues?: Record<string, unknown>;
  generationTimeout?: number;
  fixTypeMismatches?: boolean;      // default true
  repairText?: RepairTextFunction;  // custom repair function
  enableTextRepair?: boolean;       // default true (uses jsonrepair + enhancedRepairText)
}
```

The `ai-sdk-ollama` package provides:

1. **JSON repair cascade:** `jsonrepair` library first, then a custom `enhancedRepairText` that handles 14+ malformed JSON patterns (smart quotes, Python constants, unquoted keys, markdown code blocks, incomplete objects, etc.)
2. **Schema coercion:** Handles array-vs-object mismatches, extracts objects from single-element arrays, wraps objects in arrays when schema expects arrays.
3. **Type mismatch fixing:** Coerces string-to-number, string-to-boolean, etc.
4. **Fallback values:** Generates schema-compliant defaults when all repair attempts fail.
5. **Retry loop:** via `createReliableObjectGeneration` -- but it calls `generateObjectFn(generationOptions)` with the **same options** every time.

**No temperature escalation, no parameter modification between retries.**

---

## 4. Does `generateObject` accept a `temperature` parameter?

**Yes.** From the source code JSDoc:

```typescript
/**
 * @param temperature - Temperature setting.
 * The value is passed through to the provider. The range depends on the provider and model.
 * It is recommended to set either `temperature` or `topP`, but not both.
 */
```

Usage:

```typescript
const result = await generateObject({
  model: ollama('llama3.1'),
  schema: z.object({ name: z.string(), age: z.number() }),
  prompt: 'Generate a person',
  temperature: 0.7,      // works
  maxRetries: 3,          // also works, but retries use same temperature
});
```

**Note:** In AI SDK v6, `generateObject` is deprecated. Use `generateText` with `output`:

```typescript
const { output } = await generateText({
  model: ollama('llama3.1'),
  output: Output.object({ schema: z.object({ name: z.string() }) }),
  prompt: 'Generate a person',
  temperature: 0.7,
});
```

Both accept `temperature`. Neither supports per-retry temperature changes.

---

## 5. Community requests and workarounds

### GitHub Discussion #3387: "Switching providers/models during retries"

- Users requested the ability to switch providers, models, and configuration (including temperature) between retries
- Official response pointed to the middleware system in AI SDK v5 as a possible approach
- Community recommended the [`ai-retry`](https://github.com/zirkelc/ai-retry) package

### GitHub Issue #2636: "Retry strategies and fallbacks"

- 59+ upvotes requesting fallback model support
- Assigned to v7.0 milestone
- No official implementation yet

### GitHub Issue #4842: "Custom Retry Callback"

- Requested an `onRetry` callback to customize delay/behavior per retry
- No implementation

### Workarounds for temperature escalation

**Option A: Manual retry loop (recommended)**

```typescript
async function generateWithTemperatureEscalation<T>(options: {
  model: LanguageModel;
  schema: z.ZodSchema<T>;
  prompt: string;
  temperatures: number[];  // e.g., [0.0, 0.3, 0.7, 1.0]
}): Promise<T> {
  const errors: Error[] = [];

  for (const temp of options.temperatures) {
    try {
      const result = await generateObject({
        model: options.model,
        schema: options.schema,
        prompt: options.prompt,
        temperature: temp,
        maxRetries: 0,  // disable built-in retries
      });
      return result.object;
    } catch (error) {
      errors.push(error as Error);
    }
  }

  throw new Error(`All temperature attempts failed: ${errors.map(e => e.message).join('; ')}`);
}
```

**Option B: `ai-retry` package**

The `ai-retry` package supports switching models between retries but does NOT support changing temperature or other generation parameters. It wraps the model, not the call options.

**Option C: AI SDK middleware (v5+)**

The middleware system could theoretically intercept and modify calls, but there is no documented pattern for temperature escalation.

---

## Summary table

| Feature | Supported? | Notes |
|---------|-----------|-------|
| `temperature` param on `generateObject` | Yes | Passed through to provider |
| `temperature` param on `generateText` (v6) | Yes | Same behavior |
| `maxRetries` replays same request | Yes | No parameter modification |
| Per-retry temperature change | **No** | Must implement manually |
| `experimental_repairText` modifies next request | **No** | Only repairs output text |
| `ai-sdk-ollama` temperature escalation | **No** | Has JSON repair, not param modification |
| `ai-retry` temperature escalation | **No** | Only switches models |
| Official planned support | Maybe v7 | Issue #2636 assigned to v7.0 |

## Sources

- [AI SDK generateObject API reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object)
- [AI SDK Core Settings](https://ai-sdk.dev/docs/ai-sdk-core/settings)
- [GitHub Discussion #3387: Switching providers/models during retries](https://github.com/vercel/ai/discussions/3387)
- [GitHub Issue #4842: Custom Retry Callback](https://github.com/vercel/ai/issues/4842)
- [GitHub Issue #2636: Retry strategies and fallbacks](https://github.com/vercel/ai/issues/2636)
- [ai-retry package](https://github.com/zirkelc/ai-retry)
- [ai-sdk-ollama package](https://github.com/jagreehal/ai-sdk-ollama)
- [AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6)
- [AI SDK v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
