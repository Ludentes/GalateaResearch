import { BookOpen, Brain, Zap } from "lucide-react"

export function HowItWorks() {
  const steps = [
    {
      icon: Brain,
      number: "1",
      title: "Define Your Agent from a Real Teammate",
      description:
        "Model your agent on an actual team member. Capture their expertise, decision-making patterns, and work style.",
    },
    {
      icon: BookOpen,
      number: "2",
      title: "Agent Learns Your Codebase",
      description:
        "The agent explores your codebase, understands patterns, and builds contextual knowledge of your domain.",
    },
    {
      icon: Zap,
      number: "3",
      title: "Agent Works with Self-Regulation",
      description:
        "Your agent handles tasks autonomously with psychological balance, maintaining health across knowledge, certainty, progress, and engagement dimensions.",
    },
  ]

  return (
    <section className="w-full py-16 md:py-24 lg:py-32 bg-card border-t border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground">
            Three simple steps to deploy an autonomous agent with psychological
            architecture.
          </p>
        </div>

        {/* Desktop horizontal layout */}
        <div className="hidden md:block">
          <div className="grid grid-cols-3 gap-8 lg:gap-12 relative">
            {/* Connector lines */}
            <div
              className="absolute top-20 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent translate-y-0"
              style={{
                left: "calc(16.666% + 40px)",
                right: "calc(16.666% + 40px)",
              }}
            />

            {steps.map((step) => {
              const Icon = step.icon
              return (
                <div
                  key={step.number}
                  className="flex flex-col items-center text-center"
                >
                  {/* Icon circle */}
                  <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6 hover:bg-primary/20 transition-colors">
                    <Icon className="w-10 h-10 text-primary" />
                  </div>

                  {/* Step number */}
                  <div className="mb-4">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold mb-3 text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile vertical layout */}
        <div className="md:hidden space-y-8">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="flex gap-6">
                {/* Left side: icon and connector */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  {/* Vertical line connecting steps */}
                  {step.number !== "3" && (
                    <div className="w-0.5 h-16 bg-border mt-2" />
                  )}
                </div>

                {/* Right side: content */}
                <div className="pt-1 pb-6">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm mb-3">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
