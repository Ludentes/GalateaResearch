import type { LanguageModel } from "ai"
import { createOllama } from "ai-sdk-ollama"

export function createOllamaModel(
  modelId: string,
  baseUrl: string,
  options?: { think?: boolean },
): LanguageModel {
  const provider = createOllama({ baseURL: baseUrl })
  return provider(modelId, { think: options?.think }) as LanguageModel
}
