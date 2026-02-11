import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  tokenCount?: number
}

interface MessageListProps {
  messages: ChatMessage[]
  streaming?: boolean
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message count or streaming text change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-3",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap text-sm">
                {msg.content}
                {streaming && msg.id === "streaming" && (
                  <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse" />
                )}
              </p>
              {msg.role === "assistant" &&
                msg.id !== "streaming" &&
                (msg.model || msg.inputTokens || msg.outputTokens) && (
                  <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                    {msg.model && <span>{msg.model}</span>}
                    {msg.inputTokens && <span>↑{msg.inputTokens}</span>}
                    {msg.outputTokens && <span>↓{msg.outputTokens}</span>}
                    {msg.tokenCount && <span>({msg.tokenCount} total)</span>}
                  </div>
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
