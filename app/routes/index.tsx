import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-4xl font-bold">Galatea</h1>
      <p className="text-muted-foreground">Psychological Architecture + LLM</p>
      <Button size="lg">Get Started</Button>
    </div>
  )
}
