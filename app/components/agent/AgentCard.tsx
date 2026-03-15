import { Link } from "@tanstack/react-router"
import type { HomeostasisState } from "server/engine/types"
import { HomeostasisSparkline } from "./HomeostasisSparkline"

interface AgentCardProps {
  id: string
  name: string
  role: string
  domain: string
  health: string
  lastTick: string | null
  homeostasis: HomeostasisState | null
}

const healthColors: Record<string, string> = {
  healthy: "bg-green-500",
  elevated: "bg-yellow-500",
  degraded: "bg-red-500",
  unknown: "bg-gray-400",
}

export function AgentCard({
  id,
  name,
  role,
  domain,
  health,
  lastTick,
  homeostasis,
}: AgentCardProps) {
  const dotColor = healthColors[health] ?? healthColors.unknown

  return (
    <Link
      to="/agent/fleet/$agentId"
      params={{ agentId: id }}
      className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block w-3 h-3 rounded-full ${dotColor}`} />
        <h3 className="font-semibold text-lg">{name}</h3>
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          <span className="font-medium">Role:</span> {role}
        </div>
        <div>
          <span className="font-medium">Domain:</span> {domain}
        </div>
        <div>
          <span className="font-medium">Health:</span> {health}
        </div>
        {lastTick ? (
          <div className="text-xs">
            Last tick: {new Date(lastTick).toLocaleString()}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No activity yet</div>
        )}
      </div>
      {homeostasis && (
        <div className="mt-3 pt-3 border-t border-border">
          <HomeostasisSparkline
            homeostasis={homeostasis}
            compact
            showLabels={false}
          />
        </div>
      )}
    </Link>
  )
}
