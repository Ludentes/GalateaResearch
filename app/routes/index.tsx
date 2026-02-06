import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
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
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-4xl font-bold">Galatea</h1>
      <p className="text-muted-foreground">Psychological Architecture + LLM</p>
      <div className="flex gap-3">
        <Button onClick={handleNewChat} size="lg">
          New Chat
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link to="/memories">Memory Browser</Link>
        </Button>
      </div>
    </div>
  )
}
