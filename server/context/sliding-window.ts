import { getContextConfig } from "../engine/config"
import type {
  CompressedContext,
  ContextCompressor,
  Message,
} from "./compressor"

export class SlidingWindowCompressor implements ContextCompressor {
  async compress(
    messages: Message[],
    budgetTokens: number,
  ): Promise<CompressedContext> {
    if (messages.length === 0) {
      return { messages: [], dropped: 0, tokensEstimated: 0 }
    }

    const charsPerToken = getContextConfig().compression?.chars_per_token ?? 4

    // Always keep first message
    const first = messages[0]
    const firstTokens = estimateTokens(first.content, charsPerToken)

    if (messages.length === 1) {
      return { messages: [first], dropped: 0, tokensEstimated: firstTokens }
    }

    // Fill from newest to oldest (after first)
    const rest = messages.slice(1)
    const kept: Message[] = []
    let usedTokens = firstTokens

    for (let i = rest.length - 1; i >= 0; i--) {
      const tokens = estimateTokens(rest[i].content, charsPerToken)
      if (usedTokens + tokens <= budgetTokens) {
        kept.unshift(rest[i])
        usedTokens += tokens
      }
    }

    return {
      messages: [first, ...kept],
      dropped: messages.length - 1 - kept.length,
      tokensEstimated: usedTokens,
    }
  }
}

function estimateTokens(text: string, charsPerToken: number): number {
  return Math.ceil(text.length / charsPerToken)
}
