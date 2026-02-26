import { getArtifactConfig } from "../engine/config"
import { addDecision, createPipelineRunId } from "./decision-trace"
import { classifyTurn } from "./signal-classifier"
import { stripIdeWrappers } from "./transcript-reader"
import type {
  KnowledgeAbout,
  KnowledgeEntry,
  KnowledgeNovelty,
  KnowledgeOrigin,
  KnowledgeType,
  SignalClassification,
  TranscriptTurn,
} from "./types"

/**
 * Heuristic extraction — converts signal-classified turns into KnowledgeEntry
 * objects without calling the LLM. Handles clear-cut patterns only.
 */

export interface HeuristicExtractionResult {
  entries: KnowledgeEntry[]
  handled: boolean
}

const SIGNAL_TO_KNOWLEDGE: Record<
  string,
  {
    type: KnowledgeType
    confidence: number
    origin: KnowledgeOrigin
  }
> = {
  preference: {
    type: "preference",
    confidence: 0.95,
    origin: "explicit-statement",
  },
  correction: {
    type: "correction",
    confidence: 0.9,
    origin: "explicit-statement",
  },
  policy: { type: "rule", confidence: 0.95, origin: "explicit-statement" },
  imperative_rule: {
    type: "rule",
    confidence: 0.95,
    origin: "explicit-statement",
  },
  decision: {
    type: "decision",
    confidence: 0.9,
    origin: "explicit-statement",
  },
  procedure: {
    type: "procedure",
    confidence: 0.85,
    origin: "explicit-statement",
  },
  remember: { type: "fact", confidence: 1.0, origin: "explicit-statement" },
  forget: { type: "forget", confidence: 1.0, origin: "explicit-statement" },
}

/** Words to exclude from entity extraction (common sentence starters, pronouns, etc.) */
const ENTITY_STOP_WORDS = new Set([
  "I",
  "The",
  "We",
  "It",
  "This",
  "That",
  "My",
  "Our",
  "No",
  "Yes",
  "And",
  "But",
  "Or",
  "So",
  "If",
])

/**
 * Check if a decision lacks standalone context (references prior turn).
 * Returns true if the decision content is just a number, letter,
 * pronoun, or anaphoric reference — meaning it can't be understood
 * without seeing the preceding assistant message.
 */
