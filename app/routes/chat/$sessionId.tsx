import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ChatInput } from "@/components/chat/ChatInput"
import { MessageList } from "@/components/chat/MessageList"
import { getSessionMessages, sendMessage } from "../../../server/functions/chat"

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
})

function ChatPage() {
  const { sessionId } = Route.useParams()
  const [messages, setMessages] = useState<
    Array<{
      id: string
      role: "user" | "assistant" | "system"
      content: string
      createdAt: string
    }>
  >([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSessionMessages({ data: { sessionId } }).then((rows) =>
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role as "user" | "assistant" | "system",
          content: r.content,
          createdAt:
            r.createdAt instanceof Date
              ? r.createdAt.toISOString()
              : String(r.createdAt),
        })),
      ),
    )
  }, [sessionId])

  const handleSend = async (content: string) => {
    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      await sendMessage({ data: { sessionId, message: content } })
      const updated = await getSessionMessages({ data: { sessionId } })
      setMessages(
        updated.map((r) => ({
          id: r.id,
          role: r.role as "user" | "assistant" | "system",
          content: r.content,
          createdAt:
            r.createdAt instanceof Date
              ? r.createdAt.toISOString()
              : String(r.createdAt),
        })),
      )
    } catch (error) {
      console.error("Chat error:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Galatea Chat</h1>
      </header>
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  )
}
