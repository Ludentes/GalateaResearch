import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"

export function createOpenRouterModel(
  modelId: string,
  apiKey: string,
): LanguageModel {
  const provider = createOpenRouter({ apiKey })
  return provider(modelId) as LanguageModel
}
