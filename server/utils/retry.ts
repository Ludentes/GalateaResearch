/**
 * Retry wrapper for sync and async functions with exponential backoff.
 * Provides flexible configuration for max retries, delays, and error
 * filtering.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay in milliseconds (default: 1000) */
  baseDelay?: number
  /** Maximum delay in milliseconds (default: 32000) */
  maxDelay?: number
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /**
   * Optional error filter function. Return true to retry on this error,
   * false to throw immediately.
   */
  shouldRetry?: (error: unknown) => boolean
}

interface ResolvedConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  shouldRetry: (error: unknown) => boolean
}

/**
 * Calculate delay for a given attempt number with exponential backoff.
 * Formula: min(baseDelay * (backoffMultiplier ^ attempt), maxDelay)
 */
function calculateDelay(attempt: number, config: ResolvedConfig): number {
  const delay = config.baseDelay * config.backoffMultiplier ** attempt
  return Math.min(delay, config.maxDelay)
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wrap an async function with automatic retry logic.
 *
 * @example
 * const result = await retryAsync(() => fetchData(), {
 *   maxRetries: 5,
 *   shouldRetry: (err) => err instanceof NetworkError,
 * })
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config?: RetryConfig,
): Promise<T> {
  const resolvedConfig: ResolvedConfig = {
    maxRetries: config?.maxRetries ?? 3,
    baseDelay: config?.baseDelay ?? 1000,
    maxDelay: config?.maxDelay ?? 32000,
    backoffMultiplier: config?.backoffMultiplier ?? 2,
    shouldRetry: config?.shouldRetry ?? (() => true),
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= resolvedConfig.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const shouldRetry = resolvedConfig.shouldRetry(error)

      if (!shouldRetry || attempt === resolvedConfig.maxRetries) {
        throw error
      }

      const delayMs = calculateDelay(attempt, resolvedConfig)
      await sleep(delayMs)
    }
  }

  throw lastError
}

/**
 * Wrap a sync function with automatic retry logic.
 *
 * @example
 * const result = retrySync(() => JSON.parse(data), {
 *   maxRetries: 2,
 *   shouldRetry: (err) => err instanceof SyntaxError,
 * })
 */
export function retrySync<T>(fn: () => T, config?: RetryConfig): T {
  const resolvedConfig: ResolvedConfig = {
    maxRetries: config?.maxRetries ?? 3,
    baseDelay: config?.baseDelay ?? 1000,
    maxDelay: config?.maxDelay ?? 32000,
    backoffMultiplier: config?.backoffMultiplier ?? 2,
    shouldRetry: config?.shouldRetry ?? (() => true),
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= resolvedConfig.maxRetries; attempt++) {
    try {
      return fn()
    } catch (error) {
      lastError = error
      const shouldRetry = resolvedConfig.shouldRetry(error)

      if (!shouldRetry || attempt === resolvedConfig.maxRetries) {
        throw error
      }

      const delayMs = calculateDelay(attempt, resolvedConfig)
      const endTime = Date.now() + delayMs
      while (Date.now() < endTime) {
        // Busy wait for sync sleep
      }
    }
  }

  throw lastError
}

/**
 * Generic retry wrapper that detects function type (sync/async).
 * Returns a wrapped version of the function.
 *
 * @example
 * const wrappedFetch = retry(fetch, { maxRetries: 5 })
 * const result = await wrappedFetch(url)
 */
export function retry<T extends (...args: unknown[]) => unknown>(
  fn: T,
  config?: RetryConfig,
): T {
  return ((...args: unknown[]) => {
    const result = fn(...args)

    if (result instanceof Promise) {
      return retryAsync(
        () => result as Promise<unknown>,
        config,
      ) as ReturnType<T>
    } else {
      return retrySync(() => result as unknown, config) as ReturnType<T>
    }
  }) as T
}
