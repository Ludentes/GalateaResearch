import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { getArtifactConfig } from "../engine/config"
import { routeEntries } from "./channel-router"
import { addDecision, createPipelineRunId } from "./decision-trace"
import { readEntries } from "./knowledge-store"
import type { KnowledgeEntry, KnowledgeType } from "./types"

// ============ New router-consuming API ============

export interface SkillFileResult {
  filename: string
  title: string
}

export interface HookPattern {
  id: string
  content: string
  type: string
  confidence: number
}

export interface HookPatternResult {
  written: boolean
  count: number
  patterns?: HookPattern[]
}

export interface GenerateAllResult {
  claudeMd: {
    written: boolean
    lines: number
    entryCount: number
    tracedEntries: KnowledgeEntry[]
  }
  skills: { files: SkillFileResult[]; count: number }
  hooks: { written: boolean; count: number }
  skipped: { count: number }
}

// Type ordering for CLAUDE.md sections (procedures excluded — they go to skills)
const CLAUDE_MD_SECTION_ORDER: KnowledgeType[] = [
  "rule",
  "preference",
  "correction",
  "decision",
  "fact",
]

const SECTION_HEADINGS: Record<string, string> = {
  rule: "## Rules",
  preference: "## Preferences",
  correction: "## Corrections",
  decision: "## Decisions",
  fact: "## Facts",
}

export interface ClaudeMdResult {
  markdown: string
  tracedEntries: KnowledgeEntry[]
}

/**
 * Generate CLAUDE.md from already-routed entries.
 * Entries should come from `routeEntries().claudeMd.entries`.
 */
export async function generateClaudeMdFromRouter(
  entries: KnowledgeEntry[],
  outputDir: string,
): Promise<ClaudeMdResult> {
  const cfg = getArtifactConfig()
  const runId = createPipelineRunId("claude-md-gen")

  const sections: string[] = []
  sections.push(cfg.claude_md.architecture_preamble)
  sections.push("")

  // Filter out procedures (those go to skills)
  const nonProcedures = entries.filter((e) => e.type !== "procedure")

  const tracedEntries: KnowledgeEntry[] = []

  for (const type of CLAUDE_MD_SECTION_ORDER) {
    const group = nonProcedures.filter((e) => e.type === type)
    if (group.length === 0) continue

    sections.push(SECTION_HEADINGS[type])
    sections.push("")
    for (const entry of group) {
      sections.push(`- ${entry.contentOverride ?? entry.content}`)
      tracedEntries.push(
        addDecision(entry, {
          stage: "claude-md-gen",
          action: "record",
          reason: "written to CLAUDE.md",
          pipelineRunId: runId,
        }),
      )
    }
    sections.push("")
  }

  const md = sections.join("\n")

  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, "CLAUDE.md"), md)

  return { markdown: md, tracedEntries }
}

/**
 * Generate skill files from already-routed entries.
 * Entries should come from `routeEntries().skills.entries`.
 */
export async function generateSkillFilesFromRouter(
  entries: KnowledgeEntry[],
  outputDir: string,
): Promise<SkillFileResult[]> {
  if (entries.length === 0) return []

  const cfg = getArtifactConfig()
  const maxLines = cfg.skills.max_lines_per_skill
  const runId = createPipelineRunId("skill-gen")

  const skillsDir = path.join(outputDir, "skills")
  await mkdir(skillsDir, { recursive: true })

  const results: SkillFileResult[] = []

  for (const entry of entries) {
    const displayContent = entry.contentOverride ?? entry.content
    const title = extractTitle(displayContent)
    const slug = slugify(title)
    const filename = `${slug}.md`

    // Truncate content to max_lines_per_skill
    const contentLines = displayContent.split("\n")
    const truncated =
      contentLines.length > maxLines
        ? contentLines.slice(0, maxLines).join("\n")
        : displayContent

    const content = [
      `# ${title}`,
      "",
      `> Auto-generated skill (confidence: ${entry.confidence.toFixed(2)})`,
      "",
      truncated,
      "",
    ].join("\n")

    await writeFile(path.join(skillsDir, filename), content)
    results.push({ filename, title })

    // Decision traced (immutable — return value available via generateAllArtifacts)
    addDecision(entry, {
      stage: "skill-gen",
      action: "record",
      reason: "written to skill file",
      inputs: { filename },
      pipelineRunId: runId,
    })
  }

  return results
}

