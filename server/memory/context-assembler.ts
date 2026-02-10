/**
 * Context assembly pipeline — combines preprompts, Graphiti knowledge, and cognitive models.
 *
 * Pipeline steps:
 *   1. Retrieve active preprompts (hard rules + procedures)
 *   2. Search Graphiti for relevant facts
 *   3. Score and rank facts
 *   4. Retrieve cognitive models (self-model + user-model) if personaId/userName provided
 *   5. Allocate token budget across sections
 *   6. Assemble prompt sections by priority:
 *      - Priority 1: CONSTRAINTS (hard rules)
 *      - Priority 2: RELEVANT PROCEDURES (procedural knowledge)
 *      - Priority 3: RELEVANT KNOWLEDGE (Graphiti facts)
 *      - Priority 4: SELF-AWARENESS (self-model)
 *      - Priority 5: USER CONTEXT (user-model)
 *   7. Return assembled system prompt
 *
 * Graceful degradation: if Graphiti is unreachable or cognitive models are empty,
 * falls back to preprompts-only (same behavior as Phase 1).
 */

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { preprompts } from "../db/schema"
import { getSelfModel, getUserModel } from "./cognitive-models"
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

/** Format self-model for prompt injection */
function formatSelfModel(model: {
  strengths: string[]
  weaknesses: string[]
  recentMisses: string[]
}): string {
  const parts: string[] = []

  if (model.strengths.length > 0) {
    parts.push("**Strengths:**")
    parts.push(...model.strengths.map((s) => `- ${s}`))
    parts.push("")
  }

  if (model.weaknesses.length > 0) {
    parts.push("**Areas for Improvement:**")
    parts.push(...model.weaknesses.map((w) => `- ${w}`))
    parts.push("")
  }

  if (model.recentMisses.length > 0) {
    parts.push("**Recent Lessons:**")
    parts.push(...model.recentMisses.map((m) => `- ${m}`))
  }

  return parts.join("\n").trim()
}

/** Format user-model for prompt injection */
function formatUserModel(model: {
  preferences: string[]
  expectations: string[]
  communicationStyle: string | null
}): string {
  const parts: string[] = []

  if (model.preferences.length > 0) {
    parts.push("**User Preferences:**")
    parts.push(...model.preferences.map((p) => `- ${p}`))
    parts.push("")
  }

  if (model.expectations.length > 0) {
    parts.push("**User Expectations:**")
    parts.push(...model.expectations.map((e) => `- ${e}`))
    parts.push("")
  }

  if (model.communicationStyle) {
    parts.push("**Communication Style:**")
    parts.push(model.communicationStyle)
  }

  return parts.join("\n").trim()
}

/** Truncate text to fit token budget, preserving complete lines */
function truncateToTokenBudget(text: string, budget: number): string {
  const lines = text.split("\n")
  const result: string[] = []
  let currentTokens = 0

  for (const line of lines) {
    const lineTokens = estimateTokens(line + "\n")
    if (currentTokens + lineTokens > budget) break
    result.push(line)
    currentTokens += lineTokens
  }

  return result.join("\n").trim()
}

/**
 * Assemble the system prompt with knowledge from Graphiti.
 *
 * @param _sessionId - Current session ID (reserved for future session-scoped search)
 * @param userMessage - Latest user message (used as search query)
 * @param budget - Token budget allocation (optional)
 * @param options - Optional configuration (personaId, userName)
 */
export async function assembleContext(
  _sessionId: string,
  userMessage: string,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
  options?: {
    personaId?: string
    userName?: string
  },
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
  // Search without group_ids filter so facts from all sessions are accessible.
  // Facts are ingested with session-specific group_ids, but for a single-user app
  // all knowledge should be retrievable across sessions.
  const facts = await searchFacts(userMessage, [], 20)

  // Step 3: Score and rank
  const scored = scoreFacts(facts)

  // Step 5a: Allocate budget for facts (part of token budget allocation)
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

  // Step 4: Retrieve and format cognitive models (if personaId or userName provided)
  let selfModelTokens = 0
  let userModelTokens = 0

  if (options?.personaId) {
    const selfModel = await getSelfModel(options.personaId)
    const selfModelContent = formatSelfModel(selfModel)

    if (selfModelContent) {
      const tokenBudget = budget.models / 2 // Split budget between self and user models
      const truncatedContent = truncateToTokenBudget(
        selfModelContent,
        tokenBudget,
      )
      selfModelTokens = estimateTokens(truncatedContent)

      sections.push({
        name: "SELF-AWARENESS",
        priority: 4,
        content: truncatedContent,
        truncatable: true,
        tokenEstimate: selfModelTokens,
      })
    }
  }

  if (options?.userName) {
    const userModel = await getUserModel(options.userName)
    const userModelContent = formatUserModel(userModel)

    if (userModelContent) {
      const tokenBudget = budget.models / 2 // Split budget between self and user models
      const truncatedContent = truncateToTokenBudget(
        userModelContent,
        tokenBudget,
      )
      userModelTokens = estimateTokens(truncatedContent)

      sections.push({
        name: "USER CONTEXT",
        priority: 5,
        content: truncatedContent,
        truncatable: true,
        tokenEstimate: userModelTokens,
      })
    }
  }

  // Step 6: Assemble by priority
  sections.sort((a, b) => a.priority - b.priority)

  const systemPrompt = sections
    .map((s) => `## ${s.name}\n${s.content}`)
    .join("\n\n")

  const totalTokens = sections.reduce((sum, s) => sum + s.tokenEstimate, 0)

  return {
    sections,
    systemPrompt,
    scoredFacts: scored.slice(0, factsIncluded),
    metadata: {
      totalTokens,
      retrievalStats: {
        hardRulesCount: hardRules.length,
        factsRetrieved: factsIncluded,
        proceduresMatched: procedures.length,
        episodesIncluded: 0,
      },
      assemblyTimeMs: Date.now() - start,
      selfModelTokens: selfModelTokens > 0 ? selfModelTokens : undefined,
      userModelTokens: userModelTokens > 0 ? userModelTokens : undefined,
    },
  }
}
