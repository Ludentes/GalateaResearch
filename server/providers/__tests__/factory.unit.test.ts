// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../ollama", () => ({
  createOllamaModel: vi.fn().mockReturnValue({ provider: "mock-ollama" }),
}))

vi.mock("../openrouter", () => ({
  createOpenRouterModel: vi
    .fn()
    .mockReturnValue({ provider: "mock-openrouter" }),
}))

vi.mock("../claude-code", () => ({
  createClaudeCodeModel: vi
    .fn()
    .mockReturnValue({ provider: "mock-claude-code" }),
}))

describe("Provider Factory (getModel)", () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it("returns ollama model by default", async () => {
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    const { getModel } = await import("../index")
    const result = getModel()
    expect(result.modelName).toBe("llama3.2")
    expect(result.model).toEqual({ provider: "mock-ollama" })
  })

  it("returns openrouter model when configured", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    process.env.OPENROUTER_API_KEY = "sk-or-test"
    const { getModel } = await import("../index")
    const result = getModel()
    expect(result.modelName).toBe("z-ai/glm-4.5-air:free")
    expect(result.model).toEqual({ provider: "mock-openrouter" })
  })

  it("returns claude-code model when configured", async () => {
    process.env.LLM_PROVIDER = "claude-code"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const { getModel } = await import("../index")
    const result = getModel()
    expect(result.modelName).toBe("sonnet")
    expect(result.model).toEqual({ provider: "mock-claude-code" })
  })

  it("passes custom model name through", async () => {
    process.env.LLM_PROVIDER = "ollama"
    process.env.LLM_MODEL = "deepseek-r1"
    const { getModel } = await import("../index")
    const result = getModel()
    expect(result.modelName).toBe("deepseek-r1")
  })
})
