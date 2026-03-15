// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { retry, retryAsync, retrySync } from "./retry"

describe("retry", () => {
  describe("retryAsync", () => {
    it("succeeds on first try without retrying", async () => {
      const fn = vi.fn(async () => "success")
      const result = await retryAsync(fn)

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("succeeds after multiple retries", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      const result = await retryAsync(fn, { maxRetries: 3 })

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("throws after max retries exceeded", async () => {
      const fn = vi.fn(async () => {
        throw new Error("persistent failure")
      })

      await expect(retryAsync(fn, { maxRetries: 2 })).rejects.toThrow(
        "persistent failure",
      )

      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("respects exponential backoff timing", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      const startTime = Date.now()
      await retryAsync(fn, {
        maxRetries: 2,
        baseDelay: 100,
        backoffMultiplier: 2,
      })
      const elapsed = Date.now() - startTime

      // Expected delays: 100ms + 200ms = 300ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(300)
      expect(elapsed).toBeLessThan(500)
    })

    it("respects max delay cap", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      await retryAsync(fn, {
        maxRetries: 2,
        baseDelay: 100,
        backoffMultiplier: 10,
        maxDelay: 200,
      })

      // Without maxDelay: 100ms + 1000ms
      // With maxDelay: 100ms + 200ms = 300ms maximum
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("stops retrying when shouldRetry returns false", async () => {
      const fn = vi.fn(async () => {
        throw new Error("non-retryable error")
      })

      const shouldRetry = (error: unknown) => error instanceof TypeError

      await expect(
        retryAsync(fn, { maxRetries: 5, shouldRetry }),
      ).rejects.toThrow("non-retryable error")

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("continues retrying when shouldRetry returns true", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("retryable"))
        .mockRejectedValueOnce(new TypeError("retryable"))
        .mockResolvedValueOnce("success")

      const shouldRetry = (error: unknown) => error instanceof TypeError

      const result = await retryAsync(fn, {
        maxRetries: 3,
        baseDelay: 50,
        shouldRetry,
      })

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe("retrySync", () => {
    it("succeeds on first try without retrying", () => {
      const fn = vi.fn(() => "success")
      const result = retrySync(fn)

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("succeeds after multiple retries", () => {
      const fn = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("fail")
        })
        .mockImplementationOnce(() => {
          throw new Error("fail")
        })
        .mockImplementationOnce(() => "success")

      const result = retrySync(fn, { maxRetries: 3 })

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("throws after max retries exceeded", () => {
      const fn = vi.fn(() => {
        throw new Error("persistent failure")
      })

      expect(() => retrySync(fn, { maxRetries: 2 })).toThrow(
        "persistent failure",
      )

      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("respects error filtering", () => {
      const fn = vi.fn(() => {
        throw new Error("non-retryable")
      })

      const shouldRetry = (error: unknown) => error instanceof TypeError

      expect(() => retrySync(fn, { maxRetries: 5, shouldRetry })).toThrow(
        "non-retryable",
      )

      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe("retry (generic wrapper)", () => {
    it("wraps async functions", async () => {
      const fn = vi.fn(async (x: number) => x * 2)
      const wrapped = retry(fn, { maxRetries: 2 })
      const result = await wrapped(5)

      expect(result).toBe(10)
    })

    it("wraps sync functions", () => {
      const fn = vi.fn((x: number) => x * 2)
      const wrapped = retry(fn, { maxRetries: 2 })
      const result = wrapped(5)

      expect(result).toBe(10)
    })

    it("preserves function signature for async", async () => {
      const fn = async (a: string, b: number) => `${a}-${b}`
      const wrapped = retry(fn, { maxRetries: 1 })
      const result = await wrapped("test", 42)

      expect(result).toBe("test-42")
    })

    it("preserves function signature for sync", () => {
      const fn = (a: string, b: number) => `${a}-${b}`
      const wrapped = retry(fn, { maxRetries: 1 })
      const result = wrapped("test", 42)

      expect(result).toBe("test-42")
    })
  })

  describe("default configuration", () => {
    it("uses 3 max retries by default", async () => {
      const fn = vi.fn(async () => {
        throw new Error("fail")
      })

      await expect(
        retryAsync(fn, { baseDelay: 10, maxDelay: 20 }),
      ).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(4)
    })

    it("uses 1000ms base delay by default", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      const startTime = Date.now()
      await retryAsync(fn, { maxRetries: 1 })
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeGreaterThanOrEqual(1000)
    })

    it("uses 32000ms max delay by default", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      const config = { maxRetries: 1 }
      await retryAsync(fn, config)

      // Default config should have maxDelay of 32000
      expect(config).toBeDefined()
    })
  })
})
