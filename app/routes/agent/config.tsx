import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type React from "react"

export const Route = createFileRoute("/agent/config")({
  component: ConfigPage,
})

function ConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Config Viewer</h1>
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
            <Link to="/agent/config" className="font-medium underline">
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

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-6">
            {data?.config &&
              Object.entries(data.config).map(
                ([section, values]: [string, any]) => (
                  <div key={section} className="border rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-3 font-mono">
                      {section}
                    </h2>
                    <div className="space-y-2">
                      {renderConfigValues(values, "")}
                    </div>
                  </div>
                ),
              )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Read-only view. Edit <code>server/engine/config.yaml</code> directly.
        </p>
      </div>
    </div>
  )
}

function renderConfigValues(obj: any, prefix: string): React.JSX.Element[] {
  const elements: React.JSX.Element[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      elements.push(
        <div key={fullKey} className="ml-4">
          <div className="text-sm font-medium text-muted-foreground">
            {key}:
          </div>
          {renderConfigValues(value, fullKey)}
        </div>,
      )
    } else {
      elements.push(
        <div
          key={fullKey}
          className="flex justify-between items-center py-1 ml-4"
        >
          <span className="text-sm font-mono">{key}</span>
          <span className="text-sm font-mono text-muted-foreground">
            {Array.isArray(value) ? `[${value.length} items]` : String(value)}
          </span>
        </div>,
      )
    }
  }
  return elements
}
