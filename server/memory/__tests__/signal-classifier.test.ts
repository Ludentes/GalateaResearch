// @vitest-environment node
import { describe, expect, it } from "vitest"
import { classifyTurn, filterSignalTurns } from "../signal-classifier"
import type { TranscriptTurn } from "../types"

const user = (content: string): TranscriptTurn => ({ role: "user", content })
const assistant = (content: string): TranscriptTurn => ({
  role: "assistant",
  content,
})

describe("Signal Classifier", () => {
  describe("noise detection", () => {
    it("classifies greetings as noise", () => {
      expect(classifyTurn(user("hi")).type).toBe("noise")
      expect(classifyTurn(user("Hello")).type).toBe("noise")
      expect(classifyTurn(user("hey")).type).toBe("noise")
      expect(classifyTurn(user("good morning")).type).toBe("noise")
    })

    it("classifies confirmations as noise", () => {
      expect(classifyTurn(user("ok")).type).toBe("noise")
      expect(classifyTurn(user("thanks")).type).toBe("noise")
      expect(classifyTurn(user("got it")).type).toBe("noise")
      expect(classifyTurn(user("sure")).type).toBe("noise")
      expect(classifyTurn(user("yes")).type).toBe("noise")
    })

    it("classifies assistant turns as noise", () => {
      expect(classifyTurn(assistant("Here's the code...")).type).toBe("noise")
    })

    it("classifies empty content as noise", () => {
      expect(classifyTurn(user("")).type).toBe("noise")
    })

    it("classifies short non-matching content as noise", () => {
      expect(classifyTurn(user("do it")).type).toBe("noise")
    })
  })

  describe("signal detection", () => {
    it("detects preferences", () => {
      expect(classifyTurn(user("I prefer using pnpm")).type).toBe("preference")
      expect(classifyTurn(user("I always use TypeScript")).type).toBe(
        "preference",
      )
      expect(classifyTurn(user("I never use var")).type).toBe("preference")
      expect(classifyTurn(user("I hate default exports")).type).toBe(
        "preference",
      )
    })

    it("detects corrections", () => {
      expect(classifyTurn(user("No, that's wrong")).type).toBe("correction")
      expect(classifyTurn(user("No, I meant the other file")).type).toBe(
        "correction",
      )
      expect(classifyTurn(user("That's incorrect")).type).toBe("correction")
    })

    it("detects policies", () => {
      expect(
        classifyTurn(user("We always run tests before pushing")).type,
      ).toBe("policy")
      expect(classifyTurn(user("Our standard is to use ESLint")).type).toBe(
        "policy",
      )
      expect(classifyTurn(user("We never push to main directly")).type).toBe(
        "policy",
      )
    })

    it("detects decisions", () => {
      expect(classifyTurn(user("Let's go with Clerk for auth")).type).toBe(
        "decision",
      )
      expect(classifyTurn(user("I've decided to use OTEL")).type).toBe(
        "decision",
      )
      expect(classifyTurn(user("We'll use pnpm")).type).toBe("decision")
    })

    it("classifies substantial messages as factual", () => {
      const msg =
        "The project uses TanStack Start with a PostgreSQL database running on port 15432"
      expect(classifyTurn(user(msg)).type).toBe("factual")
    })
  })

  describe("edge cases", () => {
    it("prefers signal over greeting for longer messages", () => {
      // "Hi, I prefer pnpm for everything" — preference wins
      const result = classifyTurn(
        user("Hi, I prefer using pnpm for everything"),
      )
      expect(result.type).toBe("preference")
    })
  })

  describe("filterSignalTurns", () => {
    it("removes noise turns", () => {
      const turns = [
        user("hi"),
        user("I prefer pnpm"),
        assistant("OK, using pnpm"),
        user("thanks"),
        user("We always write tests first"),
      ]
      const signal = filterSignalTurns(turns)
      expect(signal).toHaveLength(2)
      expect(signal[0].content).toContain("pnpm")
      expect(signal[1].content).toContain("tests")
    })
  })
})
