# Galatea Codebase: Existing Retry Mechanisms & Utilities

## Summary

The Galatea codebase has retry logic distributed across multiple layers, with no dedicated retry utility library. Instead, retries are implemented contextually for specific use cases.

---

## Existing Retry Mechanisms

### 1. **Temperature Escalation Retry** (`knowledge-extractor.ts`)
**Location**: `/home/newub/w/galatea/server/memory/knowledge-extractor.ts`

**Purpose**: Handle LLM token extraction failures with graceful degradation.

**Implementation**:
```typescript
export async function extractWithRetry(
  turns: TranscriptTurn[],
  model: LanguageModel,
  source: string,
  temperatures = [0, 0.3, 0.7],
  opts?: { prompt?: string; useQueue?: boolean },
): Promise<KnowledgeEntry[]>
```

**Strategy**:
- First attempt: temperature 0 (deterministic, lower variance)
- If fails, retry with temperature 0.3, then 0.7
- Different temperatures produce different token distributions
- Returns empty array `[]` if all attempts fail (graceful degradation, not error throwing)
- Logs warnings at each failure stage

**Relevant Files**:
- `/home/newub/w/galatea/server/memory/knowledge-extractor.ts`
- `/home/newub/w/galatea/server/memory/__tests__/knowledge-extractor.test.ts` (482 lines)
- `/home/newub/w/galatea/server/__tests__/integration/hybrid-extraction-e2e.test.ts` (441 lines)

---

### 2. **Circuit Breaker Pattern with Queue** (`ollama-queue.ts`)
**Location**: `/home/newub/w/galatea/server/providers/ollama-queue.ts`

**Purpose**: Manage Ollama service availability, prevent retry storms, and handle backpressure.

**Implementation Elements**:

#### Circuit States
```typescript
export type CircuitState = "closed" | "open" | "half-open"

export class OllamaCircuitOpenError extends Error {
  remainingMs: number
  constructor(remainingMs: number) {
    super(`Ollama circuit breaker is open. Retry in ${remainingMs}ms`)
  }
}
```

#### Queue Configuration
```typescript
interface OllamaQueueConfig {
  maxQueueDepth: number                    // Default: 3
  circuitBreakerThreshold: number          // Default: 3 consecutive failures
  circuitBreakerCooldownMs: number         // Default: 30,000ms
}
```

#### Backpressure Handling
```typescript
export class OllamaBackpressureError extends Error {
  queueDepth: number
  constructor(queueDepth: number) {
    super(`Ollama queue is full (depth=${queueDepth}). Try again later.`)
  }
}
```

**Strategy**:
- **Queue-based concurrency**: Enqueues requests with priority support
- **Circuit Breaker**: Opens after N consecutive failures, stays open for cooldown period
- **Backpressure**: Rejects batch tasks if queue depth exceeds max
- **Priority-aware**: Distinguishes "interactive" vs "batch" priority tasks
- Error types signal callers when to retry vs when to wait

**Relevant Files**:
- `/home/newub/w/galatea/server/providers/ollama-queue.ts`
- `/home/newub/w/galatea/server/providers/__tests__/ollama-queue-integration.test.ts`

---

### 3. **Extraction Configuration Max Retries**
**Location**: `/home/newub/w/galatea/server/engine/config.ts`

**Purpose**: Control retry behavior during knowledge extraction pipeline.

**Configuration**:
```typescript
export interface ExtractionConfig {
  chunk_size: number
  default_temperature: number
  max_retries: number                      // Configurable via YAML
  tool_input_truncation: number
  novelty_filter: boolean
  inferred_confidence_cap: number
  auto_approve_explicit_threshold: number
}
```

**Configuration Source**: `/home/newub/w/galatea/server/engine/config.yaml`

---

### 4. **Extraction Pipeline Retry Logic**
**Location**: `/home/newub/w/galatea/server/memory/extraction-pipeline.ts`

**Purpose**: Orchestrate chunk-by-chunk extraction with error handling.

**Relevant Test Files**:
- `/home/newub/w/galatea/server/memory/__tests__/extraction-pipeline.test.ts` (482 lines)

---

### 5. **Work Arc Retry Mechanism** (Coding Adapter)
**Location**: `/home/newub/w/galatea/server/agent/coding-adapter/`

**Purpose**: Handle task retry with narrower scope in automated coding work.

**Reference**: Test "preserves error details for retry with narrower scope" in:
- `/home/newub/w/galatea/server/agent/coding-adapter/__tests__/work-arc.test.ts`

---

## Utility Files

### Current Utilities (`server/utils/`)
```
/home/newub/w/galatea/server/utils/
├── startup-time.ts      (692 bytes)
└── validate-email.ts    (1037 bytes)
```

**Note**: There is no `server/lib/` directory. Utilities are minimal.

---

## Directory Structure

```
server/
├── agent/                  # Agent orchestration and adapters
├── context/               # Context management
├── dashboard/             # Dashboard routes
├── db/                    # Database schema and migrations
├── discord/               # Discord integration
├── engine/                # Homeostasis engine (config, core)
├── functions/             # Callable functions
├── memory/                # Knowledge extraction and memory management
├── observation/           # Observation recording
├── plugins/               # Plugin system
├── providers/             # External provider clients (Ollama, etc.)
├── routes/                # API routes
├── utils/                 # Minimal utility helpers
└── __tests__/             # Integration tests
```

---

## Patterns Identified

### 1. No Generic Retry Utility
- No shared `retry()` utility function with exponential backoff
- No `withRetry()` wrapper or decorator
- Retries implemented contextually in specific modules

### 2. Error Types Signal Behavior
- `OllamaCircuitOpenError`: Signals "wait and retry later"
- `OllamaBackpressureError`: Signals "queue is full"
- Custom error classes allow caller to respond appropriately

### 3. Temperature-Based Retry for LLM
- Unique strategy: retry with different temperature values
- Handles non-deterministic LLM behavior
- Useful when output variance is the recovery strategy

### 4. Configuration-Driven
- `max_retries` in `config.ts` ties to YAML configuration
- Allows runtime tuning without code changes

---

## Recommendations for Additional Retry Utilities

If you need to add a generic retry mechanism:

1. **Exponential backoff helper**: For API/network retries
   ```typescript
   export async function withExponentialBackoff<T>(
     fn: () => Promise<T>,
     options?: {
       maxAttempts?: number
       initialDelayMs?: number
       maxDelayMs?: number
       backoffMultiplier?: number
     }
   ): Promise<T>
   ```

2. **Retry with jitter**: For preventing thundering herd
3. **Conditional retry**: Inspect error type to decide if retry is appropriate
4. **Timeout-aware retry**: Track elapsed time across attempts

---

## Files to Reference

- **Main config**: `/home/newub/w/galatea/server/engine/config.ts` (341 lines)
- **Queue implementation**: `/home/newub/w/galatea/server/providers/ollama-queue.ts`
- **Temperature retry**: `/home/newub/w/galatea/server/memory/knowledge-extractor.ts`
- **Extraction pipeline**: `/home/newub/w/galatea/server/memory/extraction-pipeline.ts`
- **Circuit breaker tests**: `/home/newub/w/galatea/server/providers/__tests__/ollama-queue-integration.test.ts`

