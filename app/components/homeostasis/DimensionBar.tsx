import { cn } from "@/lib/utils"

interface DimensionBarProps {
  label: string
  state: "LOW" | "HEALTHY" | "HIGH"
  method: "computed" | "llm"
}

const STATE_CONFIG = {
  LOW: {
    color: "bg-yellow-100 border-yellow-500",
    position: "16%",
  },
  HEALTHY: {
    color: "bg-green-100 border-green-500",
    position: "50%",
  },
  HIGH: {
    color: "bg-blue-100 border-blue-500",
    position: "83%",
  },
}

export function DimensionBar({ label, state, method }: DimensionBarProps) {
  const config = STATE_CONFIG[state]

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {method === "computed" ? "C" : "LLM"}
        </span>
      </div>
      <div
        data-testid="dimension-bar"
        className={cn("relative h-6 rounded-md", config.color)}
      >
        <div
          data-testid="dimension-indicator"
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2",
            config.color.split(" ")[1],
          )}
          style={{ left: config.position }}
        />
      </div>
    </div>
  )
}
