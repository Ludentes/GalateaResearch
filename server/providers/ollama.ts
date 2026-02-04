import type { LanguageModel } from "ai"
import { createOllama } from "ai-sdk-ollama"

export function createOllamaModel(
  modelId: string,
  baseUrl: string,
): LanguageModel {
  const provider = createOllama({ baseURL: baseUrl })
  return provider(modelId) as LanguageModel
}
