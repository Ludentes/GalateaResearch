import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import { z } from "zod"
import { ollamaQueue } from "../providers/ollama-queue"
import { validateExtraction } from "./confabulation-guard"
import type { KnowledgeEntry, TranscriptTurn } from "./types"

export const ExtractionSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum([
        "preference",
        "fact",
        "rule",
        "procedure",
        "correction",
        "decision",
      ]),
      content: z
        .string()
        .describe("Concise, actionable statement of the knowledge"),
      confidence: z
        .number()
        .describe(
          "Float 0-1: 1.0 for explicit user statements, 0.7-0.9 for strong implications, 0.5-0.7 for weak signals",
        ),
      evidence: z
        .string()
        .describe("The specific transcript text that supports this"),
      entities: z
        .array(z.string())
        .describe("Technologies, tools, libraries, patterns mentioned"),
      about: z
        .object({
          entity: z
            .string()
            .describe(
              "Who/what this is about: a person's name, project name, or domain. Use lowercase.",
            ),
          type: z
            .enum(["user", "project", "agent", "domain", "team"])
            .describe(
              "user=about a person, project=about the codebase, agent=about the AI agent, domain=about the problem space, team=about team dynamics",
            ),
        })
        .optional()
        .describe(
          "Who/what this knowledge is about. ALWAYS set this when a person, tool, or domain is the subject. Only omit for generic project-wide rules.",
        ),
    }),
  ),
})

const EXTRACTION_PROMPT = `You are a knowledge extraction system. Read this conversation transcript between a user and an AI coding assistant, and extract knowledge that would help a developer agent working on this project.

For each piece of knowledge, classify it:
- preference: user prefers X over Y
- fact: X is true about this project, team, or codebase
- rule: never do X, always do Y (hard constraint)
- procedure: step-by-step process for doing X
- correction: user corrected a mistake — extract the CORRECT answer
- decision: user chose X over alternatives

Rules for extraction:
- Only extract knowledge useful to a developer agent
- Skip greetings, confirmations, tool output noise, and meta-conversation
- Prefer explicit user statements over inferences
- For corrections, extract the RIGHT answer (not the wrong one)
- Merge related items (don't extract "uses TypeScript" and "prefers TypeScript" separately)
- Be conservative: when in doubt, don't extract
- Set confidence to 1.0 for explicit "I always/never/prefer" statements

Subject tagging (about field) — IMPORTANT, always fill this in:
- ALWAYS set the about field. Only omit it for generic project-wide rules with no specific subject.
- Tag WHO or WHAT the knowledge is about using entity (lowercase name) and type.
- Types: user (a person), project (the codebase), agent (the AI), domain (problem space), team (group dynamics)
- Examples:
  "Alina prefers Discord" → about: {entity: "alina", type: "user"}
  "Never push to main" → about: {entity: "galatea", type: "project"}
  "Mobile apps need offline support" → about: {entity: "mobile-dev", type: "domain"}
  "The team uses Scrum" → about: {entity: "dev-team", type: "team"}
- When someone is mentioned by name, ALWAYS tag about with their name
- When a user states a personal preference, tag about with that user
- When a technology/tool is the main subject, tag it as domain`

interface ExtractionOptions {
  temperature?: number
  knownPeople?: string[]
  skipGuard?: boolean
}

export async function extractKnowledge(
  turns: TranscriptTurn[],
  model: LanguageModel,
  source: string,
  optsOrTemp?: ExtractionOptions | number,
): Promise<KnowledgeEntry[]> {
  // Backward compat: accept bare temperature number
  const opts: ExtractionOptions =
    typeof optsOrTemp === "number"
      ? { temperature: optsOrTemp }
      : optsOrTemp ?? {}
  const temperature = opts.temperature ?? 0

  const transcript = turns
    .map((t) => {
      let line = `[${t.role.toUpperCase()}]: ${t.content}`
      if (t.toolUse) {
        for (const tool of t.toolUse) {
          line += `\n  [TOOL: ${tool.name} — ${tool.input.slice(0, 150)}]`
        }
      }
      return line
    })
    .join("\n\n")

  const promptText = `${EXTRACTION_PROMPT}\n\n---\n\nTRANSCRIPT:\n${transcript}`
  console.log(
    `[extraction] generateObject start: ${turns.length} turns, ${transcript.length} chars, temp=${temperature}`,
  )
  const t0 = Date.now()

  const doGenerate = () =>
    generateObject({
      model,
      schema: ExtractionSchema,
      prompt: promptText,
      temperature,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
    })

  const isOllama = (model as { provider?: string }).provider === "ollama"
  const { object } = isOllama
    ? await ollamaQueue.enqueue(doGenerate, "batch")
    : await doGenerate()

  console.log(
    `[extraction] generateObject done: ${object.items.length} items in ${Date.now() - t0}ms`,
  )

  const rawEntries: KnowledgeEntry[] = object.items.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
    source,
    extractedAt: new Date().toISOString(),
  }))

  // Post-extraction validation (confabulation guard)
  if (opts.skipGuard) return rawEntries

  const guardResult = validateExtraction(
    rawEntries,
    transcript,
    opts.knownPeople,
  )

  if (guardResult.warnings.length > 0) {
    for (const w of guardResult.warnings) {
      console.warn(`[extraction:guard] ${w}`)
    }
    console.log(
      `[extraction:guard] ${guardResult.dropped} dropped, ${guardResult.modified} modified out of ${rawEntries.length}`,
    )
  }

  return guardResult.entries
}

/**
 * Retry extraction with escalating temperature.
 * First attempt at temperature 0 (deterministic). On failure, retry with
 * increasing temperature to get different token distributions.
 * Returns empty array if all attempts fail (graceful degradation).
 */
export async function extractWithRetry(
  turns: TranscriptTurn[],
  model: LanguageModel,
  source: string,
  temperatures = [0, 0.3, 0.7],
): Promise<KnowledgeEntry[]> {
  for (let i = 0; i < temperatures.length; i++) {
    try {
      return await extractKnowledge(turns, model, source, temperatures[i])
    } catch (error) {
      const isLast = i === temperatures.length - 1
      const errMsg = error instanceof Error ? error.message : String(error)
      if (isLast) {
        console.warn(
          `[extraction] All ${temperatures.length} attempts failed for ${source}, chunk skipped. Last error: ${errMsg}`,
        )
        return []
      }
      console.warn(
        `[extraction] Attempt ${i + 1} failed (temp=${temperatures[i]}): ${errMsg.slice(0, 200)}. Retrying with temp=${temperatures[i + 1]}`,
      )
    }
  }
  return []
}
