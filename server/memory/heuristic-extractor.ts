import { getArtifactConfig } from "../engine/config"
import { addDecision, createPipelineRunId } from "./decision-trace"
import { classifyTurn } from "./signal-classifier"
import type {
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

const KEBAB_CASE_RE = /\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g
const CAPITALIZED_WORD_RE = /\b[A-Z][a-zA-Z0-9]+\b/g

export function extractHeuristic(
  turn: TranscriptTurn,
  classification: SignalClassification,
  source: string,
): HeuristicExtractionResult {
  const mapping = SIGNAL_TO_KNOWLEDGE[classification.type]
  if (!mapping) {
    return { entries: [], handled: false }
  }

  const runId = createPipelineRunId("heuristic")
  const text = turn.content.trim()

  let content: string
  let knowledgeType = mapping.type
  let confidence = mapping.confidence

  if (classification.type === "remember") {
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
  } else {
    content = extractSentence(text, classification.matchIndex)
  }

  const entities = extractEntities(text)
  const novelty = determineNovelty(content)

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
