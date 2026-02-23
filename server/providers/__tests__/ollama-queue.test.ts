// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  OllamaBackpressureError,
  OllamaCircuitOpenError,
  OllamaQueue,
} from "../ollama-queue"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("OllamaQueue", () => {
  let queue: OllamaQueue

  beforeEach(() => {
    queue = new OllamaQueue({
      maxQueueDepth: 3,
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 50,
    })
  })

  afterEach(() => {
    queue.reset()
  })

  // ── Semaphore ──────────────────────────────────────────────

  it("serializes concurrent calls", async () => {
    const order: number[] = []

    const mkTask = (id: number, ms: number) => () =>
      new Promise<number>((resolve) => {
        order.push(id)
        setTimeout(() => resolve(id), ms)
      })

    const p1 = queue.enqueue(mkTask(1, 30), "batch")
    const p2 = queue.enqueue(mkTask(2, 10), "batch")
    const p3 = queue.enqueue(mkTask(3, 10), "batch")

    await Promise.all([p1, p2, p3])

    // Task functions are invoked one at a time, so each starts only after the previous resolves.
    // order captures when each fn *starts*.
    expect(order).toEqual([1, 2, 3])
  })

  it("prioritizes interactive over batch", async () => {
    const order: number[] = []

    // Hold the slot with a slow call
    const slow = queue.enqueue(
      () =>
        delay(40).then(() => {
          order.push(0)
          return 0
        }),
      "batch",
    )

    // While slot is busy, queue a batch then an interactive
    const batch = queue.enqueue(() => {
      order.push(1)
      return Promise.resolve(1)
    }, "batch")
    const interactive = queue.enqueue(() => {
      order.push(2)
      return Promise.resolve(2)
    }, "interactive")

    await Promise.all([slow, batch, interactive])

    // Interactive (2) should run before the batch (1)
    expect(order).toEqual([0, 2, 1])
  })

  // ── Backpressure ───────────────────────────────────────────

  it("rejects batch requests when queue is full", async () => {
    // Hold the slot
    const hold = queue.enqueue(() => delay(100), "batch")

    // Fill the queue to maxQueueDepth (3)
    const q1 = queue.enqueue(() => delay(10), "batch")
    const q2 = queue.enqueue(() => delay(10), "batch")
    const q3 = queue.enqueue(() => delay(10), "batch")

    // Next batch should be rejected
    await expect(queue.enqueue(() => delay(10), "batch")).rejects.toThrow(
      OllamaBackpressureError,
    )

    await Promise.all([hold, q1, q2, q3])
  })

  it("allows interactive requests even when queue is full", async () => {
    // Hold the slot
    const hold = queue.enqueue(() => delay(100), "batch")

    // Fill the queue
    const q1 = queue.enqueue(() => delay(10), "batch")
    const q2 = queue.enqueue(() => delay(10), "batch")
    const q3 = queue.enqueue(() => delay(10), "batch")

    // Interactive should NOT throw
    const interactive = queue.enqueue(
      () => Promise.resolve("ok"),
      "interactive",
    )

    const results = await Promise.all([hold, q1, q2, q3, interactive])
    expect(results[4]).toBe("ok")
  })

  // ── Circuit Breaker ────────────────────────────────────────

  it("opens circuit after N consecutive failures", async () => {
    const err = new Error("ollama down")

    // Trip the circuit with 3 consecutive failures
    for (let i = 0; i < 3; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    expect(queue.state.circuitState).toBe("open")

    // Next enqueue should immediately reject with circuit open error
    await expect(
      queue.enqueue(() => Promise.resolve("ok"), "batch"),
    ).rejects.toThrow(OllamaCircuitOpenError)
  })

  it("transitions to half-open after cooldown", async () => {
    const err = new Error("ollama down")

    // Trip circuit
    for (let i = 0; i < 3; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    expect(queue.state.circuitState).toBe("open")

    // Wait past cooldown (50ms configured)
    await delay(60)

    expect(queue.state.circuitState).toBe("half-open")

    // Should be allowed to execute (half-open probe)
    const result = await queue.enqueue(() => Promise.resolve("probe"), "batch")
    expect(result).toBe("probe")
  })

  it("closes circuit on successful half-open probe", async () => {
    const err = new Error("ollama down")

    for (let i = 0; i < 3; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    await delay(60)

    // Successful probe
    await queue.enqueue(() => Promise.resolve("ok"), "batch")

    expect(queue.state.circuitState).toBe("closed")
  })

  it("re-opens circuit on failed half-open probe", async () => {
    const err = new Error("ollama down")

    for (let i = 0; i < 3; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    await delay(60)
    expect(queue.state.circuitState).toBe("half-open")

    // Failed probe
    await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})

    expect(queue.state.circuitState).toBe("open")
  })

  it("resets consecutive failures on success", async () => {
    const err = new Error("ollama down")

    // Fail N-1 times (2)
    for (let i = 0; i < 2; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    // Succeed once — resets counter
    await queue.enqueue(() => Promise.resolve("ok"), "batch")

    // Fail N-1 more times (2)
    for (let i = 0; i < 2; i++) {
      await queue.enqueue(() => Promise.reject(err), "batch").catch(() => {})
    }

    // Circuit should still be closed (never hit threshold)
    expect(queue.state.circuitState).toBe("closed")
  })

  // ── acquireSlot ────────────────────────────────────────────

  it("acquireSlot blocks until slot available", async () => {
    const slot1 = await queue.acquireSlot("interactive")

    // Try to acquire another — should not resolve quickly
    const second = queue.acquireSlot("interactive")

    const raceResult = await Promise.race([
      second.then(() => "acquired" as const),
      delay(50).then(() => "timeout" as const),
    ])

    expect(raceResult).toBe("timeout")

    slot1.release()
    // Now second should resolve
    const slot2 = await second
    expect(typeof slot2.release).toBe("function")
    slot2.release()
  })

  it("acquireSlot release frees the slot", async () => {
    const slot = await queue.acquireSlot("interactive")
    slot.release()

    // Next enqueue should proceed immediately
    const start = Date.now()
    await queue.enqueue(() => Promise.resolve("ok"), "batch")
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(20)
  })

  it("acquireSlot release(false) records failure for circuit breaker", async () => {
    // Fail via acquireSlot 3 times
    for (let i = 0; i < 3; i++) {
      const slot = await queue.acquireSlot("batch")
      slot.release(false) // report failure
    }

    expect(queue.state.circuitState).toBe("open")
  })
})
