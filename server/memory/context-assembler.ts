import { eq } from "drizzle-orm"
import { db } from "../db"
import { preprompts } from "../db/schema"
import { getContextConfig } from "../engine/config"
import type { AgentContext } from "../engine/types"
import { assessDimensions, getGuidance } from "../engine/homeostasis-engine"
import { readEntries } from "./knowledge-store"
import type {
  AssembledContext,
  ContextSection,
  KnowledgeEntry,
  SectionAccounting,
} from "./types"

interface AssembleOptions {
  storePath?: string
  tokenBudget?: number
  agentContext?: AgentContext
  retrievedEntries?: KnowledgeEntry[]
  operationalSummary?: string
  conversationHistory?: Array<{ role: string; content: string }>
  toolDefinitions?: string
}

export async function assembleContext(
  options: AssembleOptions = {},
): Promise<AssembledContext> {
  const ctxConfig = getContextConfig()
  const {
    storePath = "data/memory/entries.jsonl",
    tokenBudget = ctxConfig.token_budget,
    agentContext,
  } = options

  const sections: ContextSection[] = []

  // 1. Load preprompts from DB
  const activePrompts = await db
    .select()
    .from(preprompts)
    .where(eq(preprompts.active, true))

  // 2. Load knowledge entries — use retrieved entries if provided, else load all
  const { retrievedEntries } = options
  const allActive = (await readEntries(storePath)).filter(
    (e) => !e.supersededBy,
  )

  // When retrieval provided relevant entries, use those for knowledge/procedures
  // but always include ALL rules (they're non-negotiable constraints)
  const active =
    retrievedEntries && retrievedEntries.length > 0
      ? retrievedEntries.filter((e) => !e.supersededBy)
      : allActive

  // 3. CONSTRAINTS section — rules + hard_rule preprompts (never truncated)
  // Rules always come from the full store, not filtered by retrieval
  const rules = allActive.filter((e) => e.type === "rule")
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

  // 5. HOMEOSTASIS GUIDANCE — assess dimensions and inject guidance if needed
  let homeostasisGuidanceIncluded = false
  if (agentContext) {
    const dimensions = assessDimensions(agentContext)
    const guidance = getGuidance(dimensions)
    if (guidance) {
      sections.push({
        name: "SELF-REGULATION",
        content: guidance,
        priority: -1, // Insert before constraints
        truncatable: false,
      })
      homeostasisGuidanceIncluded = true
    }
  }

  // 6. OPERATIONAL CONTEXT — task state, work phase, carryover
  if (options.operationalSummary) {
    sections.push({
      name: "OPERATIONAL CONTEXT",
      content: options.operationalSummary,
      priority: 2,
      truncatable: true,
    })
  }

  // 7. CONVERSATION HISTORY — recent exchanges
  if (options.conversationHistory && options.conversationHistory.length > 0) {
    const historyText = options.conversationHistory
      .map((h) => `[${h.role.toUpperCase()}]: ${h.content}`)
      .join("\n")
    sections.push({
      name: "CONVERSATION HISTORY",
      content: historyText,
      priority: 3,
      truncatable: true,
    })
  }

  // 8. TOOL DEFINITIONS — registered tools
  if (options.toolDefinitions) {
    sections.push({
      name: "TOOL DEFINITIONS",
      content: options.toolDefinitions,
      priority: 4,
      truncatable: true,
    })
  }

  // 9. LEARNED KNOWLEDGE section — preferences, facts, decisions, corrections
  const knowledge = active.filter(
    (e) => e.type !== "rule" && e.type !== "procedure",
  )
  if (knowledge.length > 0) {
    const sorted = knowledge.sort((a, b) => b.confidence - a.confidence)
    sections.push({
      name: "LEARNED KNOWLEDGE",
      content: sorted.map((e) => `- ${e.content}`).join("\n"),
      priority: 5,
      truncatable: true,
    })
  }

  // 10. PROCEDURES section
  const procedures = active.filter((e) => e.type === "procedure")
  if (procedures.length > 0) {
    sections.push({
      name: "PROCEDURES",
      content: procedures.map((e) => `- ${e.content}`).join("\n"),
      priority: 6,
      truncatable: true,
    })
  }

  // 11. Assemble final prompt (respect token budget with per-section accounting)
  const { systemPrompt, accounting } = buildPromptWithAccounting(
    sections,
    tokenBudget,
  )

  return {
    systemPrompt,
    sections,
    metadata: {
      prepromptsLoaded: activePrompts.length,
      knowledgeEntries: active.length,
      rulesCount: rules.length,
      homeostasisGuidanceIncluded,
      tokenAccounting: accounting,
      totalTokens: accounting.reduce((sum, a) => sum + a.tokens, 0),
      budgetUsedPercent: Math.round(
        (accounting.reduce((sum, a) => sum + a.tokens, 0) / tokenBudget) * 100,
      ),
    },
  }
}

