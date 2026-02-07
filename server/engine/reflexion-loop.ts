/**
 * Phase 3: Reflexion Loop (Stage C + Stage E LLM Integration)
 *
 * Implements Draft → Critique → Revise loop for Level 3 tasks.
 * Used when tasks require deep reasoning, have knowledge gaps,
 * or involve high-stakes/irreversible actions.
 *
 * Loop Flow:
 * 1. Generate initial draft
 * 2. Gather evidence to support/refute draft
 * 3. Critique draft against evidence
 * 4. If critique fails: revise draft and repeat
 * 5. If critique passes OR max iterations: return final draft
 *
 * Exit Conditions:
 * - Critique passes (issues.length === 0 or all minor)
 * - Max iterations reached (default: 3)
 *
 * Usage:
 *   const loop = new ReflexionLoop(model)
 *   const result = await loop.execute(task, context, maxIterations)
 */

import type { LanguageModel } from "ai"
import { generateText } from "ai"
import type {
  AgentContext,
  Critique,
  Evidence,
  Issue,
  ReflexionIteration,
  ReflexionResult,
  Task,
} from "./types"

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MAX_ITERATIONS = 3

// ============================================================================
// ReflexionLoop Class
// ============================================================================

/**
 * Reflexion Loop for Level 3 tasks.
 *
 * Executes Draft → Critique → Revise cycle until draft passes
 * critique or max iterations reached.
 */
export class ReflexionLoop {
  private model: LanguageModel

  constructor(model: LanguageModel) {
    this.model = model
  }

