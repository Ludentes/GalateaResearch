import { readFileSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import type {
  AgentContext,
  Dimension,
  DimensionState,
  HomeostasisState,
} from "./types"

// ============ Dimension Assessment ============

export function assessDimensions(ctx: AgentContext): HomeostasisState {
  return {
    knowledge_sufficiency: assessKnowledgeSufficiency(ctx),
    certainty_alignment: "HEALTHY", // Needs LLM self-assessment (Phase D)
    progress_momentum: assessProgressMomentum(ctx),
    communication_health: assessCommunicationHealth(ctx),
    productive_engagement: assessProductiveEngagement(ctx),
    knowledge_application: "HEALTHY", // Needs ratio tracking (Phase D)
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: "computed",
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: "computed",
    },
  }
}

function assessKnowledgeSufficiency(ctx: AgentContext): DimensionState {
  const facts = ctx.retrievedFacts || []
  if (facts.length === 0 && ctx.currentMessage.length > 20) return "LOW"
  if (facts.length > 10) return "HIGH"
  return "HEALTHY"
}

function assessProgressMomentum(ctx: AgentContext): DimensionState {
  const userMessages = ctx.messageHistory.filter((m) => m.role === "user")
  if (userMessages.length < 3) return "HEALTHY"

  // Detect repeated similar questions (user stuck)
  const recent = userMessages.slice(-3).map((m) => m.content.toLowerCase())
  const words = recent.map((m) =>
    new Set(m.split(/\W+/).filter((w) => w.length >= 3)),
  )
  if (words.length >= 3) {
    const overlap01 = jaccardSets(words[0], words[1])
    const overlap12 = jaccardSets(words[1], words[2])
    if (overlap01 > 0.5 || overlap12 > 0.5) return "LOW"
  }

  return "HEALTHY"
}

function assessCommunicationHealth(ctx: AgentContext): DimensionState {
  if (ctx.lastMessageTime) {
    const elapsed = Date.now() - ctx.lastMessageTime.getTime()
    const hours = elapsed / (1000 * 60 * 60)
    if (hours > 4) return "LOW"
  }
  return "HEALTHY"
}

function assessProductiveEngagement(ctx: AgentContext): DimensionState {
  if (
    !ctx.hasAssignedTask &&
    ctx.messageHistory.length === 0 &&
    !ctx.currentMessage
  ) {
    return "LOW"
  }
  return "HEALTHY"
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((w) => b.has(w))
  const union = new Set([...a, ...b])
  return union.size === 0 ? 0 : intersection.length / union.size
}

// ============ Guidance ============

interface GuidanceEntry {
  priority: number
  primary: string
  secondary?: string
}

interface GuidanceConfig {
  [dimension: string]: {
    LOW: GuidanceEntry
    HIGH: GuidanceEntry
  }
}

let _guidanceCache: GuidanceConfig | null = null

export function loadGuidanceText(): GuidanceConfig {
  if (_guidanceCache) return _guidanceCache
  const yamlPath = path.join(__dirname, "guidance.yaml")
  const raw = readFileSync(yamlPath, "utf-8")
  _guidanceCache = parseYaml(raw) as GuidanceConfig
  return _guidanceCache
}

export function getGuidance(state: HomeostasisState): string {
  const guidance = loadGuidanceText()
  const imbalanced: Array<{ dimension: Dimension; state: DimensionState; entry: GuidanceEntry }> = []

  for (const [dim, dimState] of Object.entries(state)) {
    if (dim === "assessed_at" || dim === "assessment_method") continue
    if (dimState === "HEALTHY") continue
    const dimGuidance = guidance[dim]?.[dimState as "LOW" | "HIGH"]
    if (dimGuidance) {
      imbalanced.push({
        dimension: dim as Dimension,
        state: dimState as DimensionState,
        entry: dimGuidance,
      })
    }
  }

  if (imbalanced.length === 0) return ""

  // Sort by priority (lower = higher priority)
  imbalanced.sort((a, b) => a.entry.priority - b.entry.priority)

  return imbalanced
    .map((g) => g.entry.primary.trim())
    .join("\n\n")
}
