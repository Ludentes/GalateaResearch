/**
 * DimensionHeatmap - Visual grid showing homeostasis dimension states over time
 *
 * Displays 7 dimensions as rows, each tick as a column (newest on right).
 * Color-coded cells: green (HEALTHY), yellow (HIGH), red (LOW).
 */

interface DimensionHeatmapProps {
  ticks: Array<{
    tickId: string
    timestamp: string
    homeostasis: Record<string, any>
  }>
}

type DimensionState = "LOW" | "HEALTHY" | "HIGH"

const DIMENSIONS = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
  "self_preservation",
] as const

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge",
  certainty_alignment: "Certainty",
  progress_momentum: "Progress",
  communication_health: "Communication",
  productive_engagement: "Engagement",
  knowledge_application: "Application",
  self_preservation: "Preservation",
}

function getDimensionState(
  homeostasis: Record<string, any>,
  dimension: string,
): DimensionState | null {
  const value = homeostasis[dimension]

  if (typeof value === "string") {
    if (["LOW", "HEALTHY", "HIGH"].includes(value)) {
      return value as DimensionState
    }
  } else if (value && typeof value === "object" && "state" in value) {
    if (["LOW", "HEALTHY", "HIGH"].includes(value.state)) {
      return value.state as DimensionState
    }
  }

  return null
}

function getStateColor(state: DimensionState | null): string {
  switch (state) {
    case "HEALTHY":
      return "bg-green-500 dark:bg-green-600"
    case "HIGH":
      return "bg-yellow-500 dark:bg-yellow-600"
    case "LOW":
      return "bg-red-500 dark:bg-red-600"
    default:
      return "bg-gray-300 dark:bg-gray-600"
  }
}

function getTooltipText(
  dimension: string,
  state: DimensionState | null,
  timestamp: string,
): string {
  const dimLabel = DIMENSION_LABELS[dimension] || dimension
  const timeStr = new Date(timestamp).toLocaleTimeString()
  const stateStr = state || "unknown"
  return `${dimLabel}: ${stateStr}\n${timeStr}`
}

export function DimensionHeatmap({ ticks }: DimensionHeatmapProps) {
  if (ticks.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        No ticks to display
      </div>
    )
  }

  // Reverse to show newest on the right
  const sortedTicks = [...ticks].reverse()

  return (
    <div className="w-full overflow-x-auto border rounded-lg bg-card dark:bg-card">
      <div className="inline-block min-w-full">
        {/* Header row with timestamps */}
        <div className="flex border-b dark:border-gray-700">
          <div className="w-32 flex-shrink-0 px-3 py-2 text-xs font-semibold text-muted-foreground">
            Dimension
          </div>
          <div className="flex gap-0.5 px-3 py-2">
            {sortedTicks.map((tick) => (
              <div key={tick.tickId} className="flex-shrink-0 w-4">
                <div
                  className="text-xs text-muted-foreground text-center rotate-45 origin-bottom-left h-12 flex items-end justify-center"
                  title={new Date(tick.timestamp).toLocaleTimeString()}
                >
                  {new Date(tick.timestamp).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dimension rows */}
        {DIMENSIONS.map((dimension) => (
          <div key={dimension} className="flex border-b dark:border-gray-700 last:border-b-0">
            {/* Dimension label */}
            <div className="w-32 flex-shrink-0 px-3 py-3 text-xs font-medium text-foreground">
              {DIMENSION_LABELS[dimension]}
            </div>

            {/* State cells */}
            <div className="flex gap-0.5 px-3 py-2">
              {sortedTicks.map((tick) => {
                const state = getDimensionState(tick.homeostasis, dimension)
                const colorClass = getStateColor(state)
                const tooltipText = getTooltipText(
                  dimension,
                  state,
                  tick.timestamp,
                )

                return (
                  <div
                    key={`${tick.tickId}-${dimension}`}
                    className={`w-4 h-8 rounded-sm transition-opacity hover:opacity-75 cursor-help ${colorClass}`}
                    title={tooltipText}
                    aria-label={tooltipText}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-t dark:border-gray-700 bg-muted/30 dark:bg-muted/10 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600" />
          <span>Healthy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-yellow-500 dark:bg-yellow-600" />
          <span>High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-500 dark:bg-red-600" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
          <span>Unknown</span>
        </div>
      </div>
    </div>
  )
}
