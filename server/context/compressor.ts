export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export interface CompressedContext {
  messages: Message[]
  dropped: number
  tokensEstimated: number
}

export interface ContextCompressor {
  compress(
    messages: Message[],
    budgetTokens: number,
  ): Promise<CompressedContext>
}
