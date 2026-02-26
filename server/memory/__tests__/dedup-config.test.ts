// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getDedupConfig } from "../../engine/config"

describe("dedup config", () => {
  it("uses tightened cosine threshold of 0.90", () => {
    const cfg = getDedupConfig()
    expect(cfg.embedding_cosine_threshold).toBe(0.9)
  })
})
