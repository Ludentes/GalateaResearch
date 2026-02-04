// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

describe("LLM Provider Config", () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it("defaults to ollama with llama3.2", async () => {
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("ollama")
    expect(config.model).toBe("llama3.2")
    expect(config.ollamaBaseUrl).toBe("http://localhost:11434")
  })

  it("reads LLM_PROVIDER and LLM_MODEL from env", async () => {
    process.env.LLM_PROVIDER = "ollama"
    process.env.LLM_MODEL = "mistral"
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("ollama")
    expect(config.model).toBe("mistral")
  })

  it("reads OLLAMA_BASE_URL from env", async () => {
    process.env.OLLAMA_BASE_URL = "http://remote:11434"
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.ollamaBaseUrl).toBe("http://remote:11434")
  })

  it("throws when LLM_PROVIDER is invalid", async () => {
    process.env.LLM_PROVIDER = "gpt-5"
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow('Unknown LLM_PROVIDER: "gpt-5"')
  })

  it("throws when openrouter missing OPENROUTER_API_KEY", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    delete process.env.OPENROUTER_API_KEY
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow(
      "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter",
    )
  })

  it("throws when claude-code missing ANTHROPIC_API_KEY", async () => {
    process.env.LLM_PROVIDER = "claude-code"
    delete process.env.ANTHROPIC_API_KEY
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude-code",
    )
  })

  it("returns openrouter config when API key is set", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    process.env.OPENROUTER_API_KEY = "sk-or-test-key"
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("openrouter")
    expect(config.model).toBe("anthropic/claude-sonnet-4")
    expect(config.openrouterApiKey).toBe("sk-or-test-key")
  })

  it("returns claude-code config when API key is set", async () => {
    process.env.LLM_PROVIDER = "claude-code"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key"
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("claude-code")
    expect(config.model).toBe("sonnet")
    expect(config.anthropicApiKey).toBe("sk-ant-test-key")
  })
})
