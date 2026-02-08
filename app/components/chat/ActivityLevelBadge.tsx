import { cn } from "@/lib/utils"

interface ActivityLevelBadgeProps {
  level: 0 | 1 | 2 | 3 | undefined
  model?: string
}

const LEVEL_CONFIG = {
  0: {
    label: "L0",
    color: "bg-gray-100 text-gray-700",
    description: "Direct execution",
  },
  1: {
    label: "L1",
    color: "bg-blue-100 text-blue-700",
    description: "Pattern-based",
  },
  2: {
    label: "L2",
    color: "bg-purple-100 text-purple-700",
    description: "Reasoning required",
  },
  3: {
    label: "L3 + Reflexion",
    color: "bg-orange-100 text-orange-700",
    description: "Deep reflection",
  },
}

export function ActivityLevelBadge({ level, model }: ActivityLevelBadgeProps) {
  if (level === undefined) return null

  const config = LEVEL_CONFIG[level]
  const tooltip = model
    ? `${config.description} (${model})`
    : config.description

  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full",
        config.color
      )}
      title={tooltip}
    >
      {config.label}
    </span>
  )
}
