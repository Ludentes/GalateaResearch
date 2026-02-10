import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ChatInput } from "@/components/chat/ChatInput"
import type { ChatMessage } from "@/components/chat/MessageList"
import { MessageList } from "@/components/chat/MessageList"
import { HomeostasisSidebar } from "@/components/homeostasis/HomeostasisSidebar"
import { getSessionMessages } from "../../../server/functions/chat"

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
})

const PROVIDER_MODELS: Record<string, string[]> = {
  ollama: ["glm-4.7-flash", "gpt-oss", "gemma3:12b"],
  openrouter: [
    "z-ai/glm-4.5-air:free",
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-flash",
    "meta-llama/llama-3.1-70b-instruct",
  ],
  "claude-code": ["sonnet", "opus", "haiku"],
}

const PROVIDERS = Object.keys(PROVIDER_MODELS)

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
    activityLevel: (r.activityLevel ?? undefined) as ChatMessage["activityLevel"],
  }))
}

function ChatPage() {
  const { sessionId } = Route.useParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [provider, setProvider] = useState("ollama")
  const [model, setModel] = useState("glm-4.7-flash")

  useEffect(() => {
    getSessionMessages({ data: { sessionId } }).then((rows) =>
      setMessages(mapRows(rows)),
    )
  }, [sessionId])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    setModel(PROVIDER_MODELS[newProvider]?.[0] ?? "")
  }

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
        body: JSON.stringify({
          sessionId,
          message: content,
          provider,
          model,
        }),
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

      const updated = await getSessionMessages({ data: { sessionId } })
      setMessages(mapRows(updated))
      setStreamingText("")
    } catch (error) {
      console.error("Chat error:", error)
    } finally {
      setLoading(false)
    }
  }

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
    <div className="flex h-screen">
      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between p-4 border-b border-border">
          <h1 className="text-xl font-semibold">Galatea Chat</h1>
          <div className="flex items-center gap-2">
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {(PROVIDER_MODELS[provider] ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </header>
        <MessageList messages={displayMessages} streaming={!!streamingText} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
      <HomeostasisSidebar sessionId={sessionId} messageCount={messages.length} />
    </div>
  )
}
