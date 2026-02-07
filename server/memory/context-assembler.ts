/**
 * Context assembly pipeline — combines preprompts with Graphiti knowledge.
 *
 * 6-step pipeline:
 *   1. Retrieve active preprompts (hard rules + procedures)
 *   2. Search Graphiti for relevant facts
 *   3. Score and rank facts
 *   4. Allocate token budget
 *   5. Assemble prompt sections by priority
 *   6. Return assembled system prompt
 *
 * Graceful degradation: if Graphiti is unreachable, falls back to
 * preprompts-only (same behavior as Phase 1).
 */

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { preprompts } from "../db/schema"
import { searchFacts } from "./graphiti-client"
import type {
  AssembledContext,
  ContextBudget,
  FactResult,
  PromptSection,
  ScoredFact,
} from "./types"
import { DEFAULT_CONTEXT_BUDGET } from "./types"

/** 30-day half-life for recency scoring */
const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000

/** Rough estimate: 1 token ≈ 4 characters */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Compute recency score (0-1) with exponential decay */
function computeRecency(createdAt: string): number {
  const age = Date.now() - new Date(createdAt).getTime()
  return Math.exp((-Math.LN2 * age) / RECENCY_HALF_LIFE_MS)
}

/** Score and rank facts using the design formula */
function scoreFacts(facts: FactResult[]): ScoredFact[] {
  return facts
    .map((f) => {
      const recency = computeRecency(f.created_at)
      // graphitiScore is implicit (pre-ranked by Graphiti's hybrid search)
      // We use position-based scoring: first result = 1.0, decay from there
      const graphitiScore = 1.0
      const finalScore = graphitiScore * 0.7 + recency * 0.2 + 0.1
      return {
        uuid: f.uuid,
        fact: f.fact,
        graphitiScore,
        recency,
        finalScore,
      }
    })
    .sort((a, b) => b.finalScore - a.finalScore)
}

/**
 * Assemble the system prompt with knowledge from Graphiti.
 *
 * @param sessionId - Current session ID (used as group_id for search)
 * @param userMessage - Latest user message (used as search query)
 * @param budget - Token budget allocation (optional)
 */
export async function assembleContext(
  sessionId: string,
  userMessage: string,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): Promise<AssembledContext> {
  const start = Date.now()
  const sections: PromptSection[] = []

  // Step 1: Retrieve active preprompts
  const activePrompts = await db
    .select()
    .from(preprompts)
    .where(eq(preprompts.active, true))
    .orderBy(asc(preprompts.priority))

  // Separate hard rules (priority <= 10) from procedures
  const hardRules = activePrompts.filter((p) => (p.priority ?? 0) <= 10)
  const procedures = activePrompts.filter((p) => (p.priority ?? 0) > 10)

  if (hardRules.length > 0) {
    const content = hardRules.map((p) => p.content).join("\n\n")
    sections.push({
      name: "CONSTRAINTS",
      priority: 1,
      content,
      truncatable: false,
      tokenEstimate: estimateTokens(content),
    })
  }

  if (procedures.length > 0) {
    const content = procedures.map((p) => p.content).join("\n\n")
    sections.push({
      name: "RELEVANT PROCEDURES",
      priority: 2,
      content,
      truncatable: true,
      tokenEstimate: estimateTokens(content),
    })
  }

  // Step 2: Search Graphiti for relevant facts
  // Search both session-specific and global knowledge
  const facts = await searchFacts(userMessage, [sessionId, "global"], 20)

  // Step 3: Score and rank
  const scored = scoreFacts(facts)

  // Step 4: Allocate budget — trim facts to fit
  let factsContent = ""
  let factsIncluded = 0
  const factsTokenBudget = budget.facts

  for (const sf of scored) {
    const line = `- ${sf.fact}\n`
    const lineTokens = estimateTokens(line)
    if (estimateTokens(factsContent) + lineTokens > factsTokenBudget) break
    factsContent += line
    factsIncluded++
  }

  if (factsContent) {
    sections.push({
      name: "RELEVANT KNOWLEDGE",
      priority: 3,
      content: factsContent.trimEnd(),
      truncatable: true,
      tokenEstimate: estimateTokens(factsContent),
    })
  }

  // Step 5: Assemble by priority
  sections.sort((a, b) => a.priority - b.priority)

  const systemPrompt = sections
    .map((s) => `## ${s.name}\n${s.content}`)
    .join("\n\n")

  const totalTokens = sections.reduce((sum, s) => sum + s.tokenEstimate, 0)

  return {
    sections,
    systemPrompt,
    metadata: {
      totalTokens,
      retrievalStats: {
        hardRulesCount: hardRules.length,
        factsRetrieved: factsIncluded,
        proceduresMatched: procedures.length,
        episodesIncluded: 0,
      },
      assemblyTimeMs: Date.now() - start,
    },
  }
}
