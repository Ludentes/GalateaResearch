# L2 Provider Architecture: Claude Code Haiku for Homeostasis Assessments

**Date:** 2026-03-16
**Status:** Implemented (3-level fallback), pool optimization deferred

## Problem

The homeostasis engine needs LLM-based semantic assessment (L2) for three dimensions that are hard to evaluate with heuristics alone:

- **certainty_alignment** — does agent confidence match available evidence?
- **knowledge_application** — is the agent balancing learning and doing?
- **knowledge_sufficiency** — are retrieved facts actually relevant to the message?

Each L2 call must classify a dimension as LOW / HEALTHY / HIGH based on context.

## Architecture Decision

### Provider: Claude Code Haiku via `ai-sdk-provider-claude-code`

We use Claude Code Haiku through the Vercel AI SDK provider rather than direct API calls. This keeps all LLM usage within the Claude Code subscription — no separate API keys needed.

Each `generateText()` call spawns a Claude Code CLI subprocess via `@anthropic-ai/claude-agent-sdk`'s `query()` function.

### Nested Session Fix

**Root cause:** The `ai-sdk-provider-claude-code` checks for a `CLAUDECODE` environment variable and refuses to start if it detects it's running inside another Claude Code session. When the dev server is launched from within Claude Code (or tests run from Claude Code), this variable is inherited.

**Fix:** Temporarily unset `CLAUDECODE` before spawning Haiku subprocesses, restore it after:

```typescript
const savedEnv = process.env.CLAUDECODE
delete process.env.CLAUDECODE
try {
  const result = await generateText({ model: claudeCode("haiku"), ... })
} finally {
  if (savedEnv) process.env.CLAUDECODE = savedEnv
}
```

**References:**
- [claude-agent-sdk-typescript #20](https://github.com/anthropics/claude-agent-sdk-typescript/issues/20) — "process exited with code 1" before IPC
- [claude-code-action #853](https://github.com/anthropics/claude-code-action/issues/853) — intermittent SDK crash within ~150ms

### 3-Level Provider Fallback

Each L2 assessment tries providers in order:

1. **Claude Code Haiku** — primary, highest quality (~8-12s including subprocess spawn)
2. **Ollama** (gemma3:12b) — local fallback, no network dependency (~2-4s)
3. **L1 heuristic** — zero-latency computed fallback (return `null` → caller keeps L1 value)

All attempts are traced via `emitEvent()` with structured attributes (provider, result, sessionId, error, fallback flag).

### Concurrency

certainty_alignment and knowledge_application run concurrently via `Promise.all`. knowledge_sufficiency runs after them (sequential). Each `generateText()` spawns an independent subprocess — no shared state or mutex needed.

**Confirmed:** Multiple concurrent Claude Code subprocesses work correctly once the `CLAUDECODE` env var is unset. No process-level locking issues observed.

### Timeout

All L2 calls use `cfg.l2.timeout_ms` (currently 15s). This accounts for:
- ~5-8s subprocess cold-start overhead ([claude-agent-sdk-typescript #34](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34))
- ~2-3s actual Haiku inference
- Network variance margin

### Caching (L0)

L2 results are cached per-dimension per-session with configurable TTL (default: 5 minutes for certainty_alignment, knowledge_application). Cached results bypass L2 entirely (0ms).

## Process Pool: Deferred Optimization

### What a pool would provide

- Eliminate ~12s cold-start per call by keeping N Haiku subprocesses warm
- Use `streamingInput: 'always'` from the Agent SDK to maintain long-lived sessions
- Semaphore-gated access (same pattern as existing `ollama-queue.ts`)
- Projected improvement: L2 latency from ~25s (3 sequential cold starts) to ~3-5s

### Why not now

1. **L0 caching** means most ticks skip L2 entirely — cold start is amortized
2. **Production message rate** is ~1/min per agent — 25s assessment is acceptable
3. **Main tick LLM call** (Sonnet for actual response) dominates total latency regardless
4. **More moving parts** = more failure modes for marginal gain
5. **No SDK support** for connection pooling — we'd build custom lifecycle management

### When to reconsider

- If L2 cache hit rate drops below 60%
- If tick latency SLO is defined and L2 becomes the bottleneck
- If agent density increases (many agents on one server)
- If Anthropic adds `poolSize` or daemon mode to the Agent SDK

### Implementation sketch (for future reference)

```typescript
// Warm pool using streamingInput to keep subprocesses alive
class HaikuPool {
  private pool: Array<{ session: AsyncGenerator; busy: boolean }>
  private semaphore: Semaphore

  async classify(prompt: string): Promise<string> {
    const permit = await this.semaphore.acquire()
    const worker = this.pool.find(w => !w.busy)
    worker.busy = true
    try {
      // Send prompt to existing warm session
      return await sendToSession(worker.session, prompt)
    } finally {
      worker.busy = false
      permit.release()
    }
  }
}
```

## File References

| File | Role |
|------|------|
| `server/engine/homeostasis-engine.ts` | L2 assessment functions, fallback chain |
| `server/engine/config.yaml` | L2 config (enabled, model, timeout, max_tokens) |
| `server/providers/claude-code.ts` | Claude Code model factory |
| `server/providers/ollama.ts` | Ollama model factory |
| `server/observation/emit.ts` | Structured event tracing |
| `server/providers/ollama-queue.ts` | Semaphore pattern reference for future pool |
