// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadConfig, resetConfigCache } from "../../engine/config"

describe("Vector retrieval config", () => {
  it("loads use_vector setting", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.use_vector).toBe(false)
  })

  it("loads qdrant_url", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.qdrant_url).toBe("http://localhost:16333")
  })

  it("loads ollama_embed_url", () => {
    resetConfigCache()
    const config = loadConfig()
    expect(config.retrieval.ollama_embed_url).toBe("http://localhost:11434")
  })
})
