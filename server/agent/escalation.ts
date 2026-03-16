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
