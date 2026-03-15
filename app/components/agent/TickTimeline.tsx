import { useState } from "react"
import { TickDetail } from "./TickDetail"

interface Tick {
  tickId: string
  timestamp: string
  trigger: { type: string; source?: string }
  homeostasis: Record<string, string | { state: string; value?: number }>
  guidance: string[]
  routing: { level: string; taskType?: string; reasoning?: string }
  execution: {
    adapter: string
    sessionResumed: boolean
    toolCalls: number
    durationMs: number
  }
  resources: {
    inputTokens?: number
    outputTokens?: number
    subscriptionUsage5h?: number
  }
  outcome: {
    action: string
    response?: string
    artifactsCreated: string[]
    knowledgeEntriesCreated: number
  }
}

interface TickTimelineProps {
  ticks: Tick[]
}

const triggerBadge: Record<string, string> = {
  message: "bg-blue-500/20 text-blue-400",
  heartbeat: "bg-purple-500/20 text-purple-400",
  internal: "bg-gray-500/20 text-gray-400",
}

function hasElevated(
  homeostasis: Record<string, string | { state: string }>,
): boolean {
  return Object.values(homeostasis).some((d) => {
    const s = typeof d === "string" ? d : d.state
    return s === "ELEVATED" || s === "LOW"
  })
}

export function TickTimeline({ ticks }: TickTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (ticks.length === 0) {
    return <p className="text-muted-foreground text-sm">No ticks recorded</p>
  }

  return (
    <div className="space-y-2">
      {ticks.map((tick) => {
        const isExpanded = expandedId === tick.tickId
        const badgeClass =
          triggerBadge[tick.trigger.type] ?? triggerBadge.internal

        return (
          <div
            key={tick.tickId}
            className="rounded border p-3 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() =>
              setExpandedId(isExpanded ? null : tick.tickId)
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-mono ${badgeClass}`}
                >
                  {tick.trigger.type}
                </span>
                {hasElevated(tick.homeostasis) && (
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                )}
                <span className="font-mono text-sm">
                  {tick.outcome.action}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <span>{tick.execution.durationMs}ms</span>
                <span>
                  {new Date(tick.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {isExpanded && <TickDetail tick={tick} />}
          </div>
        )
      })}
    </div>
  )
}
