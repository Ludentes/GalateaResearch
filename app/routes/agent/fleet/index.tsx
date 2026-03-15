import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { HomeostasisState } from "server/engine/types"
import { AgentCard } from "../../../components/agent/AgentCard"

export const Route = createFileRoute("/agent/fleet/")({
  component: FleetOverviewPage,
})

interface FleetAgent {
  id: string
  name: string
  role: string
  domain: string
  health: string
  lastTick: string | null
  homeostasis: HomeostasisState | null
}

function FleetOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["fleet-agents"],
    queryFn: () =>
      fetch("/api/agent/fleet").then((r) => r.json()) as Promise<{
        agents: FleetAgent[]
      }>,
    refetchInterval: 10000,
  })

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Fleet Control</h1>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/agent"
              className="text-muted-foreground hover:text-foreground"
            >
              Status
            </Link>
            <Link to="/agent/fleet" className="font-medium underline">
              Fleet
            </Link>
          </nav>
        </div>

        {isLoading && <div>Loading...</div>}
        {error && <div className="text-red-500">Error loading fleet data</div>}

        {data && data.agents.length === 0 && (
          <p className="text-muted-foreground">No agents registered</p>
        )}

        {data && data.agents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.agents.map((agent) => (
              <AgentCard key={agent.id} {...agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