function isContextFreeDecision(content: string): boolean {
  const afterTrigger = content
    .replace(/let'?s\s+(go with|use|choose|pick)\s*/i, "")
    .replace(/i'?ve decided\s*/i, "")
    .replace(/we'?ll use\s*/i, "")
    .replace(/the decision is\s*/i, "")
    .trim()
    .replace(/\s*i\s+(think|guess|suppose)\s*$/i, "")
    .trim()

  // Too short — likely a reference to options in previous turn
  if (afterTrigger.length < 4) return true

  // Pure number/letter option selection
  if (/^[a-z0-9][.)]?$/i.test(afterTrigger)) return true

  // Anaphoric references
  if (
    /^(it|this|that|your suggestion|the same|option\s*\d|the\s+(first|second|third|fourth|fifth)\s*(one|option)?)\b/i.test(
      afterTrigger,
    )
  )
    return true

  return false
}

/**
 * Check if a procedure is session-specific (one-time task instruction).
 * Returns true if the numbered steps are mostly about:
 * - Creating/reading/modifying specific files
 * - Git operations (commit, push, review)
 * - URLs or file path listings
 */
const SESSION_PROCEDURE_RE =
  /\b(create|read|commit|push|self-review|report back|check out|open|modify|replace|full content|full file|exact content)\b/i
const FILE_PATH_RE =
  /(?:\/[\w.-]+){2,}|`[^`]*\.[a-z]{1,4}`|\b\w+\.\w+\.[a-z]{2,4}\b/
const URL_RE = /https?:\/\//

function isSessionSpecificProcedure(steps: string): boolean {
  const lines = steps.split("\n").filter((l) => l.trim())
  if (lines.length === 0) return true

  let sessionSpecificCount = 0
  for (const line of lines) {
    if (
      SESSION_PROCEDURE_RE.test(line) ||
      FILE_PATH_RE.test(line) ||
      URL_RE.test(line)
    ) {
      sessionSpecificCount++
    }
  }

  // If majority of steps are session-specific, reject
  return sessionSpecificCount / lines.length > 0.5
}

const KEBAB_CASE_RE = /\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g
const CAPITALIZED_WORD_RE = /\b[A-Z][a-zA-Z0-9]+\b/g

/**
 * Parse numbered/lettered list items from assistant text.
 * Returns a map: identifier -> content (e.g., "1" -> "Use pnpm")
 */
function parseListOptions(text: string): Map<string, string> {
  const options = new Map<string, string>()
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.match(/^\s*([0-9]+|[a-zA-Z])[.)]\s*(.+)/)
    if (m) {
      options.set(m[1].toLowerCase(), m[2].trim())
    }
  }
  return options
}

const ORDINALS: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
}

/**
 * Resolve a context-free decision against the preceding assistant turn.
 * Returns resolved content string, or null if unresolvable.
 */
function resolveContextFreeDecision(
  userText: string,
  precedingTurn?: TranscriptTurn,
): string | null {
  if (!precedingTurn) return null

  const options = parseListOptions(precedingTurn.content)
  if (options.size === 0) return null

  // Extract the part after the decision trigger phrase
  const afterTrigger = userText
    .replace(/let'?s\s+(go with|use|choose|pick)\s*/i, "")
    .replace(/i'?ve decided\s*/i, "")
    .replace(/we'?ll use\s*/i, "")
    .replace(/the decision is\s*/i, "")
    .trim()
    .replace(/\s*i\s+(think|guess|suppose)\s*$/i, "")
    .trim()

  // Direct number/letter: "1", "A", "2"
  const directKey = afterTrigger.toLowerCase().replace(/[.)]/g, "").trim()
  if (options.has(directKey)) return options.get(directKey)!

  // Ordinal: "the first one", "second", "the third"
  for (const [word, num] of Object.entries(ORDINALS)) {
    if (afterTrigger.toLowerCase().includes(word) && options.has(num)) {
      return options.get(num)!
    }
  }

  return null
}

/**
 * Split a numbered list into individual items.
 * Handles: "1) text", "1. text", "1- text"
 */
function splitNumberedItems(
  text: string,
): { index: number; content: string }[] {
  const lines = text.split("\n")
  const items: { index: number; content: string }[] = []
  let current: { index: number; lines: string[] } | null = null

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.*)/)
    if (m) {
      if (current) {
        items.push({
          index: current.index,
          content: current.lines.join("\n").trim(),
        })
      }
      current = { index: Number(m[1]), lines: [m[2]] }
    } else if (current && line.trim()) {
      current.lines.push(line.trim())
    }
  }
  if (current) {
    items.push({
      index: current.index,
      content: current.lines.join("\n").trim(),
    })
  }

  return items
}

export function extractHeuristic(
  turn: TranscriptTurn,
  classification: SignalClassification,
  source: string,
  precedingTurn?: TranscriptTurn,
): HeuristicExtractionResult {
  const mapping = SIGNAL_TO_KNOWLEDGE[classification.type]
  if (!mapping) {
    return { entries: [], handled: false }
  }

  const runId = createPipelineRunId("heuristic")
  const text = stripIdeWrappers(turn.content)

  // Gate: reject decisions that lack standalone context,
  // but first try to resolve against preceding assistant turn
  if (classification.type === "decision" && isContextFreeDecision(text)) {
    const resolved = resolveContextFreeDecision(text, precedingTurn)
    if (!resolved) {
      return { entries: [], handled: true }
    }
    // Use the resolved content from the preceding turn's list
    const entities = extractEntities(resolved)
    const novelty = determineNovelty(resolved)
    const about = inferAbout(text, classification)
    const resolvedRunId = createPipelineRunId("heuristic")

    let entry: KnowledgeEntry = {
      id: crypto.randomUUID(),
      type: mapping.type,
      content: resolved,
      confidence: mapping.confidence,
      entities,
      evidence: text,
      source,
      extractedAt: new Date().toISOString(),
      novelty,
      origin: mapping.origin,
      about,
    }

    entry = addDecision(entry, {
      stage: "extraction",
      action: "pass",
      reason: "heuristic:context-free-resolved",
      inputs: {
        method: "heuristic",
        pattern: classification.pattern ?? "unknown",
        confidence: mapping.confidence,
        resolvedFrom: "preceding-turn",
      },
      pipelineRunId: resolvedRunId,
    })

    return { entries: [entry], handled: true }
  }

  let content: string
  let knowledgeType = mapping.type
  let confidence = mapping.confidence

  if (classification.type === "procedure") {
    // Try splitting numbered list items and re-classifying each
    const items = splitNumberedItems(text)
    if (items.length >= 2) {
      const subEntries: KnowledgeEntry[] = []
      for (const item of items) {
        const subTurn: TranscriptTurn = {
          role: "user",
          content: item.content,
        }
        const subClass = classifyTurn(subTurn)
        if (
          subClass.type !== "noise" &&
          subClass.type !== "factual" &&
          subClass.type !== "procedure"
        ) {
          const subResult = extractHeuristic(
            subTurn,
            subClass,
            source,
            precedingTurn,
          )
          subEntries.push(...subResult.entries)
        }
      }
      if (subEntries.length > 0) {
        return { entries: subEntries, handled: true }
      }
    }
    // Fall through to normal procedure extraction
    content = extractProcedureSteps(text)
    if (isSessionSpecificProcedure(content)) {
      return { entries: [], handled: true }
    }
  } else if (classification.type === "remember") {
    // Strip @remember prefix
    content = text.replace(/@remember\s*/i, "").trim()

    // Try to infer a more specific type by re-classifying the stripped content
    const stripped: TranscriptTurn = { role: "user", content }
    const reclass = classifyTurn(stripped)
    const remapping = SIGNAL_TO_KNOWLEDGE[reclass.type]
    if (remapping && reclass.type !== "remember") {
      knowledgeType = remapping.type
    }
    // Confidence stays 1.0 for @remember
  } else if (classification.type === "forget") {
    // Strip @forget prefix
    content = text.replace(/@forget\s*/i, "").trim()
  } else {
    content = extractSentence(text, classification.matchIndex)
  }

  const entities = extractEntities(text)
  const novelty = determineNovelty(content)
  const about = inferAbout(text, classification)

  let entry: KnowledgeEntry = {
    id: crypto.randomUUID(),
    type: knowledgeType,
    content,
    confidence,
    entities,
    evidence: text,
    source,
    extractedAt: new Date().toISOString(),
    novelty,
    origin: mapping.origin,
    about,
  }

  entry = addDecision(entry, {
    stage: "extraction",
    action: "pass",
    reason: `heuristic:${classification.pattern}`,
    inputs: {
      method: "heuristic",
      pattern: classification.pattern ?? "unknown",
      confidence,
    },
    pipelineRunId: runId,
  })

  return { entries: [entry], handled: true }
}

/**
 * Infer who/what the knowledge is about from the signal pattern and pronouns.
 *
 * "I prefer/always/never X" → user (personal preference/habit)
 * "We always/never/should X" → team (shared convention)
 * Bare imperative / decision / correction → project (codebase rule)
 * @remember → infer from content pronouns, default to project
 */
function inferAbout(
  text: string,
  classification: SignalClassification,
): KnowledgeAbout {
  const signalType = classification.type

  // "I ..." patterns → user model
  if (signalType === "preference") {
    return { entity: "user", type: "user" }
  }

  // "We ..." patterns → team model
  if (signalType === "policy") {
    return { entity: "team", type: "team" }
  }

  // @remember — check pronouns in content
  if (signalType === "remember") {
    if (/^i\b/i.test(text.replace(/@remember\s*/i, "").trim())) {
      return { entity: "user", type: "user" }
    }
    if (/^we\b/i.test(text.replace(/@remember\s*/i, "").trim())) {
      return { entity: "team", type: "team" }
    }
  }

  // Everything else: imperative_rule, decision, correction, procedure → project
  return { entity: "project", type: "project" }
}

/**
 * Extract just the numbered steps from a procedure.
 * Finds the numbered list and returns only those lines.
 */
function extractProcedureSteps(text: string): string {
  const lines = text.split("\n")
  const steps: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d+[.)]\s/.test(trimmed)) {
      inList = true
      steps.push(trimmed)
    } else if (
      inList &&
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("```")
    ) {
      // Continuation of a step (indented or wrapped)
      steps.push(trimmed)
    } else if (
      inList &&
      (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```"))
    ) {
      // End of list
      break
    }
  }

  return steps.length > 0 ? steps.join("\n") : text
}

/**
 * Extract the sentence containing the match position.
 * Splits on sentence boundaries (.!? followed by space or end).
 * Falls back to the full message if no boundary found.
 */
function extractSentence(text: string, matchIndex?: number): string {
  if (matchIndex === undefined) return text

  // Split on sentence boundaries: .!? followed by space or end
  const sentenceRe = /[^.!?]*[^.!?\s][^.!?]*[.!?]?/g
  const sentences: Array<{ start: number; end: number; text: string }> = []
  let m: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = sentenceRe.exec(text)) !== null) {
    sentences.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0].trim(),
    })
  }

  if (sentences.length === 0) return text

  // Find which sentence contains the match
  for (const s of sentences) {
    if (matchIndex >= s.start && matchIndex < s.end) {
      return s.text
    }
  }

  // Fallback: return full text
  return text
}

/**
 * Simple entity extraction:
 * - Capitalized words NOT at sentence start (proper nouns)
 * - Kebab-case terms (e.g. shadcn-ui, tanstack-start)
 * Returns lowercase, deduplicated.
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>()

  // Kebab-case terms
  const kebabMatches = text.match(KEBAB_CASE_RE)
  if (kebabMatches) {
    for (const k of kebabMatches) {
      entities.add(k.toLowerCase())
    }
  }

  // Capitalized words not at sentence start
  // First, find positions that are sentence starts
  const sentenceStartPositions = new Set<number>()
  sentenceStartPositions.add(0) // first char is always a sentence start

  // After .!? + whitespace
  const startRe = /[.!?]\s+/g
  let sm: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((sm = startRe.exec(text)) !== null) {
    sentenceStartPositions.add(sm.index + sm[0].length)
  }

  const capRe = new RegExp(CAPITALIZED_WORD_RE.source, "g")
  let cm: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((cm = capRe.exec(text)) !== null) {
    const word = cm[0]
    if (ENTITY_STOP_WORDS.has(word)) continue
    if (sentenceStartPositions.has(cm.index)) continue
    entities.add(word.toLowerCase())
  }

  return [...entities]
}

/**
 * Determine novelty by checking content against prior_overlap.common_patterns.
 * If any pattern matches, it's general knowledge; otherwise project-specific.
 */
function determineNovelty(content: string): KnowledgeNovelty {
  const { prior_overlap } = getArtifactConfig()
  for (const pattern of prior_overlap.common_patterns) {
    if (new RegExp(pattern, "i").test(content)) {
      return "general-knowledge"
    }
  }
  return "project-specific"
}
