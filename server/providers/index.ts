import type { LanguageModel } from "ai"
import { createClaudeCodeModel } from "./claude-code"
import type { LLMProvider } from "./config"
import { getLLMConfig, VALID_PROVIDERS } from "./config"
import { createOllamaModel } from "./ollama"
import { createOpenRouterModel } from "./openrouter"

export function getModel(
  overrideProvider?: string,
  overrideModel?: string,
): { model: LanguageModel; modelName: string } {
  const config = getLLMConfig()

  const provider = overrideProvider || config.provider
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`Unknown provider: "${provider}"`)
  }
  const typed = provider as LLMProvider
  const modelName = overrideModel || config.model

  switch (typed) {
    case "ollama":
      return {
        model: createOllamaModel(modelName, config.ollamaBaseUrl),
        modelName,
      }
    case "openrouter":
      return {
        model: createOpenRouterModel(modelName, config.openrouterApiKey!),
        modelName,
      }
    case "claude-code":
      return {
        model: createClaudeCodeModel(modelName),
        modelName,
      }
  }
}
