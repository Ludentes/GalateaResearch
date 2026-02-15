export type Priority = "interactive" | "batch"
export type CircuitState = "closed" | "open" | "half-open"

export class OllamaCircuitOpenError extends Error {
  remainingMs: number
  constructor(remainingMs: number) {
    super(`Ollama circuit breaker is open. Retry in ${remainingMs}ms`)
    this.name = "OllamaCircuitOpenError"
    this.remainingMs = remainingMs
  }
}

export class OllamaBackpressureError extends Error {
  queueDepth: number
  constructor(queueDepth: number) {
    super(`Ollama queue is full (depth=${queueDepth}). Try again later.`)
    this.name = "OllamaBackpressureError"
    this.queueDepth = queueDepth
  }
}

interface OllamaQueueConfig {
  maxQueueDepth: number
  circuitBreakerThreshold: number
  circuitBreakerCooldownMs: number
}

interface QueueItem {
  priority: Priority
  resolve: () => void
}

const DEFAULT_CONFIG: OllamaQueueConfig = {
  maxQueueDepth: 3,
  circuitBreakerThreshold: 3,
  circuitBreakerCooldownMs: 30_000,
}

export class OllamaQueue {
  private config: OllamaQueueConfig
  private active = false
  private queue: QueueItem[] = []
  private consecutiveFailures = 0
  private circuitOpenUntil = 0

  constructor(config?: Partial<OllamaQueueConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async enqueue<T>(
    fn: () => Promise<T>,
    priority: Priority = "batch",
  ): Promise<T> {
    this.checkCircuit()

    // Backpressure: reject batch if queue is full
    if (
      priority === "batch" &&
      this.queue.length >= this.config.maxQueueDepth
    ) {
      throw new OllamaBackpressureError(this.queue.length)
    }

    await this.waitForSlot(priority)

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    } finally {
      this.release()
    }
  }

  async acquireSlot(
    priority: Priority = "interactive",
  ): Promise<{ release: (success?: boolean) => void }> {
    this.checkCircuit()

    await this.waitForSlot(priority)

    let released = false
    return {
      release: (success = true) => {
        if (released) return
        released = true
        if (success) {
          this.onSuccess()
        } else {
          this.onFailure()
        }
        this.release()
      },
    }
  }

  get state(): {
    active: boolean
    queueDepth: number
    circuitState: CircuitState
  } {
    return {
      active: this.active,
      queueDepth: this.queue.length,
      circuitState: this.circuitStateValue,
    }
  }

  reset(): void {
    this.active = false
    this.queue = []
    this.consecutiveFailures = 0
    this.circuitOpenUntil = 0
  }

  // ── Private ──────────────────────────────────────────────

  private get circuitStateValue(): CircuitState {
    if (this.consecutiveFailures < this.config.circuitBreakerThreshold) {
      return "closed"
    }
    if (Date.now() >= this.circuitOpenUntil) {
      return "half-open"
    }
    return "open"
  }

  private checkCircuit(): void {
    const state = this.circuitStateValue
    if (state === "open") {
      throw new OllamaCircuitOpenError(this.circuitOpenUntil - Date.now())
    }
    // half-open and closed: allow through
  }

  private waitForSlot(priority: Priority): Promise<void> {
    if (!this.active) {
      this.active = true
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const item: QueueItem = { priority, resolve }

      if (priority === "interactive") {
        // Insert before first batch item (after any existing interactive items)
        const firstBatchIdx = this.queue.findIndex(
          (q) => q.priority === "batch",
        )
        if (firstBatchIdx === -1) {
          this.queue.push(item)
        } else {
          this.queue.splice(firstBatchIdx, 0, item)
        }
      } else {
        this.queue.push(item)
      }
    })
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      // Slot stays active; hand off to the next waiter
      next.resolve()
    } else {
      this.active = false
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0
  }

  private onFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.circuitOpenUntil = Date.now() + this.config.circuitBreakerCooldownMs
    }
  }
}

// Export singleton
export const ollamaQueue = new OllamaQueue()
