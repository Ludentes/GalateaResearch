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

  describe("new signal patterns", () => {
    it("detects @remember marker", () => {
      expect(classifyTurn(user("@remember use pnpm always")).type).toBe(
        "remember",
      )
    })

    it("detects @forget marker", () => {
      expect(classifyTurn(user("@forget the old deploy process")).type).toBe(
        "forget",
      )
    })

    it("detects imperative rules without I/we prefix", () => {
      expect(classifyTurn(user("Never push directly to main")).type).toBe(
        "imperative_rule",
      )
      expect(
        classifyTurn(user("Always run the linter before commit")).type,
      ).toBe("imperative_rule")
      expect(classifyTurn(user("Must not use any type")).type).toBe(
        "imperative_rule",
      )
      expect(classifyTurn(user("Don't ever skip tests")).type).toBe(
        "imperative_rule",
      )
    })

    it("detects imperative rules after conversational connectors (S2)", () => {
      expect(
        classifyTurn(user("Also, never deploy on Fridays")).type,
      ).toBe("imperative_rule")
      expect(
        classifyTurn(user("And also; never skip code review")).type,
      ).toBe("imperative_rule")
      expect(
        classifyTurn(user("One more thing: always run migrations")).type,
      ).toBe("imperative_rule")
    })

    it("prefers policy over imperative_rule for we-prefixed statements", () => {
      // "We never" matches policy first
      expect(
        classifyTurn(user("We never push to main directly")).type,
      ).toBe("policy")
    })

    it("prefers preference over imperative_rule for I-prefixed statements", () => {
      // "I never" matches preference first
      expect(classifyTurn(user("I never use var declarations")).type).toBe(
        "preference",
      )
    })

    it("detects procedures (numbered lists)", () => {
      const proc = "To deploy:\n1) Build the app\n2) Push to registry"
      expect(classifyTurn(user(proc)).type).toBe("procedure")
    })

    it("captures match details", () => {
      const result = classifyTurn(user("I prefer using pnpm"))
      expect(result.match).toBeDefined()
      expect(result.matchIndex).toBeDefined()
      expect(typeof result.matchIndex).toBe("number")
    })
  })

  describe("IDE wrapper preprocessing", () => {
    it("classifies <ide_opened_file> as noise", () => {
      const turn = user(
        "<ide_opened_file>The user opened the file /home/qp/test.ts in the IDE. This may or may not be related.</ide_opened_file>",
      )
      expect(classifyTurn(turn).type).toBe("noise")
    })

    it("classifies <command-message> as noise", () => {
      const turn = user(
        "<command-message>superpowers:brainstorming</command-message>\n<command-name>/superpowers:brainstorming</command-name>",
      )
      expect(classifyTurn(turn).type).toBe("noise")
    })

    it("extracts content from <feedback> wrapper", () => {
      const turn = user(
        "<feedback>\ni don't like how it looks now, my suggestion was wrong\nrethink header components\n</feedback>",
      )
      const c = classifyTurn(turn)
      expect(c.type).toBe("correction")
    })

    it("strips <task> wrapper and classifies inner content", () => {
      const turn = user("<task>\nfix the routing bug in PostCard.tsx\n</task>")
      // Short task directives without signal patterns -> noise or factual
      const c = classifyTurn(turn)
      expect(c.type).not.toBe("imperative_rule")
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
