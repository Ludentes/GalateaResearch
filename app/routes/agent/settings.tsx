import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type React from "react"

export const Route = createFileRoute("/agent/settings")({
  component: SettingsPage,
})

export function SettingsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Error loading config</div>

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Settings</h1>
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
            <Link to="/agent/settings" className="font-medium underline">
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

        {/* Content placeholder */}
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Retrieval</h2>
            <p className="text-sm text-muted-foreground">Settings coming...</p>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Homeostasis</h2>
            <p className="text-sm text-muted-foreground">Settings coming...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
