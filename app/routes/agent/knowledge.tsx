import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/knowledge")({
  component: KnowledgeBrowserPage,
})

function KnowledgeBrowserPage() {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("")
  const [showSuperseded, setShowSuperseded] = useState(false)

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (typeFilter) params.set("type", typeFilter)
  if (entityFilter) params.set("entity", entityFilter)
  if (showSuperseded) params.set("showSuperseded", "true")

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge", search, typeFilter, entityFilter, showSuperseded],
    queryFn: () =>
      fetch(`/api/agent/knowledge?${params}`).then((r) => r.json()),
  })

  const types = [
    "fact",
    "preference",
    "rule",
    "procedure",
    "correction",
    "decision",
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Knowledge Browser</h1>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/agent"
              className="text-muted-foreground hover:text-foreground"
            >
              Status
            </Link>
            <Link to="/agent/knowledge" className="font-medium underline">
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

        {/* Stats */}
        {data?.stats && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total: {data.stats.total}</span>
            <span>Active: {data.stats.active}</span>
            <span>Superseded: {data.stats.superseded}</span>
            <span>Entities: {data.stats.entities?.length ?? 0}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t} ({data?.stats?.byType?.[t] ?? 0})
              </option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All entities</option>
            {(data?.stats?.entities ?? []).map((e: string) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showSuperseded}
              onChange={(e) => setShowSuperseded(e.target.checked)}
            />
            Show superseded
          </label>
        </div>

        {/* Table */}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="p-3 text-left font-medium">Content</th>
                  <th className="p-3 text-left font-medium">Confidence</th>
                  <th className="p-3 text-left font-medium">Entities</th>
                  <th className="p-3 text-left font-medium">About</th>
                </tr>
              </thead>
              <tbody>
                {(data?.entries ?? []).map((entry: any) => (
                  <tr
                    key={entry.id}
                    className={`border-t ${entry.supersededBy ? "opacity-50" : ""} ${entry.archivedAt ? "opacity-30" : ""}`}
                  >
                    <td className="p-3">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                        {entry.type}
                      </span>
                    </td>
                    <td className="p-3 max-w-md truncate">{entry.content}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${entry.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs">
                          {(entry.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {entry.entities?.join(", ")}
                    </td>
                    <td className="p-3 text-xs">
                      {entry.about
                        ? `${entry.about.entity} (${entry.about.type})`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
