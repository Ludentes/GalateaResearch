import type { DecisionStage, DecisionStep, KnowledgeEntry } from "./types"

const MAX_DECISIONS = 50

export function createPipelineRunId(stage: string): string {
  return `${stage}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
}

export function addDecision(
  entry: KnowledgeEntry,
  step: Omit<DecisionStep, "timestamp">,
): KnowledgeEntry {
  const decision: DecisionStep = {
    ...step,
    timestamp: new Date().toISOString(),
  }
  return {
    ...entry,
    decisions: [...(entry.decisions ?? []), decision],
  }
}

export function capDecisions(entry: KnowledgeEntry): KnowledgeEntry {
  if (!entry.decisions || entry.decisions.length <= MAX_DECISIONS) return entry
  return {
    ...entry,
    decisions: entry.decisions.slice(-MAX_DECISIONS),
  }
}

export function getDecisionsByStage(
  entry: KnowledgeEntry,
  stage: DecisionStage,
): DecisionStep[] {
  return (entry.decisions ?? []).filter((d) => d.stage === stage)
}
