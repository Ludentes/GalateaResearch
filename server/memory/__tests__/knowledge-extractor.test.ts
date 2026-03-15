// @vitest-environment node
import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import type { TranscriptTurn } from "../types"

const mockGenerateObject = vi.fn().mockResolvedValue({
  object: {
    items: [
      {
        type: "preference",
        content: "User prefers pnpm over npm for all projects",
        confidence: 0.95,
        evidence: "User said: I prefer using pnpm",
        entities: ["pnpm", "npm"],
        novelty: "project-specific",
        origin: "explicit-statement",
      },
      {
        type: "fact",
        content: "Project uses TypeScript strict mode",
        confidence: 0.85,
        evidence: "User requested strict mode setup",
        entities: ["TypeScript"],
        novelty: "project-specific",
        origin: "observed-pattern",
      },
    ],
  },
})

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}))

vi.mock("../../providers/ollama-queue", () => ({
  ollamaQueue: {
    enqueue: <T>(fn: () => Promise<T>) => fn(),
  },
}))

import { extractKnowledge, extractWithRetry } from "../knowledge-extractor"

describe("Knowledge Extractor", () => {
  const turns: TranscriptTurn[] = [
    { role: "user", content: "I prefer using pnpm for package management" },
    { role: "assistant", content: "I'll use pnpm going forward." },
    { role: "user", content: "Let's set up TypeScript strict mode" },
    { role: "assistant", content: "Setting up TypeScript strict mode." },
  ]

  it("returns KnowledgeEntry array", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe("preference")
    expect(entries[1].type).toBe("fact")
  })

  it("assigns id, source, and extractedAt", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].id).toBeDefined()
    expect(entries[0].source).toBe("session:test")
    expect(entries[0].extractedAt).toBeDefined()
  })

  it("preserves confidence and entities from LLM", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].confidence).toBe(0.95)
    expect(entries[0].entities).toContain("pnpm")
  })

  it("includes evidence", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].evidence).toContain("pnpm")
  })

  it("passes temperature and maxRetries to generateObject", async () => {
    mockGenerateObject.mockClear()
    await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      0.5,
    )
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.5,
        maxRetries: 0,
      }),
    )
  })

  it("uses custom prompt when provided via options", async () => {
    mockGenerateObject.mockClear()
    const customPrompt = "You are a custom extractor. Extract preferences only."
    await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { prompt: customPrompt },
    )
    const callArgs = mockGenerateObject.mock.calls[0][0]
    expect(callArgs.prompt).toContain(customPrompt)
    expect(callArgs.prompt).not.toContain(
      "You are a knowledge extraction system",
    )
  })

  it("uses default EXTRACTION_PROMPT when no custom prompt given", async () => {
    mockGenerateObject.mockClear()
    await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    const callArgs = mockGenerateObject.mock.calls[0][0]
    expect(callArgs.prompt).toContain("You are a knowledge extraction system")
  })

  it("bypasses ollamaQueue when useQueue is false", async () => {
    // The mock already bypasses the queue, but we verify the option is accepted
    mockGenerateObject.mockClear()
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { useQueue: false },
    )
    expect(entries).toHaveLength(2)
    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
  })

  it("defaults to temperature 0", async () => {
    mockGenerateObject.mockClear()
    await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0,
        maxRetries: 0,
      }),
    )
  })
})

describe("extractWithRetry", () => {
  const turns: TranscriptTurn[] = [
    { role: "user", content: "I prefer pnpm" },
    { role: "assistant", content: "Got it." },
  ]

  it("returns results on first attempt at temperature 0", async () => {
    mockGenerateObject.mockClear()
    const entries = await extractWithRetry(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries.length).toBeGreaterThan(0)
    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    )
  })

  it("retries with escalating temperature on failure", async () => {
    mockGenerateObject.mockClear()
    mockGenerateObject
      .mockRejectedValueOnce(new Error("JSON parse error"))
      .mockRejectedValueOnce(new Error("Schema validation failed"))
      .mockResolvedValueOnce({
        object: {
          items: [
            {
              type: "fact",
              content: "Recovered preference for pnpm package manager",
              confidence: 0.8,
              evidence: "test",
              entities: [],
              novelty: "project-specific",
              origin: "observed-pattern",
            },
          ],
        },
      })

    const entries = await extractWithRetry(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      [0, 0.3, 0.7],
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe(
      "Recovered preference for pnpm package manager",
    )
    expect(mockGenerateObject).toHaveBeenCalledTimes(3)
    expect(mockGenerateObject).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ temperature: 0 }),
    )
    expect(mockGenerateObject).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ temperature: 0.3 }),
    )
    expect(mockGenerateObject).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ temperature: 0.7 }),
    )
  })

  it("returns empty array when all attempts fail", async () => {
    mockGenerateObject.mockClear()
    mockGenerateObject
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"))

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const entries = await extractWithRetry(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      [0, 0.3, 0.7],
    )
    warnSpy.mockRestore()

    expect(entries).toHaveLength(0)
    expect(mockGenerateObject).toHaveBeenCalledTimes(3)
  })
})

