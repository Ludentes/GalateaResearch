import type { Artifact } from "../agent/artifact"
import type { TaskState } from "../agent/operational-memory"
import type { KnowledgeEntry } from "./types"

export function createWorkKnowledge(
  task: TaskState,
  agentId: string,
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = []

  // Main fact: what was completed
  const progressSummary =
    task.progress.length > 0
      ? ` Steps: ${task.progress.join("; ")}.`
      : ""
  const artifactSummary =
    task.artifacts.length > 0
      ? ` Artifacts: ${task.artifacts.map(summarizeArtifact).join(", ")}.`
      : ""

  entries.push({
    id: `work-${task.id}-fact`,
    type: "fact",
    content: `Completed ${task.type} task: ${task.description}.${progressSummary}${artifactSummary}`,
    confidence: 1,
    entities: extractEntities(task),
    source: `task:${task.id}`,
    extractedAt: new Date().toISOString(),
    about: { entity: agentId, type: "agent" },
    origin: "observed-pattern",
  })

  return entries
}

function summarizeArtifact(artifact: Artifact): string {
  if (artifact.url) {
    return `${artifact.type}: ${artifact.description} (${artifact.url})`
  }
  if (artifact.path) {
    return `${artifact.type}: ${artifact.description} (${artifact.path})`
  }
  return `${artifact.type}: ${artifact.description}`
}

function extractEntities(task: TaskState): string[] {
  const entities: string[] = []
  // Extract issue references (#NNN)
  const issueRefs = task.description.match(/#\d+/g)
  if (issueRefs) entities.push(...issueRefs)
  // Extract MR references (!NNN)
  const mrRefs = task.description.match(/!\d+/g)
  if (mrRefs) entities.push(...mrRefs)
  // Extract from artifacts
  for (const a of task.artifacts) {
    const artifactMrs = a.description.match(/!\d+/g)
    if (artifactMrs) entities.push(...artifactMrs)
    const artifactIssues = a.description.match(/#\d+/g)
    if (artifactIssues) entities.push(...artifactIssues)
  }
  return [...new Set(entities)]
}
