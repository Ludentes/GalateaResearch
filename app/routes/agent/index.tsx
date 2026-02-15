import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/agent/")({
  component: AgentStatusPage,
})

function AgentStatusPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-status"],
    queryFn: () => fetch("/api/agent/status").then((r) => r.json()),
    refetchInterval: 5000,
  })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Error loading status</div>

  const dimensions = [
    "knowledge_sufficiency",
    "certainty_alignment",
    "progress_momentum",
    "communication_health",
    "productive_engagement",
    "knowledge_application",
  ] as const

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Agent Command Center</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="font-medium underline">
              Status
            </Link>
            <Link
              to="/agent/knowledge"
              className="text-muted-foreground hover:text-foreground"
            >
              Knowledge
            </Link>
            <Link
              to="/agent/trace"
              className="text-muted-foreground hover:text-foreground"
            >
              Trace
            </Link>
            <Link
              to="/agent/config"
              className="text-muted-foreground hover:text-foreground"
            >
              Config
            </Link>
            <Link
              to="/agent/chat"
              className="text-muted-foreground hover:text-foreground"
            >
              Chat
            </Link>
          </nav>
        </div>

        {/* Homeostasis Gauges */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Homeostasis</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {dimensions.map((dim) => {
              const state = data?.homeostasis?.[dim] ?? "HEALTHY"
              const method =
                data?.homeostasis?.assessment_method?.[dim] ?? "computed"
              return (
                <div
                  key={dim}
                  className={`rounded-lg border p-4 ${
                    state === "HEALTHY"
                      ? "border-green-500/30 bg-green-500/5"
                      : state === "LOW"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="text-sm text-muted-foreground">
                    {dim.replace(/_/g, " ")}
                  </div>
                  <div className="text-lg font-mono font-bold mt-1">
                    {state}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {method}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Pending Messages */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Pending Messages ({data?.pendingMessages?.length ?? 0})
          </h2>
          {data?.pendingMessages?.length > 0 ? (
            <div className="space-y-2">
              {data.pendingMessages.map((msg: any, i: number) => (
                <div key={i} className="rounded border p-3 text-sm">
                  <span className="font-medium">{msg.from}</span>
                  <span className="text-muted-foreground mx-2">
                    via {msg.channel}
                  </span>
                  <span>{msg.content.slice(0, 100)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No pending messages</p>
          )}
        </section>

        {/* Activity Log */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
          {data?.activityLog?.length > 0 ? (
            <div className="space-y-2">
              {[...data.activityLog].reverse().map((entry: any, i: number) => (
                <div key={i} className="rounded border p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-mono">{entry.action}</span>
                    <span className="text-muted-foreground text-xs">
                      {entry.timestamp
                        ? new Date(entry.timestamp).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                  {entry.response?.text && (
                    <div className="text-muted-foreground mt-1 truncate">
                      {entry.response.text.slice(0, 150)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No activity yet</p>
          )}
        </section>

        {data?.guidance && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Active Guidance</h2>
            <pre className="rounded border p-4 text-sm whitespace-pre-wrap bg-muted/50">
              {data.guidance}
            </pre>
          </section>
        )}
      </div>
    </div>
  )
}
