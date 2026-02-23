// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { OllamaBackpressureError, OllamaQueue } from "../ollama-queue"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("OllamaQueue integration", () => {
  let queue: OllamaQueue

  beforeEach(() => {
    queue = new OllamaQueue({
      maxQueueDepth: 3,
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 100,
    })
  })

  afterEach(() => {
    queue.reset()
  })

  it("serializes concurrent calls through single slot", async () => {
    // Launch 3 concurrent enqueue calls with delay functions that record timestamps
    // Verify they ran sequentially (each starts after previous ends)
    const timeline: { id: number; start: number; end: number }[] = []
    const t0 = Date.now()

    const mkTask = (id: number, ms: number) => async () => {
      const start = Date.now() - t0
      await delay(ms)
      const end = Date.now() - t0
      timeline.push({ id, start, end })
      return id
    }

    await Promise.all([
      queue.enqueue(mkTask(1, 30), "batch"),
      queue.enqueue(mkTask(2, 30), "batch"),
      queue.enqueue(mkTask(3, 30), "batch"),
    ])

    // Each task should start AFTER the previous ended
    expect(timeline[1].start).toBeGreaterThanOrEqual(timeline[0].end - 5) // 5ms tolerance
    expect(timeline[2].start).toBeGreaterThanOrEqual(timeline[1].end - 5)
  })

  it("interactive priority jumps ahead of batch in queue", async () => {
    const order: string[] = []

    // Hold the slot with a slow call
    const hold = queue.enqueue(async () => {
      await delay(50)
      order.push("hold")
    }, "batch")

    // While slot is held, queue batch then interactive
    const batch1 = queue.enqueue(async () => {
      order.push("batch1")
    }, "batch")
    const batch2 = queue.enqueue(async () => {
      order.push("batch2")
    }, "batch")
    const interactive = queue.enqueue(async () => {
      order.push("interactive")
    }, "interactive")

    await Promise.all([hold, batch1, batch2, interactive])

    // Interactive should run before batch1 and batch2
    expect(order.indexOf("interactive")).toBeLessThan(order.indexOf("batch1"))
    expect(order.indexOf("interactive")).toBeLessThan(order.indexOf("batch2"))
  })

  it("circuit breaker stops retry storm — fails fast after threshold", async () => {
    // Trip circuit with 3 failures
    for (let i = 0; i < 3; i++) {
      await queue
        .enqueue(() => Promise.reject(new Error("fail")), "batch")
        .catch(() => {})
    }

    // Measure how fast the next call rejects
    const t0 = Date.now()
    await queue.enqueue(() => delay(1000), "batch").catch(() => {})
    const elapsed = Date.now() - t0

    // Should reject immediately (<10ms), not wait 1000ms
    expect(elapsed).toBeLessThan(10)
  })

  it("backpressure rejects excess batch but allows interactive", async () => {
    // Hold slot
    const hold = queue.enqueue(() => delay(200), "batch")

    // Fill queue to max (3)
    const q1 = queue.enqueue(() => delay(10), "batch")
    const q2 = queue.enqueue(() => delay(10), "batch")
    const q3 = queue.enqueue(() => delay(10), "batch")

    // 4th batch should throw backpressure
    await expect(queue.enqueue(() => delay(10), "batch")).rejects.toThrow(
      OllamaBackpressureError,
    )

    // But interactive should still be accepted
    const interactive = queue.enqueue(
      () => Promise.resolve("ok"),
      "interactive",
    )

    const results = await Promise.all([hold, q1, q2, q3, interactive])
    expect(results[4]).toBe("ok")
  })

  it("acquireSlot holds slot for streaming duration", async () => {
    const timeline: string[] = []

    // Simulate streaming: acquire slot, hold it for 50ms
    const streamTask = async () => {
      const slot = await queue.acquireSlot("interactive")
      timeline.push("stream-start")
      await delay(50)
      timeline.push("stream-end")
      slot.release()
    }

    // Start streaming
    const stream = streamTask()

    // Try to enqueue while stream is holding slot
    const batch = queue.enqueue(async () => {
      timeline.push("batch")
    }, "batch")

    await Promise.all([stream, batch])

    // Batch should run after stream releases
    expect(timeline).toEqual(["stream-start", "stream-end", "batch"])
  })

  it("circuit recovery: half-open probe success resets to closed", async () => {
    // Trip circuit
    for (let i = 0; i < 3; i++) {
      await queue
        .enqueue(() => Promise.reject(new Error("fail")), "batch")
        .catch(() => {})
    }
    expect(queue.state.circuitState).toBe("open")

    // Wait for cooldown
    await delay(110)
    expect(queue.state.circuitState).toBe("half-open")

    // Successful probe
    await queue.enqueue(() => Promise.resolve("recovered"), "batch")
    expect(queue.state.circuitState).toBe("closed")

    // Normal operations resume
    const result = await queue.enqueue(() => Promise.resolve("ok"), "batch")
    expect(result).toBe("ok")
  })
})
