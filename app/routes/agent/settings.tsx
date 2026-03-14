import { useState, useEffect } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation } from "@tanstack/react-query"
import { SettingsGroup } from "@/components/SettingsGroup"
import { SettingInput } from "@/components/SettingInput"
import { SettingSelect } from "@/components/SettingSelect"

export const Route = createFileRoute("/agent/settings")({
  component: SettingsPage,
})

export function SettingsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  // Form state
  const [formData, setFormData] = useState({
    retrieval_max_entries: 20,
    retrieval_entity_name_min_length: 3,
    extraction_strategy: "heuristics-only",
    signal_greeting_max_length: 30,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")

  // Sync form with loaded config
  useEffect(() => {
    if (data?.config) {
      setFormData({
        retrieval_max_entries: data.config.retrieval?.max_entries ?? 20,
        retrieval_entity_name_min_length:
          data.config.retrieval?.entity_name_min_length ?? 3,
        extraction_strategy:
          data.config.extraction_strategy?.strategy ?? "heuristics-only",
        signal_greeting_max_length:
          data.config.signal?.greeting_max_length ?? 30,
      })
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await fetch("/api/agent/config-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.statusMessage || "Failed to save config")
      }
      return response.json()
    },
    onSuccess: () => {
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    },
    onError: (error: any) => {
      setSaveStatus("error")
      setErrors({ submit: error.message })
    },
  })

  const handleSave = () => {
    setErrors({})
    setSaveStatus("saving")

    const updates = {
      retrieval: {
        max_entries: formData.retrieval_max_entries,
        entity_name_min_length: formData.retrieval_entity_name_min_length,
      },
      extraction_strategy: {
        strategy: formData.extraction_strategy,
      },
      signal: {
        greeting_max_length: formData.signal_greeting_max_length,
      },
    }

    updateMutation.mutate(updates)
  }

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

        {/* Status messages */}
        {saveStatus === "success" && (
          <div className="bg-green-50 text-green-800 p-3 rounded-md text-sm">
            ✓ Settings saved successfully
          </div>
        )}
        {saveStatus === "error" && (
          <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm">
            ✗ {errors.submit || "Failed to save settings"}
          </div>
        )}

        {/* Settings groups */}
        <div className="space-y-6">
          {/* Retrieval Settings */}
          <SettingsGroup
            title="Retrieval"
            description="Controls how facts are found when processing messages"
          >
            <SettingInput
              label="Max Entries Per Query"
              description="Maximum facts returned per query. Higher = more context but higher token cost."
              type="number"
              value={formData.retrieval_max_entries}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  retrieval_max_entries: val as number,
                })
              }
              min={1}
              max={100}
              error={errors.max_entries}
            />
            <SettingInput
              label="Entity Name Min Length"
              description="Minimum character length for entity names. Filters out noise like 'I' or 'a'."
              type="number"
              value={formData.retrieval_entity_name_min_length}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  retrieval_entity_name_min_length: val as number,
                })
              }
              min={1}
              max={20}
              error={errors.entity_name_min_length}
            />
          </SettingsGroup>

          {/* Extraction Strategy */}
          <SettingsGroup
            title="Extraction Strategy"
            description="How knowledge is extracted from transcripts"
          >
            <SettingSelect
              label="Strategy"
              description="heuristics-only: Fast, free (~38% recall) | cloud: High recall (~95%), costs ~$0.05/session | hybrid: Use your LLM"
              value={formData.extraction_strategy}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  extraction_strategy: val,
                })
              }
              options={[
                { value: "heuristics-only", label: "Heuristics Only" },
                { value: "cloud", label: "Cloud LLM" },
                { value: "hybrid", label: "Hybrid" },
              ]}
              error={errors.extraction_strategy}
            />
          </SettingsGroup>

          {/* Signal Classification */}
          <SettingsGroup
            title="Signal Classification"
            description="Determines which message turns contain signal vs noise"
          >
            <SettingInput
              label="Greeting Max Length"
              description="Messages shorter than this are checked for greeting patterns. Raise to catch longer greetings."
              type="number"
              value={formData.signal_greeting_max_length}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  signal_greeting_max_length: val as number,
                })
              }
              min={10}
              max={200}
              error={errors.greeting_max_length}
            />
          </SettingsGroup>

          {/* Reference Link */}
          <div className="border-t pt-6">
            <p className="text-sm text-muted-foreground">
              For advanced settings and detailed explanations, see{" "}
              <Link
                to="/agent/config"
                className="font-medium text-foreground underline hover:no-underline"
              >
                Config Viewer
              </Link>
              .
            </p>
          </div>

          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300"
            >
              Discard Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
