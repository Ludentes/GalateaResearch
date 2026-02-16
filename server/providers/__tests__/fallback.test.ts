import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the ollama-queue module before any imports
vi.mock("../ollama-queue", () => ({
  ollamaQueue: {
    state: { circuitState: "closed", active: false, queueDepth: 0 },
  },
}))

// Mock model creation functions to avoid real network calls
vi.mock("../ollama", () => ({
  createOllamaModel: vi.fn(() => ({ type: "ollama-mock" })),
}))
vi.mock("../openrouter", () => ({
  createOpenRouterModel: vi.fn(() => ({ type: "openrouter-mock" })),
}))
vi.mock("../claude-code", () => ({
  createClaudeCodeModel: vi.fn(() => ({ type: "claude-code-mock" })),
}))

import { getModelWithFallback } from "../index"
import { ollamaQueue } from "../ollama-queue"

describe("getModelWithFallback", () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    // Default: Ollama provider with OpenRouter key available
    process.env.LLM_PROVIDER = "ollama"
    process.env.LLM_MODEL = "glm-4.7-flash"
    process.env.OLLAMA_BASE_URL = "http://localhost:11434"
    process.env.OPENROUTER_API_KEY = "sk-test-key"
    process.env.OPENROUTER_MODEL = "z-ai/glm-4.7-flash"

    // Reset circuit to closed
    ;(ollamaQueue as any).state = {
      circuitState: "closed",
      active: false,
      queueDepth: 0,
    }
  })

  afterEach(() => {
    process.env = { ...savedEnv }
    vi.restoreAllMocks()
  })

  it("returns primary model when circuit is closed", () => {
    const result = getModelWithFallback()

    expect(result.fallback).toBe(false)
    expect(result.modelName).toBe("glm-4.7-flash")
  })

  it("returns OpenRouter model when Ollama circuit is open and API key set", () => {
    ;(ollamaQueue as any).state = {
      circuitState: "open",
      active: false,
      queueDepth: 0,
    }

    const result = getModelWithFallback()

    expect(result.fallback).toBe(true)
    expect(result.modelName).toBe("openrouter:z-ai/glm-4.7-flash")
  })

  it("returns primary Ollama model when circuit open but no OpenRouter API key", () => {
    ;(ollamaQueue as any).state = {
      circuitState: "open",
      active: false,
      queueDepth: 0,
    }
    delete process.env.OPENROUTER_API_KEY

    // Without API key, should fall through to getModel() which returns Ollama
    const result = getModelWithFallback()

    expect(result.fallback).toBe(false)
    expect(result.modelName).toBe("glm-4.7-flash")
  })

  it("marks fallback: true when using OpenRouter fallback", () => {
    ;(ollamaQueue as any).state = {
      circuitState: "open",
      active: false,
      queueDepth: 0,
    }

    const result = getModelWithFallback()

    expect(result.fallback).toBe(true)
    expect(result.model).toEqual({ type: "openrouter-mock" })
  })

  it("returns primary model for non-Ollama providers regardless of circuit state", () => {
    process.env.LLM_PROVIDER = "openrouter"
    process.env.LLM_MODEL = "some-model"
    ;(ollamaQueue as any).state = {
      circuitState: "open",
      active: false,
      queueDepth: 0,
    }

    const result = getModelWithFallback()

    expect(result.fallback).toBe(false)
    expect(result.modelName).toBe("some-model")
  })
})