  /**
   * Execute reflexion loop for a task.
   *
   * @param task - Task requiring deep reasoning
   * @param context - Agent context (memory, history, etc.)
   * @param maxIterations - Maximum loop iterations (default: 3)
   * @returns Reflexion result with final draft and trace
   */
  async execute(
    task: Task,
    context: AgentContext,
    maxIterations: number = DEFAULT_MAX_ITERATIONS,
  ): Promise<ReflexionResult> {
    const iterations: ReflexionIteration[] = []
    let currentDraft = ""
    let totalLlmCalls = 0

    // Main reflexion loop
    for (let i = 0; i < maxIterations; i++) {
      const iterationNum = i + 1

      // Step 1: Generate draft (or revise previous)
      if (i === 0) {
        currentDraft = await this._generateInitialDraft(task, context)
        totalLlmCalls++
      } else {
        const previousCritique = iterations[i - 1].critique
        currentDraft = await this._reviseDraft(
          task,
          context,
          currentDraft,
          previousCritique,
        )
        totalLlmCalls++
      }

      // Step 2: Gather evidence
      const evidence = await this._gatherEvidence(task, currentDraft, context)

      // Step 3: Generate critique
      const critique = await this._generateCritique(
        task,
        currentDraft,
        evidence,
      )
      totalLlmCalls++

      // Store iteration
      iterations.push({
        iteration_number: iterationNum,
        draft: currentDraft,
        evidence,
        critique,
        revised: i > 0,
      })

      // Step 4: Check exit conditions
      if (critique.passes) {
        return {
          final_draft: currentDraft,
          iterations,
          total_llm_calls: totalLlmCalls,
          success: true,
        }
      }

      // Check if max iterations reached
      if (i === maxIterations - 1) {
        return {
          final_draft: currentDraft,
          iterations,
          total_llm_calls: totalLlmCalls,
          success: false,
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      final_draft: currentDraft,
      iterations,
      total_llm_calls: totalLlmCalls,
      success: false,
    }
  }

  /**
   * Generate initial draft for task.
   * This is the first attempt before any critique.
   *
   * @param task - Task to draft response for
   * @param context - Agent context with history and retrieved knowledge
   * @returns Initial draft text
   */
  private async _generateInitialDraft(
    task: Task,
    context: AgentContext,
  ): Promise<string> {
    const prompt = `Generate a response to this task. Focus on addressing the core request with available knowledge.

Task: ${task.message}

Context from conversation history:
${context.messageHistory?.slice(-3).map((m) => `${m.role}: ${m.content}`).join("\n") || "No previous messages"}

Retrieved Knowledge:
${context.retrievedFacts?.map((f) => `- ${f.content} (confidence: ${f.confidence})`).join("\n") || "No retrieved facts"}

${context.retrievedProcedures && context.retrievedProcedures.length > 0 ? `Available Procedures:\n${context.retrievedProcedures.map((p) => `- ${p.name} (success rate: ${(p.success_rate * 100).toFixed(0)}%)`).join("\n")}` : ""}

Generate a comprehensive draft response. Don't worry about perfection - this draft will be critiqued and revised if needed.`

    const result = await generateText({
      model: this.model,
      prompt,
    })

    return result.text
  }

  /**
   * Revise draft based on critique feedback.
   *
   * @param task - Original task
   * @param context - Agent context
   * @param previousDraft - Draft that failed critique
   * @param critique - Critique with issues to address
   * @returns Revised draft
   */
  private async _reviseDraft(
    task: Task,
    context: AgentContext,
    previousDraft: string,
    critique: Critique,
  ): Promise<string> {
    const issuesText = critique.issues
      .map((issue) => {
        let text = `[${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`
        if (issue.suggested_fix) {
          text += `\n  Suggestion: ${issue.suggested_fix}`
        }
        return text
      })
      .join("\n\n")

    const prompt = `Revise the draft to address the identified issues.

Original Task: ${task.message}

Previous Draft:
${previousDraft}

Issues to Address:
${issuesText}

Context from conversation history:
${context.messageHistory?.slice(-3).map((m) => `${m.role}: ${m.content}`).join("\n") || "No previous messages"}

Retrieved Knowledge:
${context.retrievedFacts?.map((f) => `- ${f.content}`).join("\n") || "No retrieved facts"}

Generate an improved version that:
1. Fixes all CRITICAL and MAJOR issues
2. Addresses MINOR issues where possible
3. Preserves correct parts of the previous draft
4. Maintains clarity and coherence

Return ONLY the revised draft (no meta-commentary).`

    const result = await generateText({
      model: this.model,
      prompt,
    })

    return result.text
  }

  /**
   * Gather evidence to support or refute draft.
   * Uses memory from agent context (retrieved facts and procedures).
   *
   * @param _task - Task being drafted for
   * @param _draft - Current draft to gather evidence for
   * @param context - Agent context with retrieved facts and procedures
   * @returns Evidence array
   */
  private async _gatherEvidence(
    _task: Task,
    _draft: string,
    context: AgentContext,
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = []

    // Gather from retrieved facts
    if (context.retrievedFacts) {
      for (const fact of context.retrievedFacts) {
        evidence.push({
          source: "memory",
          content: fact.content,
          relevance: fact.confidence,
          supports_claim: `Fact from memory (confidence: ${fact.confidence})`,
        })
      }
    }

    // Gather from retrieved procedures
    if (context.retrievedProcedures) {
      for (const proc of context.retrievedProcedures) {
        evidence.push({
          source: "memory",
          content: `Procedure: ${proc.name} (${(proc.success_rate * 100).toFixed(0)}% success rate)`,
          relevance: proc.success_rate,
          supports_claim: `Established procedure`,
        })
      }
    }

    // If no evidence from context, return empty array
    return evidence
  }

  /**
   * Generate critique of draft based on evidence.
   *
   * Determines if draft is acceptable or needs revision.
   *
   * @param task - Original task
   * @param draft - Draft to critique
   * @param evidence - Evidence gathered
   * @returns Critique with pass/fail decision
   */
  private async _generateCritique(
    task: Task,
    draft: string,
    evidence: Evidence[],
  ): Promise<Critique> {
    const prompt = `Review this draft response and identify any issues.

Original Task: ${task.message}

Draft Response:
${draft}

Available Evidence:
${evidence.length > 0 ? evidence.map((e) => `- [${e.source}] ${e.content} (relevance: ${e.relevance})`).join("\n") : "No evidence available"}

Identify issues in THREE categories:

1. MISSING: What key information is absent from the draft?
2. UNSUPPORTED: What claims in the draft lack evidence?
3. INCORRECT: What statements contradict the available evidence?

For each issue found, provide:
- type: "missing" | "unsupported" | "incorrect"
- description: Clear explanation of the issue
- severity: "minor" | "major" | "critical"
- suggested_fix: Actionable suggestion (optional)

Format your response as JSON:
{
  "issues": [
    {"type": "missing", "description": "...", "severity": "major", "suggested_fix": "..."}
  ],
  "confidence": 0.8,
  "passes": false
}

Rules for "passes":
- true if issues array is empty OR all issues are "minor"
- false if there are any "major" or "critical" issues

IMPORTANT: Be strict but fair. Only flag real issues. If the draft is good, return empty issues array with passes: true.`

    const result = await generateText({
      model: this.model,
      prompt,
    })

    // Parse JSON response
    try {
      const parsed = JSON.parse(result.text) as {
        issues: Issue[]
        confidence: number
        passes: boolean
      }

      // Validate and return
      return {
        issues: parsed.issues || [],
        confidence: parsed.confidence || 0.5,
        passes: parsed.passes !== undefined ? parsed.passes : true,
      }
    } catch (error) {
      // If JSON parsing fails, assume draft passes (graceful degradation)
      console.warn("[ReflexionLoop] Failed to parse critique JSON:", error)
      return {
        issues: [],
        confidence: 0.5,
        passes: true,
      }
    }
  }
}

/**
 * Create a new ReflexionLoop instance.
 * Convenience factory function.
 */
export function createReflexionLoop(model: LanguageModel): ReflexionLoop {
  return new ReflexionLoop(model)
}
