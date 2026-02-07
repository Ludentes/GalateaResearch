// @vitest-environment node
import { describe, expect, it } from "vitest"
import { evaluateGatekeeper } from "../gatekeeper"

describe("gatekeeper", () => {
  describe("greetings (skip)", () => {
    it.each([
      "Hi",
      "Hello",
      "Hey",
      "Good morning",
      "Good afternoon",
      "Good evening",
      "Howdy",
      "Sup",
      "What's up",
    ])("skips greeting: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "Hello! How can I help?")
      expect(result.shouldIngest).toBe(false)
      expect(result.category).toBe("greeting")
    })

    it("does not skip long messages starting with hi", () => {
      const msg =
        "Hi, I wanted to tell you that I prefer using TypeScript over JavaScript for all new projects"
      const result = evaluateGatekeeper(msg, "Noted!")
      // Long message has preference signal, should be ingested
      expect(result.shouldIngest).toBe(true)
    })
  })

  describe("confirmations (skip)", () => {
    it.each([
      "Ok",
      "Okay",
      "Got it",
      "Sure",
      "Thanks",
      "Thank you",
      "Great",
      "Yes",
      "No",
      "Yep",
      "Nope",
      "Alright",
      "Understood",
      "Cool",
      "Nice",
      "K",
      "Ack",
    ])("skips confirmation: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "You're welcome!")
      expect(result.shouldIngest).toBe(false)
      expect(result.category).toBe("other")
    })
  })

  describe("preferences (keep)", () => {
    it.each([
      "I prefer dark mode",
      "I like using Vim keybindings",
      "I always use TypeScript",
      "I never use var declarations",
      "I usually prefer functional components",
      "I love the Catppuccin theme",
      "I hate tabs, always use spaces",
      "I want to use pnpm for this project",
    ])("keeps preference: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "Got it, noted!")
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("preference")
    })
  })

  describe("corrections (keep)", () => {
    it.each([
      "No, that's wrong. The port should be 3000",
      "No, it's actually a GET request not POST",
      "No, I meant the other file",
      "Actually, wrong approach",
      "That's incorrect, we use Drizzle not Prisma",
      "Not what I asked for",
    ])("keeps correction: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "Sorry, let me fix that.")
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("correction")
    })
  })

  describe("policies (keep)", () => {
    it("detects policy in user message", () => {
      const result = evaluateGatekeeper(
        "We always use Biome for formatting",
        "I'll make sure to follow that convention.",
      )
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("policy")
    })

    it("detects policy in assistant response", () => {
      const result = evaluateGatekeeper(
        "What's our coding style?",
        "Our standard is to use double quotes and no semicolons.",
      )
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("policy")
    })

    it.each([
      "We should always write tests",
      "We must use TypeScript strict mode",
      "We never commit directly to main",
      "Our convention is 2-space indentation",
      "Our rule is no any types",
      "Don't ever use console.log in production",
    ])("keeps policy: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "Understood.")
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("policy")
    })
  })

  describe("decisions (keep)", () => {
    it.each([
      "Let's go with PostgreSQL for the database",
      "Let's use TanStack Start for the framework",
      "I've decided to use FalkorDB instead of Neo4j",
      "We'll use pnpm as our package manager",
      "Let's choose option A",
    ])("keeps decision: %s", (msg) => {
      const result = evaluateGatekeeper(msg, "Great choice!")
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("decision")
    })
  })

  describe("short exchanges (skip)", () => {
    it("skips very short exchanges with no signal", () => {
      const result = evaluateGatekeeper("hmm", "I see.")
      expect(result.shouldIngest).toBe(false)
      expect(result.category).toBe("other")
    })

    it("skips ambiguous short messages", () => {
      const result = evaluateGatekeeper("right", "Indeed!")
      expect(result.shouldIngest).toBe(false)
    })
  })

  describe("default (keep)", () => {
    it("ingests substantial conversation by default", () => {
      const result = evaluateGatekeeper(
        "Can you explain how the context assembler works?",
        "The context assembler is a 6-step pipeline that combines preprompts with Graphiti knowledge. It retrieves active preprompts, searches for relevant facts, scores and ranks them, allocates a token budget, and assembles prompt sections by priority.",
      )
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("other")
      expect(result.reason).toContain("Default")
    })
  })

  describe("priority ordering", () => {
    it("correction takes precedence over greeting-like start", () => {
      // "No, that's wrong" starts with a pattern that could be seen as
      // short, but it has a correction signal
      const result = evaluateGatekeeper("No, that's wrong", "Let me fix that.")
      expect(result.shouldIngest).toBe(true)
      expect(result.category).toBe("correction")
    })
  })
})
