import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import { z } from "zod"
import { ollamaQueue } from "../providers/ollama-queue"
import { validateExtraction } from "./confabulation-guard"
import { applyNoveltyGateAndApproval } from "./post-extraction"
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
          "0.0 to 1.0. 1.0 for explicit user statements, 0.7-0.9 for strong implications, 0.5-0.7 for weak signals",
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
      novelty: z
        .enum(["project-specific", "domain-specific", "general-knowledge"])
        .describe(
          "project-specific: about THIS project/team. domain-specific: specialized technical knowledge. general-knowledge: any competent developer knows this — DO NOT extract these.",
        ),
      origin: z
        .enum(["explicit-statement", "observed-failure", "observed-pattern", "inferred"])
        .describe(
          "explicit-statement: user directly said it. observed-failure: lesson from something going wrong. observed-pattern: repeated behavior (2+ times). inferred: you inferred this — USE SPARINGLY.",
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
- When a technology/tool is the main subject, tag it as domain

NOVELTY ASSESSMENT — For each extracted item, classify its novelty:
- "project-specific": Knowledge specific to THIS project, codebase, or team.
  Examples: "this project uses h3 not express", "tests go in __tests__/"
- "domain-specific": Specialized technical knowledge a general developer might not know.
  Examples: "FHIR resources require validation against profiles"
- "general-knowledge": Any competent engineer already knows this.
  Examples: "use version control", "write tests", "handle errors"

IMPORTANT: Do NOT extract general-knowledge items. Skip them entirely.

ORIGIN TRACKING — For each item, classify how it was discovered:
- "explicit-statement": User directly said it. "I prefer...", "We always...", "Never do..."
- "observed-failure": Something went wrong and this is the lesson.
- "observed-pattern": Repeated behavior (must appear 2+ times in transcript).
- "inferred": You inferred this from context. USE SPARINGLY — lowest reliability.`

interface ExtractionOptions {
  temperature?: number
  knownPeople?: string[]
  skipGuard?: boolean
  prompt?: string
  useQueue?: boolean
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

  const basePrompt = opts.prompt ?? EXTRACTION_PROMPT
  const promptText = `${basePrompt}\n\n---\n\nTRANSCRIPT:\n${transcript}`
  console.log(
    `[extraction] generateObject start: ${turns.length} turns, ${transcript.length} chars, temp=${temperature}`,
  )
  const t0 = Date.now()

  const doExtract = () =>
    generateObject({
      model,
      schema: ExtractionSchema,
      prompt: promptText,
      temperature,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
    })

  const { object } =
    opts.useQueue === false
      ? await doExtract()
      : await ollamaQueue.enqueue(doExtract, "batch")

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
  if (opts.skipGuard) return applyNoveltyGateAndApproval(rawEntries)

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

  return applyNoveltyGateAndApproval(guardResult.entries)
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
  opts?: { prompt?: string; useQueue?: boolean },
): Promise<KnowledgeEntry[]> {
  for (let i = 0; i < temperatures.length; i++) {
    try {
      return await extractKnowledge(turns, model, source, {
        temperature: temperatures[i],
        prompt: opts?.prompt,
        useQueue: opts?.useQueue,
      })
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
