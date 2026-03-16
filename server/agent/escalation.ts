import { existsSync } from "node:fs"
import { readFile, unlink } from "node:fs/promises"
import path from "node:path"

export type EscalationCategory =
  | "knowledge_gap"
  | "blocked"
  | "uncertain"
  | "safety"

export interface EscalationRequest {
  taskId: string
  agentId: string
  reason: string
  category: EscalationCategory
  timestamp: string
  dimensions?: Record<string, string>
}

export function isValidEscalation(req: unknown): req is EscalationRequest {
  if (typeof req !== "object" || req === null) return false
  const r = req as Record<string, unknown>
  return (
    typeof r.taskId === "string" &&
    typeof r.agentId === "string" &&
    typeof r.reason === "string" &&
    typeof r.category === "string" &&
    typeof r.timestamp === "string"
  )
}

export function parseEscalationFile(json: string): EscalationRequest | null {
  try {
    const parsed = JSON.parse(json)
    return isValidEscalation(parsed) ? parsed : null
  } catch {
    return null
  }
}

const ESCALATION_DIR = ".escalations"

export async function checkForEscalation(
  workDir: string,
  taskId: string,
): Promise<EscalationRequest | null> {
  const filePath = path.join(workDir, ESCALATION_DIR, `${taskId}.json`)
  if (!existsSync(filePath)) return null

  try {
    const content = await readFile(filePath, "utf-8")
    return parseEscalationFile(content)
  } catch {
    return null
  }
}

export async function cleanupEscalation(
  workDir: string,
  taskId: string,
): Promise<void> {
  const filePath = path.join(workDir, ESCALATION_DIR, `${taskId}.json`)
  try {
    await unlink(filePath)
  } catch {
    // File already removed or never existed
  }
}