/**
 * Generate hook patterns from already-routed entries.
 * Entries should come from `routeEntries().hooks.entries`.
 */
export async function generateHookPatterns(
  entries: KnowledgeEntry[],
  outputDir: string,
): Promise<HookPatternResult> {
  if (entries.length === 0) {
    return { written: false, count: 0 }
  }

  const cfg = getArtifactConfig()

  // Guard: if auto_convert is off, only allow human-curated entries
  if (!cfg.hooks.auto_convert) {
    const hasNonHuman = entries.some((e) => e.curatedBy !== "human")
    if (hasNonHuman) {
      return { written: false, count: 0 }
    }
  }

  const runId = createPipelineRunId("hook-gen")

  const patterns: HookPattern[] = entries.map((entry) => {
    addDecision(entry, {
      stage: "hook-gen",
      action: "record",
      reason: "written to hook patterns",
      pipelineRunId: runId,
    })
    return {
      id: entry.id,
      content: entry.contentOverride ?? entry.content,
      type: entry.type,
      confidence: entry.confidence,
    }
  })

  await mkdir(outputDir, { recursive: true })
  await writeFile(
    path.join(outputDir, cfg.hooks.learned_patterns_file),
    JSON.stringify(patterns, null, 2),
  )

  return { written: true, count: patterns.length, patterns }
}

/**
 * Orchestrator: read store → route → generate all artifacts.
 */
export async function generateAllArtifacts(
  storePath: string,
  outputDir: string,
): Promise<GenerateAllResult> {
  const allEntries = await readEntries(storePath)
  const routed = routeEntries(allEntries)

  const claudeMdResult = await generateClaudeMdFromRouter(
    routed.claudeMd.entries,
    outputDir,
  )
  const claudeMdLines = claudeMdResult.markdown.split("\n").length

  const skillFiles = await generateSkillFilesFromRouter(
    routed.skills.entries,
    outputDir,
  )

  const hookResult = await generateHookPatterns(routed.hooks.entries, outputDir)

  return {
    claudeMd: {
      written: true,
      lines: claudeMdLines,
      entryCount: routed.claudeMd.entries.length,
      tracedEntries: claudeMdResult.tracedEntries,
    },
    skills: {
      files: skillFiles,
      count: skillFiles.length,
    },
    hooks: {
      written: hookResult.written,
      count: hookResult.count,
    },
    skipped: {
      count: routed.skipped.entries.length,
    },
  }
}

// ============ Deprecated legacy API ============

const MIN_CONFIDENCE = 0.8

interface GenerateOptions {
  storePath: string
  outputDir: string
  minConfidence?: number
}

/**
 * @deprecated Use `generateClaudeMdFromRouter` instead.
 * This function reads from store and does its own filtering,
 * bypassing the channel router.
 */
export async function generateClaudeMd(
  options: GenerateOptions,
): Promise<string> {
  const { storePath, outputDir, minConfidence = MIN_CONFIDENCE } = options

  const allEntries = await readEntries(storePath)
  const active = allEntries.filter(
    (e) => !e.supersededBy && e.confidence >= minConfidence,
  )

  const rules = active.filter((e) => e.type === "rule")
  const preferences = active.filter((e) => e.type === "preference")
  const procedures = active.filter((e) => e.type === "procedure")
  const facts = active.filter((e) => e.type === "fact")

  const sections: string[] = []
  sections.push("# Project Knowledge (Auto-Generated by Galatea)")
  sections.push("")
  sections.push(
    "> This file is generated from learned knowledge. Do not edit manually.",
  )
  sections.push("")

  if (rules.length > 0) {
    sections.push("## Rules")
    sections.push("")
    for (const rule of rules) {
      sections.push(`- ${rule.content}`)
    }
    sections.push("")
  }

  if (preferences.length > 0) {
    sections.push("## Preferences")
    sections.push("")
    for (const pref of preferences) {
      sections.push(`- ${pref.content}`)
    }
    sections.push("")
  }

  if (procedures.length > 0) {
    sections.push("## Procedures")
    sections.push("")
    for (const proc of procedures) {
      sections.push(`### ${extractTitle(proc.content)}`)
      sections.push("")
      sections.push(proc.content)
      sections.push("")
    }
  }

  if (facts.length > 0) {
    sections.push("## Facts")
    sections.push("")
    for (const fact of facts) {
      sections.push(`- ${fact.content}`)
    }
    sections.push("")
  }

  const md = sections.join("\n")

  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, "CLAUDE.md"), md)

  return md
}

