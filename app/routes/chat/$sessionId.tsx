import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ChatInput } from "@/components/chat/ChatInput"
import type { ChatMessage } from "@/components/chat/MessageList"
import { MessageList } from "@/components/chat/MessageList"
import { getSessionMessages } from "../../../server/functions/chat"

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
})

function mapRows(
  rows: Awaited<ReturnType<typeof getSessionMessages>>,
): ChatMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
    model: r.model ?? undefined,
    inputTokens: r.inputTokens ?? undefined,
    outputTokens: r.outputTokens ?? undefined,
    tokenCount: r.tokenCount ?? undefined,
  }))
}

function ChatPage() {
  const { sessionId } = Route.useParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")

  useEffect(() => {
    getSessionMessages({ data: { sessionId } }).then((rows) =>
      setMessages(mapRows(rows)),
    )
  }, [sessionId])

  const handleSend = async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setStreamingText("")

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: content }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk
        setStreamingText(fullText)
      }

      // Stream done — refresh messages from DB (includes token counts)
      const updated = await getSessionMessages({ data: { sessionId } })
      setMessages(mapRows(updated))
      setStreamingText("")
    } catch (error) {
      console.error("Chat error:", error)
    } finally {
      setLoading(false)
    }
  }

  // Build display messages: actual messages + streaming placeholder
  const displayMessages = streamingText
    ? [
        ...messages,
        {
          id: "streaming",
          role: "assistant" as const,
          content: streamingText,
          createdAt: new Date().toISOString(),
        },
      ]
    : messages

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Galatea Chat</h1>
      </header>
      <MessageList messages={displayMessages} streaming={!!streamingText} />
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  )
}
