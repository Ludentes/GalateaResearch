import type { LanguageModel } from "ai"
import { generateObject } from "ai"
import { z } from "zod"
import type { KnowledgeEntry, TranscriptTurn } from "./types"

const ExtractionSchema = z.object({
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
        .min(0)
        .max(1)
        .describe(
          "1.0 for explicit user statements, 0.7-0.9 for strong implications, 0.5-0.7 for weak signals",
        ),
      evidence: z
        .string()
        .describe("The specific transcript text that supports this"),
      entities: z
        .array(z.string())
        .describe("Technologies, tools, libraries, patterns mentioned"),
      about: z
        .object({
          entity: z.string().describe("Who/what this is about: a person's name, project name, or domain. Use lowercase."),
          type: z.enum(["user", "project", "agent", "domain", "team"]).describe(
            "user=about a person, project=about the codebase, agent=about the AI agent, domain=about the problem space, team=about team dynamics",
          ),
        })
        .optional()
        .describe("Who/what this knowledge is about. Omit if about the current project in general."),
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

Subject tagging (about field):
- Tag WHO or WHAT the knowledge is about
- "Mary prefers Discord" → about: {entity: "mary", type: "user"}
- "Never push to main" → about: {entity: "galatea", type: "project"} or omit (project is default)
- "Mobile apps need offline support" → about: {entity: "mobile-dev", type: "domain"}
- If the subject is the current project in general, omit the about field
- Use the person's first name (lowercase) as entity for user-specific knowledge
- When a user states a personal preference, tag it as about that user`

export async function extractKnowledge(
  turns: TranscriptTurn[],
  model: LanguageModel,
  source: string,
): Promise<KnowledgeEntry[]> {
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

  const { object } = await generateObject({
    model,
    schema: ExtractionSchema,
    prompt: `${EXTRACTION_PROMPT}\n\n---\n\nTRANSCRIPT:\n${transcript}`,
  })

  return object.items.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
    source,
    extractedAt: new Date().toISOString(),
  }))
}