const SKILL_MIN_CONFIDENCE = 0.85

/**
 * @deprecated Use `generateSkillFilesFromRouter` instead.
 * This function reads from store and does its own filtering,
 * bypassing the channel router.
 */
export async function generateSkillFiles(
  options: GenerateOptions,
): Promise<SkillFileResult[]> {
  const { storePath, outputDir, minConfidence = SKILL_MIN_CONFIDENCE } = options

  const allEntries = await readEntries(storePath)
  const procedures = allEntries.filter(
    (e) =>
      !e.supersededBy &&
      e.type === "procedure" &&
      e.confidence >= minConfidence,
  )

  if (procedures.length === 0) return []

  const skillsDir = path.join(outputDir, "skills")
  await mkdir(skillsDir, { recursive: true })

  const results: SkillFileResult[] = []

  for (const proc of procedures) {
    const title = extractTitle(proc.content)
    const slug = slugify(title)
    const filename = `${slug}.md`

    const content = [
      `# ${title}`,
      "",
      `> Auto-generated skill from learned procedure (confidence: ${proc.confidence.toFixed(2)})`,
      "",
      proc.content,
      "",
    ].join("\n")

    await writeFile(path.join(skillsDir, filename), content)
    results.push({ filename, title })
  }

  return results
}

interface SubagentResult {
  filename: string
  name: string
}

interface SubagentOptions extends GenerateOptions {
  minProcedures?: number
}

/**
 * @deprecated Use hook patterns or skill files instead.
 * Generate subagent definitions from clusters of related procedures.
 * Groups procedures by common prefix (e.g., "Review PR: ..." -> code-reviewer agent).
 */
export async function generateSubagentDefinitions(
  options: SubagentOptions,
): Promise<SubagentResult[]> {
  const {
    storePath,
    outputDir,
    minProcedures = 3,
    minConfidence = SKILL_MIN_CONFIDENCE,
  } = options

  const allEntries = await readEntries(storePath)
  const procedures = allEntries.filter(
    (e) =>
      !e.supersededBy &&
      e.type === "procedure" &&
      e.confidence >= minConfidence,
  )

  // Group by common prefix (first 2 words)
  const groups = new Map<string, typeof procedures>()
  for (const proc of procedures) {
    const prefix = proc.content
      .split(/[\s:]+/)
      .slice(0, 2)
      .join(" ")
      .toLowerCase()
    const existing = groups.get(prefix) ?? []
    existing.push(proc)
    groups.set(prefix, existing)
  }

  const results: SubagentResult[] = []
  const agentsDir = path.join(outputDir, "agents")

  for (const [prefix, procs] of groups) {
    if (procs.length < minProcedures) continue

    await mkdir(agentsDir, { recursive: true })

    const agentName = slugify(prefix)
    const filename = `${agentName}.md`

    const isReviewAgent = prefix.includes("review")
    const allowedTools = isReviewAgent
      ? ["Read", "Grep", "Glob", "WebSearch"]
      : undefined

    const lines = [
      `# ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Agent`,
      "",
      `> Auto-generated subagent from ${procs.length} learned procedures`,
      "",
    ]

    if (allowedTools) {
      lines.push(`**Allowed tools:** ${allowedTools.join(", ")}`)
      lines.push("")
    }

    lines.push("## Procedures")
    lines.push("")
    for (const proc of procs) {
      lines.push(`- ${proc.content}`)
    }
    lines.push("")

    await writeFile(path.join(agentsDir, filename), lines.join("\n"))
    results.push({ filename, name: agentName })
  }

  return results
}

// ============ Shared helpers ============

function extractTitle(content: string): string {
  const firstSentence = content.split(/[.!?:]/)[0]?.trim()
  if (firstSentence && firstSentence.length <= 80) return firstSentence
  return `${content.slice(0, 60)}...`
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}
