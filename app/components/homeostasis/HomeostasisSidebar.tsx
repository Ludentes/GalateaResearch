import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { getHomeostasisState } from "../../../server/functions/homeostasis"
import { DimensionBar } from "./DimensionBar"

interface HomeostasisSidebarProps {
  sessionId: string
  messageCount: number
}

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge Sufficiency",
  certainty_alignment: "Certainty Alignment",
  progress_momentum: "Progress Momentum",
  communication_health: "Communication Health",
  productive_engagement: "Productive Engagement",
  knowledge_application: "Knowledge Application",
}

function SkeletonBar() {
  return (
    <div className="space-y-1">
      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      <div
        data-testid="skeleton-bar"
        className="h-6 bg-muted animate-pulse rounded-md"
      />
    </div>
  )
}

export function HomeostasisSidebar({ sessionId, messageCount }: HomeostasisSidebarProps) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["homeostasis", sessionId],
    queryFn: () => getHomeostasisState({ data: { sessionId } }),
    refetchOnWindowFocus: false,
    retry: false,
  })

  // Refetch when message count changes (new response arrived)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch is stable from useQuery
  useEffect(() => {
    if (messageCount > 0) {
      refetch()
    }
  }, [messageCount])

  return (
    <div className="w-[280px] border-l border-border bg-muted/50 p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Homeostasis State</h2>
        {data && (
          <p className="text-xs text-muted-foreground">
            Last updated:{" "}
            {new Date(data.assessedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} />
          ))}
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Unable to load homeostasis state
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && !data && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No assessment yet. Send a message to begin.
        </p>
      )}

      {data && (
        <div className="space-y-3">
          {Object.entries(data.dimensions).map(([key, state]) => (
            <DimensionBar
              key={key}
              label={DIMENSION_LABELS[key] || key}
              state={state}
              method={data.assessmentMethod[key] || "computed"}
            />
          ))}
        </div>
      )}
    </div>
  )
}
