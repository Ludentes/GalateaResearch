import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

export const Route = createFileRoute("/agent/chat")({
  component: AgentChatPage,
})

function AgentChatPage() {
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<Array<{ role: string; content: string; meta?: any }>>([])

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      // Queue message
      await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "dashboard", channel: "ui", content }),
      })
      // Trigger tick to process it
      const tickResult = await fetch("/api/agent/tick", { method: "POST" }).then((r) => r.json())
      return tickResult
    },
    onSuccess: (result, content) => {
      setHistory((h) => [
        ...h,
        { role: "user", content },
        {
          role: "assistant",
          content: result.response?.text ?? "(no response — action: " + result.action + ")",
          meta: {
            action: result.action,
            factsUsed: result.retrievedFacts?.length ?? 0,
          },
        },
      ])
    },
  })

  const handleSend = () => {
    if (message.trim()) {
      sendMutation.mutate(message)
      setMessage("")
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Direct Chat (via Tick)</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/trace" className="text-muted-foreground hover:text-foreground">Trace</Link>
            <Link to="/agent/config" className="text-muted-foreground hover:text-foreground">Config</Link>
            <Link to="/agent/chat" className="font-medium underline">Chat</Link>
          </nav>
        </div>

        <p className="text-sm text-muted-foreground">
          Messages go through the full tick() pipeline: homeostasis → fact retrieval → LLM → response.
          Unlike <code>/chat</code>, this exercises the agent loop.
        </p>

        {/* Chat history */}
        <div className="space-y-4 min-h-[300px]">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg ${
                msg.role === "user"
                  ? "bg-muted/50 ml-16"
                  : "border mr-16"
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {msg.role === "user" ? "You (via tick)" : "Agent"}
                {msg.meta && (
                  <span className="ml-2">
                    [{msg.meta.action}, {msg.meta.factsUsed} facts]
                  </span>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="border rounded-lg p-4 mr-16 animate-pulse">
              <div className="text-sm text-muted-foreground">Processing tick...</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Send a message through the agent pipeline..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sendMutation.isPending && handleSend()}
            className="border rounded px-3 py-2 text-sm bg-background flex-1"
            disabled={sendMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