// ---------------------------------------------------------------------------
// Build prompt with per-section accounting
// ---------------------------------------------------------------------------

function estimateTokens(text: string, charsPerToken: number): number {
  return Math.ceil(text.length / charsPerToken)
}

interface BuildResult {
  systemPrompt: string
  accounting: SectionAccounting[]
}

function buildPromptWithAccounting(
  sections: ContextSection[],
  tokenBudget: number,
): BuildResult {
  const cfg = getContextConfig()
  const charBudget = tokenBudget * cfg.chars_per_token
  let result = ""
  let remaining = charBudget
  const accounting: SectionAccounting[] = []

  // Phase 1: Required sections (never truncated)
  const required = sections
    .filter((s) => !s.truncatable)
    .sort((a, b) => a.priority - b.priority)
  for (const section of required) {
    const block = `## ${section.name}\n${section.content}\n\n`
    result += block
    remaining -= block.length
    accounting.push({
      name: section.name,
      tokens: estimateTokens(block, cfg.chars_per_token),
      percentOfBudget: Math.round(
        (estimateTokens(block, cfg.chars_per_token) / tokenBudget) * 100,
      ),
      truncated: false,
    })
  }

  // Warn if non-truncatable sections consume too much budget
  const requiredTokens = accounting.reduce((sum, a) => sum + a.tokens, 0)
  const requiredPercent = Math.round((requiredTokens / tokenBudget) * 100)
  if (requiredPercent > 80) {
    console.warn(
      `[context] Non-truncatable sections consume ${requiredPercent}% of budget`,
    )
  }

  // Phase 2: Optional sections (truncatable, lowest priority last)
  const optional = sections
    .filter((s) => s.truncatable)
    .sort((a, b) => a.priority - b.priority)
  for (const section of optional) {
    const block = `## ${section.name}\n${section.content}\n\n`
    if (block.length <= remaining) {
      result += block
      remaining -= block.length
      accounting.push({
        name: section.name,
        tokens: estimateTokens(block, cfg.chars_per_token),
        percentOfBudget: Math.round(
          (estimateTokens(block, cfg.chars_per_token) / tokenBudget) * 100,
        ),
        truncated: false,
      })
    } else if (remaining > cfg.truncation_min_remaining) {
      const header = `## ${section.name}\n`
      const available = remaining - header.length - cfg.truncation_header_buffer
      if (available > cfg.truncation_min_content) {
        // For LEARNED KNOWLEDGE, drop lowest-ranked entries first
        const truncatedContent = truncateByLines(
          section.content,
          available,
        )
        const truncatedBlock = `${header}${truncatedContent.text}\n...\n\n`
        result += truncatedBlock
        remaining -= truncatedBlock.length
        accounting.push({
          name: section.name,
          tokens: estimateTokens(truncatedBlock, cfg.chars_per_token),
          percentOfBudget: Math.round(
            (estimateTokens(truncatedBlock, cfg.chars_per_token) /
              tokenBudget) *
              100,
          ),
          truncated: true,
          droppedEntries: truncatedContent.droppedLines,
        })
      } else {
        accounting.push({
          name: section.name,
          tokens: 0,
          percentOfBudget: 0,
          truncated: true,
          droppedEntries: section.content.split("\n").length,
        })
      }
    } else {
      // No space at all
      accounting.push({
        name: section.name,
        tokens: 0,
        percentOfBudget: 0,
        truncated: true,
        droppedEntries: section.content.split("\n").length,
      })
    }
  }

  return { systemPrompt: result.trim(), accounting }
}

// ---------------------------------------------------------------------------
// Line-based truncation (drops from end = lowest-ranked entries)
// ---------------------------------------------------------------------------

function truncateByLines(
  content: string,
  maxChars: number,
): { text: string; droppedLines: number } {
  const lines = content.split("\n")
  let text = ""
  let included = 0

  for (const line of lines) {
    if (text.length + line.length + 1 > maxChars) break
    text += (included > 0 ? "\n" : "") + line
    included++
  }

  return {
    text,
    droppedLines: lines.length - included,
  }
}
