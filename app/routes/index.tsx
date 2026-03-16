import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { HowItWorks } from "@/components/HowItWorks"
import { createSession } from "../../server/functions/chat"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()

  const handleNewChat = async () => {
    const session = await createSession({
      data: { name: `Chat ${new Date().toLocaleDateString()}` },
    })
    navigate({ to: "/chat/$sessionId", params: { sessionId: session.id } })
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center min-h-screen gap-6 px-4 py-16 bg-gradient-to-b from-background to-card">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter">
            Galatea
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Autonomous agents with psychological architecture
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            Deploy self-regulating AI agents modeled on your team. No prompts, no token budgets. Just intelligent autonomous work.
          </p>
          <div className="pt-4">
            <Button onClick={handleNewChat} size="lg" className="px-8 py-6 text-base md:text-lg">
              Start Building
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorks />
    </div>
  )
}
