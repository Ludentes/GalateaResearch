import { Activity, ArrowRight, GitBranch, UserCircle2 } from "lucide-react"

// ─── Step visual previews ────────────────────────────────────────────────────

function PersonalityPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      <div className="text-muted-foreground text-[10px] mb-2.5 font-sans uppercase tracking-widest">
        agent.yaml
      </div>
      <div className="space-y-0.5">
        <div>
          <span className="text-blue-600 dark:text-blue-400">
            modeled_after
          </span>
          <span className="text-muted-foreground">: </span>
          <span>kirill</span>
        </div>
        <div>
          <span className="text-blue-600 dark:text-blue-400">role</span>
          <span className="text-muted-foreground">: </span>
          <span>developer</span>
        </div>
        <div>
          <span className="text-blue-600 dark:text-blue-400">style</span>
          <span className="text-muted-foreground">: </span>
          <span>pragmatic</span>
        </div>
        <div>
          <span className="text-blue-600 dark:text-blue-400">domain</span>
          <span className="text-muted-foreground">: </span>
          <span>typescript</span>
        </div>
        <div className="pt-1">
          <span className="text-blue-600 dark:text-blue-400">
            escalates_when
          </span>
          <span className="text-muted-foreground">:</span>
        </div>
        <div className="pl-3">
          <span className="text-muted-foreground">{"- "}</span>
          <span className="text-green-700 dark:text-green-400">
            knowledge_sufficiency: LOW
          </span>
        </div>
        <div className="pl-3">
          <span className="text-muted-foreground">{"- "}</span>
          <span className="text-green-700 dark:text-green-400">
            certainty_alignment: LOW
          </span>
        </div>
      </div>
    </div>
  )
}

function LearnPreview() {
  const facts = [
    "Uses Vitest + biome for all tests",
    "PRs must reference a GitLab issue",
    "Infra managed via Docker Compose",
  ]

  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-xs">
      <div className="text-muted-foreground text-[10px] mb-3 font-mono uppercase tracking-widest">
        shadow learning
      </div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {["src/", "patterns", "memory"].map((node, i, arr) => (
          <div key={node} className="flex items-center gap-1.5">
            <div className="bg-background border rounded px-2 py-0.5 font-mono text-[11px]">
              {node}
            </div>
            {i < arr.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {facts.map((fact) => (
          <div key={fact} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
            <span className="text-muted-foreground">{fact}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DIMENSIONS: {
  label: string
  value: number
  state: "healthy" | "high" | "low"
}[] = [
  { label: "Knowledge", value: 75, state: "healthy" },
  { label: "Certainty", value: 80, state: "healthy" },
  { label: "Momentum", value: 92, state: "high" },
  { label: "Comms", value: 70, state: "healthy" },
  { label: "Engagement", value: 85, state: "healthy" },
  { label: "Application", value: 72, state: "healthy" },
  { label: "Preservation", value: 78, state: "healthy" },
]

function HomeostasisPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
      <div className="text-muted-foreground text-[10px] mb-2.5 font-mono uppercase tracking-widest">
        homeostasis · 7 dimensions
      </div>
      {DIMENSIONS.map((dim) => {
        const barColor =
          dim.state === "high"
            ? "bg-yellow-500"
            : dim.state === "low"
              ? "bg-red-500"
              : "bg-green-500"
        const labelColor =
          dim.state === "high"
            ? "text-yellow-600 dark:text-yellow-400"
            : dim.state === "low"
              ? "text-red-600 dark:text-red-400"
              : "text-green-600 dark:text-green-400"

        return (
          <div key={dim.label} className="flex items-center gap-2">
            <span className="text-muted-foreground w-[4.5rem] shrink-0 text-[11px]">
              {dim.label}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${dim.value}%` }}
              />
            </div>
            <span
              className={`text-[10px] font-semibold w-11 text-right shrink-0 ${labelColor}`}
            >
              {dim.state.toUpperCase()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  {
    number: 1,
    label: "Define",
    Icon: UserCircle2,
    title: "Define your agent's personality",
    description:
      "Model your agent on a real teammate. Configure their expertise, communication style, and decision-making patterns—not vague prompts, but explicit behavioral contracts with escalation rules.",
    Visual: PersonalityPreview,
  },
  {
    number: 2,
    label: "Learn",
    Icon: GitBranch,
    title: "Agent learns your codebase and workflows",
    description:
      "The agent autonomously reads your repositories, extracts architecture patterns, and maps team conventions. No manual RAG setup—knowledge persists and evolves with every task.",
    Visual: LearnPreview,
  },
  {
    number: 3,
    label: "Work",
    Icon: Activity,
    title: "Works autonomously with self-regulation",
    description:
      "Agents execute multi-step tasks while monitoring 7 psychological dimensions in real time. They escalate when uncertain and pause when overwhelmed—never silently fail.",
    Visual: HomeostasisPreview,
  },
]

// ─── Section ─────────────────────────────────────────────────────────────────

export function HowItWorks() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border bg-gradient-to-b from-card to-background">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
            Transparent by design
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tighter mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Three phases from configuration to autonomous work. No prompt
            engineering, no token budgets, no silent failures.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative group flex flex-col">
              {/* Arrow connector — desktop */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:flex absolute -right-3 lg:-right-4 top-[3.75rem] z-10 items-center justify-center text-border group-hover:text-muted-foreground/50 transition-colors duration-200">
                  <ArrowRight className="w-6 h-6" />
                </div>
              )}

              {/* Card */}
              <div className="flex flex-col h-full rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow duration-300">
                {/* Step tag */}
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                    {step.number}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    <step.Icon className="w-3.5 h-3.5" />
                    {step.label}
                  </div>
                </div>

                {/* Text */}
                <h3 className="text-lg font-semibold tracking-tight mb-1.5">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  {step.description}
                </p>

                {/* Visual */}
                <div className="mt-auto">
                  <step.Visual />
                </div>
              </div>

              {/* Connector — mobile */}
              {i < STEPS.length - 1 && (
                <div className="flex md:hidden justify-center py-2">
                  <ArrowRight className="w-4 h-4 text-border rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
