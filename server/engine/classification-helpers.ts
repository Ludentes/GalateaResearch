/**
 * Phase 3: Activity Router - Classification Helpers
 *
 * Helper functions for classifying tasks into activity levels.
 * These are pattern-based, deterministic checks (no LLM calls).
 */

import type { Procedure, Task } from "./types"

/**
 * Check if task is a direct tool call (Level 0).
 *
 * Tool calls are MCP tool invocations that can be executed
 * without LLM reasoning (e.g., git status, file read).
 *
 * @param task - Task to check
 * @returns True if task is a tool call
 */
export function isDirectToolCall(task: Task): boolean {
  return task.isToolCall ?? false
}

/**
 * Check if message is a template/boilerplate (Level 0).
 *
 * Templates are predefined responses that don't require
 * LLM generation (e.g., "Task completed", "PR created").
 *
 * Detection: Simple patterns for common templates.
 *
 * @param task - Task to check
 * @returns True if message is a template
 */
export function isTemplateMessage(task: Task): boolean {
  if (task.isTemplate) {
    return true
  }

  const message = task.message.toLowerCase().trim()

  // Common template patterns
  const templatePatterns = [
    /^done$/i,
    /^ok$/i,
    /^yes$/i,
    /^no$/i,
    /^ready$/i,
    /^completed?$/i,
    /^task completed$/i,
    /^pr created$/i,
    /^tests? (pass|passing)$/i,
  ]

  return templatePatterns.some((pattern) => pattern.test(message))
}

/**
 * Check if action is irreversible (requires Level 3).
 *
 * Irreversible actions cannot be undone and require
 * extra caution (e.g., force push, drop table, delete production data).
 *
 * Detection: Keyword-based with high-risk actions.
 *
 * @param task - Task to check
 * @returns True if action is irreversible
 */
export function isIrreversibleAction(task: Task): boolean {
  if (task.isIrreversible) {
    return true
  }

  const message = task.message.toLowerCase()

  // High-risk irreversible keywords
  const irreversibleKeywords = [
    "force push",
    "force-push",
    "--force",
    "git push -f",
    "drop table",
    "drop database",
    "delete database",
    "rm -rf",
    "delete production",
    "prod deploy",
    "deploy to production",
    "hard reset",
    "git reset --hard",
    "delete branch",
    "prune",
    "truncate table",
  ]

  return irreversibleKeywords.some((keyword) => message.includes(keyword))
}

/**
 * Check if task indicates high stakes (requires caution).
 *
 * High-stakes tasks have significant consequences if done incorrectly
 * (e.g., production deployment, public release, security changes).
 *
 * Detection: Keyword-based with high-impact contexts.
 *
 * @param task - Task to check
 * @returns True if task is high-stakes
 */
export function isHighStakesAction(task: Task): boolean {
  if (task.isHighStakes) {
    return true
  }

  const message = task.message.toLowerCase()

  // High-stakes contexts
  const highStakesKeywords = [
    "production",
    "deploy",
    "release",
    "publish",
    "security",
    "authentication",
    "authorization",
    "permissions",
    "credentials",
    "database migration",
    "schema change",
    "public api",
    "breaking change",
  ]

  return highStakesKeywords.some((keyword) => message.includes(keyword))
}

/**
 * Check if task has a knowledge gap (requires research).
 *
 * Knowledge gaps indicate the agent doesn't have enough
 * information to proceed confidently.
 *
 * Detection: Uncertainty markers in message.
 *
 * @param task - Task to check
 * @returns True if knowledge gap detected
 */
export function hasKnowledgeGap(task: Task): boolean {
  if (task.hasKnowledgeGap) {
    return true
  }

  const message = task.message.toLowerCase()

  // Uncertainty/question markers
  const uncertaintyMarkers = [
    "how do i",
    "how to",
    "not sure",
    "don't know",
    "unclear",
    "help me",
    "what is",
    "explain",
    "never done",
    "first time",
  ]

  return uncertaintyMarkers.some((marker) => message.includes(marker))
}

/**
 * Check if procedure is strong enough for Level 1.
 *
 * Strong procedures have high success rates (>0.8) and
 * sufficient usage history (>5 times).
 *
 * @param procedure - Procedure to check (if any)
 * @returns True if procedure is strong enough for Level 1
 */
export function hasProcedureMatch(procedure: Procedure | null): boolean {
  if (!procedure) {
    return false
  }

  const MIN_SUCCESS_RATE = 0.8
  const MIN_TIMES_USED = 5

  return (
    procedure.success_rate >= MIN_SUCCESS_RATE &&
    procedure.times_used >= MIN_TIMES_USED
  )
}

/**
 * Enrich task with computed flags.
 *
 * Runs all helper checks and adds flags to task object.
 * Useful for debugging and testing classification logic.
 *
 * @param task - Task to enrich
 * @returns Enriched task with all flags computed
 */
export function enrichTaskWithFlags(task: Task): Task {
  return {
    ...task,
    isToolCall: task.isToolCall ?? isDirectToolCall(task),
    isTemplate: task.isTemplate ?? isTemplateMessage(task),
    isIrreversible: task.isIrreversible ?? isIrreversibleAction(task),
    isHighStakes: task.isHighStakes ?? isHighStakesAction(task),
    hasKnowledgeGap: task.hasKnowledgeGap ?? hasKnowledgeGap(task),
  }
}
