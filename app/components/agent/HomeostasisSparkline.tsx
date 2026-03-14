import type { HomeostasisState } from "server/engine/types"

interface HomeostasisSparklineProps {
  homeostasis: HomeostasisState
  compact?: boolean
  showLabels?: boolean
}

const DIMENSIONS: Array<
  keyof Omit<HomeostasisState, "assessed_at" | "assessment_method">
> = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
  "self_preservation",
]

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "KS",
  certainty_alignment: "CA",
  progress_momentum: "PM",
  communication_health: "CH",
  productive_engagement: "PE",
  knowledge_application: "KA",
  self_preservation: "SP",
}

function getBarColor(state: string): string {
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

export function HomeostasisSparkline({
  homeostasis,
  compact = false,
  showLabels = true,
}: HomeostasisSparklineProps) {
  const barHeight = compact ? "h-1" : "h-1.5"
  const containerGap = compact ? "gap-1" : "gap-1.5"
  const labelSize = compact ? "text-[9px]" : "text-xs"
  const spacing = compact ? "space-y-1" : "space-y-1.5"

  const healthyCount = DIMENSIONS.filter(
    (dim) => homeostasis[dim] === "HEALTHY",
  ).length

  return (
    <div className={spacing}>
      <div className={`flex flex-col ${containerGap}`}>
        {DIMENSIONS.map((dim) => {
          const state = homeostasis[dim]
          const colorClasses = getBarColor(state)
          const label = DIMENSION_LABELS[dim]

          return (
            <div
              key={dim}
              className="flex items-center gap-2"
              title={`${label}: ${state}`}
            >
              {showLabels && (
                <span
                  className={`${labelSize} font-medium text-gray-700 dark:text-gray-300 w-5 flex-shrink-0`}
                >
                  {label}
                </span>
              )}
              <div
                className={`flex-1 min-w-0 rounded-sm ${barHeight} ${colorClasses} transition-colors duration-200`}
              />
            </div>
          )
        })}
      </div>
      <div
        className={`${labelSize} text-gray-600 dark:text-gray-400 font-medium pt-1 border-t border-gray-200 dark:border-gray-700`}
      >
        {healthyCount}/7 healthy
      </div>
    </div>
  )
}
