import { eq } from "drizzle-orm"
import { db } from "../db"
import { preprompts } from "../db/schema"
import { readEntries } from "./knowledge-store"
import type { AssembledContext, ContextSection } from "./types"

interface AssembleOptions {
  storePath?: string
  tokenBudget?: number
}

export async function assembleContext(
  options: AssembleOptions = {},
): Promise<AssembledContext> {
  const { storePath = "data/memory/entries.jsonl", tokenBudget = 4000 } =
    options

  const sections: ContextSection[] = []

  // 1. Load preprompts from DB
  const activePrompts = await db
    .select()
    .from(preprompts)
    .where(eq(preprompts.active, true))

  // 2. Load knowledge entries from file store
  const entries = await readEntries(storePath)
  const active = entries.filter((e) => !e.supersededBy)

  // 3. CONSTRAINTS section — rules + hard_rule preprompts (never truncated)
  const rules = active.filter((e) => e.type === "rule")
  const hardRulePrompts = activePrompts.filter((p) => p.type === "hard_rule")
  const constraintParts = [
    ...hardRulePrompts.map((p) => p.content),
    ...rules.map((r) => r.content),
  ]
  if (constraintParts.length > 0) {
    sections.push({
      name: "CONSTRAINTS",
      content: constraintParts.join("\n"),
      priority: 0,
      truncatable: false,
    })
  }

  // 4. IDENTITY section — core + persona preprompts
  const corePrompts = activePrompts.filter(
    (p) => p.type === "core" || p.type === "persona",
  )
  if (corePrompts.length > 0) {
    sections.push({
      name: "IDENTITY",
      content: corePrompts.map((p) => p.content).join("\n"),
      priority: 1,
      truncatable: false,
    })
  }

  // 5. LEARNED KNOWLEDGE section — preferences, facts, decisions, corrections
  const knowledge = active.filter(
    (e) => e.type !== "rule" && e.type !== "procedure",
  )
  if (knowledge.length > 0) {
    const sorted = knowledge.sort((a, b) => b.confidence - a.confidence)
    sections.push({
      name: "LEARNED KNOWLEDGE",
      content: sorted.map((e) => `- ${e.content}`).join("\n"),
      priority: 2,
      truncatable: true,
    })
  }

  // 6. PROCEDURES section
  const procedures = active.filter((e) => e.type === "procedure")
  if (procedures.length > 0) {
    sections.push({
      name: "PROCEDURES",
      content: procedures.map((e) => `- ${e.content}`).join("\n"),
      priority: 3,
      truncatable: true,
    })
  }

  // 7. Assemble final prompt (respect token budget)
  const systemPrompt = buildPrompt(sections, tokenBudget)

  return {
    systemPrompt,
    sections,
    metadata: {
      prepromptsLoaded: activePrompts.length,
      knowledgeEntries: active.length,
      rulesCount: rules.length,
    },
  }
}

function buildPrompt(sections: ContextSection[], tokenBudget: number): string {
  const charBudget = tokenBudget * 4
  let result = ""
  let remaining = charBudget

  const required = sections
    .filter((s) => !s.truncatable)
    .sort((a, b) => a.priority - b.priority)
  for (const section of required) {
    const block = `## ${section.name}\n${section.content}\n\n`
    result += block
    remaining -= block.length
  }

  const optional = sections
    .filter((s) => s.truncatable)
    .sort((a, b) => a.priority - b.priority)
  for (const section of optional) {
    const block = `## ${section.name}\n${section.content}\n\n`
    if (block.length <= remaining) {
      result += block
      remaining -= block.length
    } else if (remaining > 100) {
      const header = `## ${section.name}\n`
      const available = remaining - header.length - 10
      if (available > 50) {
        result += `${header}${section.content.slice(0, available)}\n...\n\n`
        remaining = 0
      }
    }
  }

  return result.trim()
}
