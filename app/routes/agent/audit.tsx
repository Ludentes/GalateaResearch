import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/audit")({
  component: AuditPage,
})

const types = [
  "fact",
  "preference",
  "rule",
  "procedure",
  "correction",
  "decision",
]

const targetOptions = [
  { value: "", label: "Auto" },
  { value: "claude-md", label: "claude-md" },
  { value: "skill", label: "skill" },
  { value: "hook", label: "hook" },
  { value: "none", label: "none" },
]

function AuditPage() {
  const queryClient = useQueryClient()
  const [curationFilter, setCurationFilter] = useState("pending")
  const [typeFilter, setTypeFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editTarget, setEditTarget] = useState("")

  const params = new URLSearchParams()
  if (curationFilter) params.set("curationStatus", curationFilter)
  if (typeFilter) params.set("type", typeFilter)
  if (search) params.set("search", search)

  const { data, isLoading } = useQuery({
    queryKey: ["audit", curationFilter, typeFilter, search],
    queryFn: () =>
      fetch(`/api/agent/knowledge?${params}`).then((r) => r.json()),
  })

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/agent/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit"] })
      queryClient.invalidateQueries({ queryKey: ["knowledge"] })
    },
  })

  const bulkMutation = useMutation({
    mutationFn: (body: { ids: string[]; curationStatus: string }) =>
      fetch("/api/agent/knowledge/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ["audit"] })
      queryClient.invalidateQueries({ queryKey: ["knowledge"] })
    },
  })

  const entries: any[] = data?.entries ?? []
  const allSelected =
    entries.length > 0 && entries.every((e: any) => selected.has(e.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map((e: any) => e.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEditing(entry: any) {
    setEditingId(entry.id)
    setEditContent(entry.contentOverride ?? entry.content)
    setEditTarget(entry.targetOverride ?? entry.targetChannel ?? "")
  }

  function saveEdit(id: string) {
    patchMutation.mutate({
      id,
      contentOverride: editContent,
      targetOverride: editTarget || undefined,
    })
    setEditingId(null)
  }

  const stats = data?.stats?.byCuration

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Knowledge Audit</h1>
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
            <Link to="/agent/audit" className="font-medium underline">
              Audit
            </Link>
            <Link
              to="/agent/config"
              className="text-muted-foreground hover:text-foreground"
            >
              Config
            </Link>
            <Link
              to="/agent/settings"
              className="text-muted-foreground hover:text-foreground"
            >
              Settings
            </Link>
            <Link
              to="/agent/chat"
              className="text-muted-foreground hover:text-foreground"
            >
              Chat
            </Link>
          </nav>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600">
              Pending: {stats.pending ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-600">
              Approved: {stats.approved ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600">
              Rejected: {stats.rejected ?? 0}
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <select
            value={curationFilter}
            onChange={(e) => setCurationFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() =>
                bulkMutation.mutate({
                  ids: [...selected],
                  curationStatus: "approved",
                })
              }
              disabled={bulkMutation.isPending}
              className="px-3 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
            >
              Approve selected
            </button>
            <button
              type="button"
              onClick={() =>
                bulkMutation.mutate({
                  ids: [...selected],
                  curationStatus: "rejected",
                })
              }
              disabled={bulkMutation.isPending}
              className="px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
            >
              Reject selected
            </button>
          </div>
        )}

        {/* Entry list */}
        {isLoading ? (
          <div>Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {curationFilter === "pending"
              ? "No pending entries"
              : "No entries match filters"}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select all */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              Select all ({entries.length})
            </label>

            {entries.map((entry: any) => (
              <div
                key={entry.id}
                className="border rounded-lg p-4 space-y-2 bg-background"
              >
                {/* Header row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                  />
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                    {entry.type}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      entry.curationStatus === "approved"
                        ? "bg-green-500/10 text-green-600"
                        : entry.curationStatus === "rejected"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-yellow-500/10 text-yellow-600"
                    }`}
                  >
                    {entry.curationStatus ?? "pending"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    target:{" "}
                    {entry.targetOverride ?? entry.targetChannel ?? "auto"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {((entry.confidence ?? 0) * 100).toFixed(0)}% confidence
                  </span>
                  <div className="ml-auto flex gap-2">
                    {editingId !== entry.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditing(entry)}
                          className="px-2 py-0.5 rounded border text-xs hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchMutation.mutate({
                              id: entry.id,
                              curationStatus: "approved",
                            })
                          }
                          disabled={patchMutation.isPending}
                          className="px-2 py-0.5 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchMutation.mutate({
                              id: entry.id,
                              curationStatus: "rejected",
                            })
                          }
                          disabled={patchMutation.isPending}
                          className="px-2 py-0.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content / inline edit */}
                {editingId === entry.id ? (
                  <div className="space-y-2 pl-6">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                    />
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground">
                        Target override:
                      </label>
                      <select
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        className="border rounded px-2 py-1 text-xs bg-background"
                      >
                        {targetOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveEdit(entry.id)}
                        disabled={patchMutation.isPending}
                        className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded border text-xs hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm pl-6">
                    {entry.contentOverride ?? entry.content}
                  </p>
                )}

                {/* Evidence disclosure */}
                {entry.evidence &&
                  entry.evidence !==
                    (entry.contentOverride ?? entry.content) && (
                    <details className="pl-6">
                      <summary className="text-xs text-muted-foreground cursor-pointer">
                        Show evidence
                      </summary>
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                        {entry.evidence}
                      </p>
                    </details>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
