import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/export")({
  component: ExportPage,
})

function ExportPage() {
  const [exported, setExported] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["export-preview"],
    queryFn: () => fetch("/api/agent/export/preview").then((r) => r.json()),
  })

  const exportMutation = useMutation({
    mutationFn: () =>
      fetch("/api/agent/export", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      setExported(true)
      queryClient.invalidateQueries({ queryKey: ["export-preview"] })
    },
  })

  const budget = data?.budget
  const skipped = data?.skipped
  const claudeMd = data?.claudeMd
  const skills = data?.skills
  const hooks = data?.hooks

  const hasEntries =
    (claudeMd?.entryCount ?? 0) > 0 ||
    (skills?.count ?? 0) > 0 ||
    (hooks?.count ?? 0) > 0

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Export</h1>
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
              to="/agent/settings"
              className="text-muted-foreground hover:text-foreground"
            >
              Settings
            </Link>
            <Link to="/agent/export" className="font-medium underline">
              Export
            </Link>
          </nav>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : !hasEntries ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            No approved entries to export
          </div>
        ) : (
          <>
            {/* Budget summary */}
            {budget && (
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">CLAUDE.md</div>
                  <div className="text-2xl font-bold">
                    {budget.claudeMdLines}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {budget.claudeMdMax} lines
                    </span>
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Skills</div>
                  <div className="text-2xl font-bold">
                    {skills?.count ?? 0}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {budget.skillMax} max
                    </span>
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Hooks</div>
                  <div className="text-2xl font-bold">{hooks?.count ?? 0}</div>
                </div>
              </div>
            )}

            {/* Skipped entries */}
            {skipped && skipped.count > 0 && (
              <details className="border rounded-lg">
                <summary className="p-4 cursor-pointer text-sm font-medium">
                  {skipped.count} entries skipped
                </summary>
                <div className="px-4 pb-4 space-y-2">
                  {skipped.entries.map(
                    (entry: {
                      id: string
                      content: string
                      type: string
                      reason: string
                    }) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 text-sm border-t pt-2"
                      >
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted shrink-0">
                          {entry.type}
                        </span>
                        <span className="truncate">{entry.content}</span>
                        <span className="text-muted-foreground shrink-0">
                          {entry.reason}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </details>
            )}

            {/* CLAUDE.md preview */}
            {claudeMd && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold mb-2">
                    CLAUDE.md Preview
                    {claudeMd.isNew ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (new file)
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({claudeMd.entryCount} entries, {claudeMd.lines} lines)
                      </span>
                    )}
                  </h2>
                  <pre className="border rounded-lg p-4 text-sm font-mono bg-muted/30 overflow-x-auto whitespace-pre-wrap">
                    {claudeMd.preview}
                  </pre>
                </div>

                {/* Existing file comparison */}
                {claudeMd.existing && (
                  <div>
                    <h2 className="text-lg font-semibold mb-2">
                      Existing CLAUDE.md
                    </h2>
                    <pre className="border rounded-lg p-4 text-sm font-mono bg-muted/30 overflow-x-auto whitespace-pre-wrap opacity-70">
                      {claudeMd.existing}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Export action */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => exportMutation.mutate()}
                disabled={exported || exportMutation.isPending}
                className="px-4 py-2 bg-foreground text-background rounded font-medium text-sm disabled:opacity-50"
              >
                {exportMutation.isPending ? "Exporting..." : "Export"}
              </button>
              {exported && (
                <span className="text-sm text-green-600 font-medium">
                  Export complete
                </span>
              )}
              {exportMutation.isError && (
                <span className="text-sm text-red-600">
                  Export failed:{" "}
                  {exportMutation.error?.message ?? "unknown error"}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
