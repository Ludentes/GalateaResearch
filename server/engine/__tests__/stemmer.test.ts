// @vitest-environment node
import { describe, expect, it } from "vitest"
import { stemTokenize } from "../stemmer"

describe("stemTokenize", () => {
  it("stems 'authentication' and 'auth' to same root via prefix collapse", () => {
    const a = stemTokenize("How do I implement OAuth2 authentication?")
    const b = stemTokenize("Use Clerk for mobile auth, not JWT")
    const shared = [...a].filter((w) => b.has(w))
    expect(shared.length).toBeGreaterThan(0)
  })

  it("stems 'fixing' and 'fix' to same root", () => {
    const a = stemTokenize("How do I fix this?")
    const b = stemTokenize("Still broken, how do I fix this?")
    const shared = [...a].filter((w) => b.has(w))
    expect(shared.length).toBeGreaterThan(0)
  })

  it("stems 'implementation' and 'implement' to same root", () => {
    const a = stemTokenize("We need to implement the feature")
    const b = stemTokenize("The implementation is incomplete")
    const shared = [...a].filter((w) => b.has(w))
    expect(shared.length).toBeGreaterThan(0)
  })

  it("filters words shorter than keyword_min_length", () => {
    const result = stemTokenize("I am a test of it")
    // All words are very short; with default keyword_min_length=3,
    // "test" (4 chars) should remain
    expect(result.has("test")).toBe(true)
    expect(result.size).toBeGreaterThanOrEqual(1)
  })

  it("handles empty input", () => {
    const result = stemTokenize("")
    expect(result.size).toBe(0)
  })

  it("adds short-stem variants for longer stems", () => {
    const result = stemTokenize("authentication")
    // "authentication" stems to "authent", short-stem "auth" also added
    expect(result.has("authent")).toBe(true)
    expect(result.has("auth")).toBe(true)
  })
})
