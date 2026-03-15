interface TickDetailProps {
  tick: {
    trigger: { type: string; source?: string }
    homeostasis: Record<string, string | { state: string; value?: number }>
    guidance: string[]
    routing: { level: string; taskType?: string; reasoning?: string }
    execution: {
      adapter: string
      sessionResumed: boolean
      toolCalls: number
      durationMs: number
    }
    resources: {
      inputTokens?: number
      outputTokens?: number
      subscriptionUsage5h?: number
    }
    outcome: {
      action: string
      response?: string
      artifactsCreated: string[]
      knowledgeEntriesCreated: number
    }
  }
}

const stateColors: Record<string, string> = {
  HEALTHY: "text-green-500",
  ELEVATED: "text-yellow-500",
  LOW: "text-red-500",
}

export function TickDetail({ tick }: TickDetailProps) {
  return (
    <div className="space-y-3 text-sm border-t pt-3 mt-2">
      {/* Trigger */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Trigger
        </h4>
        <div>
          {tick.trigger.type}
          {tick.trigger.source && (
            <span className="text-muted-foreground">
              {" "}
              from {tick.trigger.source}
            </span>
          )}
        </div>
      </div>

      {/* Homeostasis */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Homeostasis
        </h4>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(tick.homeostasis).map(([dim, val]) => {
            const state = typeof val === "string" ? val : val.state
            return (
              <div key={dim} className="flex items-center gap-1">
                <span
                  className={`font-mono text-xs ${stateColors[state] ?? "text-gray-400"}`}
                >
                  {state}
                </span>
                <span className="text-muted-foreground text-xs">
                  {dim.replace(/_/g, " ")}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Guidance */}
      {tick.guidance.length > 0 && (
        <div>
          <h4 className="font-semibold text-xs uppercase text-muted-foreground">
            Guidance
          </h4>
          <ul className="list-disc list-inside text-xs">
            {tick.guidance.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Routing */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Routing
        </h4>
        <div className="text-xs">
          <span className="font-mono">{tick.routing.level}</span>
          {tick.routing.taskType && (
            <span className="text-muted-foreground">
              {" "}
              / {tick.routing.taskType}
            </span>
          )}
          {tick.routing.reasoning && (
            <div className="text-muted-foreground mt-1">
              {tick.routing.reasoning}
            </div>
          )}
        </div>
      </div>

      {/* Execution */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Execution
        </h4>
        <div className="text-xs space-y-0.5">
          <div>
            Adapter: <span className="font-mono">{tick.execution.adapter}</span>
          </div>
          <div>
            Session resumed: {tick.execution.sessionResumed ? "yes" : "no"}
          </div>
          <div>Tool calls: {tick.execution.toolCalls}</div>
          <div>Duration: {tick.execution.durationMs}ms</div>
        </div>
      </div>

      {/* Resources */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Resources
        </h4>
        <div className="text-xs">
          {tick.resources.inputTokens != null && (
            <span>In: {tick.resources.inputTokens} </span>
          )}
          {tick.resources.outputTokens != null && (
            <span>Out: {tick.resources.outputTokens} </span>
          )}
          {tick.resources.subscriptionUsage5h != null && (
            <span>
              Sub usage (5h): {tick.resources.subscriptionUsage5h}%
            </span>
          )}
        </div>
      </div>

      {/* Outcome */}
      <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground">
          Outcome
        </h4>
        <div className="text-xs space-y-0.5">
          <div>
            Action: <span className="font-mono">{tick.outcome.action}</span>
          </div>
          {tick.outcome.response && (
            <div className="text-muted-foreground truncate max-w-md">
              {tick.outcome.response.slice(0, 200)}
              {tick.outcome.response.length > 200 ? "..." : ""}
            </div>
          )}
          {tick.outcome.artifactsCreated.length > 0 && (
            <div>
              Artifacts: {tick.outcome.artifactsCreated.join(", ")}
            </div>
          )}
          {tick.outcome.knowledgeEntriesCreated > 0 && (
            <div>
              Knowledge entries: {tick.outcome.knowledgeEntriesCreated}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
