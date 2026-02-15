import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/trace")({
  component: TracePage,
})

function TracePage() {
  const [query, setQuery] = useState("")
  const [entity, setEntity] = useState("")

  const traceMutation = useMutation({
    mutationFn: (body: { query: string; entity?: string }) =>
      fetch("/api/agent/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
  })

  const handleRunTrace = () => {
    if (query) traceMutation.mutate({ query, entity: entity || undefined })
  }

  const data = traceMutation.data

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Pipeline Trace</h1>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/agent"
              className="text-muted-foreground hover:text-foreground"
            >
              Status
            </Link>
            <Link
              to="/agent/knowledge"
              className="text-muted-foreground hover:text-foreground"
            >
              Knowledge
            </Link>
            <Link to="/agent/trace" className="font-medium underline">
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

        {/* Query input */}
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Query (e.g., 'MQTT persistence')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-background flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleRunTrace()}
          />
          <input
            type="text"
            placeholder="Entity (optional)"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-background w-48"
          />
          <button
            onClick={handleRunTrace}
            disabled={!query || traceMutation.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {traceMutation.isPending ? "Running..." : "Run Trace"}
          </button>
        </div>

        {/* Results */}
        {data && (
          <>
            <div className="text-sm text-muted-foreground">
              {data.entries?.length ?? 0} entries retrieved,{" "}
              {data.matchedEntities?.length ?? 0} entities matched
            </div>

            {/* Stage waterfall */}
            {data.trace?.steps?.map((step: any, i: number) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-mono font-medium">{step.stage}</h3>
                  <div className="text-sm text-muted-foreground">
                    {step.input} in → {step.output} pass → {step.filtered}{" "}
                    filtered
                  </div>
                </div>
                <div className="space-y-1">
                  {step.details?.slice(0, 20).map((d: any, j: number) => (
                    <div
                      key={j}
                      className={`text-xs font-mono p-1.5 rounded ${
                        d.action === "pass"
                          ? "bg-green-500/10"
                          : "bg-red-500/10"
                      }`}
                    >
                      <span
                        className={
                          d.action === "pass"
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {d.action.toUpperCase()}
                      </span>{" "}
                      {d.content} — {d.reason}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
