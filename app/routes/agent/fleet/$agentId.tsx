import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { TickTimeline } from "../../../components/agent/TickTimeline"

export const Route = createFileRoute("/agent/fleet/$agentId")({
  component: AgentDetailPage,
})

function AgentDetailPage() {
  const { agentId } = Route.useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ["fleet-agent", agentId],
    queryFn: () =>
      fetch(`/api/agent/fleet/${agentId}`).then((r) => r.json()),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error)
    return <div className="p-8 text-red-500">Error loading agent</div>

  const spec = data?.spec
  const ctx = data?.operationalContext
  const ticks = data?.recentTicks ?? []

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/agent/fleet"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Fleet
            </Link>
            <h1 className="text-3xl font-bold mt-1">
              {spec?.agent?.name ?? agentId}
            </h1>
            {spec?.agent?.role && (
              <p className="text-muted-foreground">{spec.agent.role}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Agent Info */}
          <div className="lg:col-span-1 space-y-4">
            <section>
              <h2 className="text-lg font-semibold mb-2">Spec</h2>
              <div className="rounded border p-3 text-sm space-y-1">
                {spec?.agent?.domain && (
                  <div>
                    <span className="font-medium">Domain:</span>{" "}
                    {spec.agent.domain}
                  </div>
                )}
                {spec?.agent?.id && (
                  <div>
                    <span className="font-medium">ID:</span>{" "}
                    <span className="font-mono text-xs">
                      {spec.agent.id}
                    </span>
                  </div>
                )}
                {spec?.homeostasis && (
                  <div>
                    <span className="font-medium">Dimensions:</span>{" "}
                    {Object.keys(spec.homeostasis).length}
                  </div>
                )}
              </div>
            </section>

            {ctx && (
              <section>
                <h2 className="text-lg font-semibold mb-2">
                  Operational Context
                </h2>
                <div className="rounded border p-3 text-sm">
                  {typeof ctx === "object" ? (
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(ctx, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground">{String(ctx)}</p>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Right: Tick Timeline */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-2">
              Recent Ticks ({ticks.length})
            </h2>
            <TickTimeline ticks={ticks} />
          </div>
        </div>
      </div>
    </div>
  )
}