describe("Novelty and Origin extraction", () => {
  const turns: TranscriptTurn[] = [
    { role: "user", content: "I prefer using pnpm for package management" },
    { role: "assistant", content: "I'll use pnpm going forward." },
  ]

  it("filters out general-knowledge entries and preserves project-specific (S5, S1)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Uses pnpm as the default package manager",
            confidence: 0.95,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
          {
            type: "fact",
            content: "Variables should have meaningful names",
            confidence: 0.6,
            evidence: "General coding advice",
            entities: [],
            novelty: "general-knowledge",
            origin: "inferred",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    // general-knowledge should be filtered out
    expect(entries).toHaveLength(1)
    expect(entries[0].novelty).toBe("project-specific")
    expect(entries[0].origin).toBe("explicit-statement")
  })

  it("caps inferred entries at confidence 0.70 (S4)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "fact",
            content: "Team probably uses agile methodology for sprints",
            confidence: 0.9,
            evidence: "Seems like agile from context",
            entities: [],
            novelty: "domain-specific",
            origin: "inferred",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    expect(entries[0].confidence).toBe(0.7)
  })

  it("records novelty-gate decisions on extracted entries", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Uses pnpm as the default package manager",
            confidence: 0.95,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
        ],
      },
    })
    const result = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    for (const entry of result) {
      expect(entry.decisions).toBeDefined()
      expect(entry.decisions!.length).toBeGreaterThan(0)
      const noveltyDecisions = entry.decisions!.filter(
        (d) => d.stage === "novelty-gate",
      )
      expect(noveltyDecisions.length).toBeGreaterThan(0)
    }
  })

  it("records cap decision on inferred entries with high confidence", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "fact",
            content: "Team probably uses agile methodology for sprints",
            confidence: 0.9,
            evidence: "Seems like agile from context",
            entities: [],
            novelty: "domain-specific",
            origin: "inferred",
          },
        ],
      },
    })
    const result = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    const capDecisions = result[0].decisions!.filter((d) => d.action === "cap")
    expect(capDecisions).toHaveLength(1)
    expect(capDecisions[0].stage).toBe("novelty-gate")
    expect(capDecisions[0].inputs).toEqual(
      expect.objectContaining({
        originalConfidence: 0.9,
        cappedTo: 0.7,
        origin: "inferred",
      }),
    )
  })

  it("records auto-approve decision on high-confidence explicit entries", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Always use pnpm for package management tasks",
            confidence: 1.0,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
        ],
      },
    })
    const result = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    const approveDecisions = result[0].decisions!.filter(
      (d) => d.action === "auto-approve",
    )
    expect(approveDecisions).toHaveLength(1)
    expect(approveDecisions[0].stage).toBe("extraction")
    expect(approveDecisions[0].inputs).toEqual(
      expect.objectContaining({
        confidence: 1.0,
        threshold: 0.9,
      }),
    )
  })

  it("records pass decision on pending entries", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "fact",
            content: "Project uses TypeScript with strict mode enabled",
            confidence: 0.85,
            evidence: "User requested TS setup",
            entities: ["TypeScript"],
            novelty: "project-specific",
            origin: "observed-pattern",
          },
        ],
      },
    })
    const result = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    const passDecisions = result[0].decisions!.filter(
      (d) => d.stage === "extraction" && d.action === "pass",
    )
    expect(passDecisions).toHaveLength(1)
    expect(passDecisions[0].inputs).toEqual(
      expect.objectContaining({
        origin: "observed-pattern",
        confidence: 0.85,
      }),
    )
  })

  it("auto-approves explicit statements with confidence >= 0.90 (S1)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        items: [
          {
            type: "preference",
            content: "Always use pnpm for package management tasks",
            confidence: 1.0,
            evidence: "User said: I always use pnpm",
            entities: ["pnpm"],
            novelty: "project-specific",
            origin: "explicit-statement",
          },
        ],
      },
    })
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
      { skipGuard: true },
    )
    expect(entries[0].curationStatus).toBe("approved")
    expect(entries[0].curatedBy).toBe("auto-approved")
  })
})
