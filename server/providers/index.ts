import type { LanguageModel } from "ai"
import { createClaudeCodeModel } from "./claude-code"
import type { LLMProvider } from "./config"
import { getLLMConfig, VALID_PROVIDERS } from "./config"
import { createOllamaModel } from "./ollama"
import { ollamaQueue } from "./ollama-queue"
import { createOpenRouterModel } from "./openrouter"

export function getModelWithFallback(
  overrideProvider?: string,
  overrideModel?: string,
): { model: LanguageModel; modelName: string; fallback: boolean } {
  const config = getLLMConfig()
  const provider = overrideProvider || config.provider

  // If Ollama and circuit is open, try OpenRouter fallback
  if (provider === "ollama" && ollamaQueue.state.circuitState === "open") {
    if (config.openrouterApiKey) {
      console.log("[providers] Ollama circuit open, falling back to OpenRouter")
      const fallbackModel =
        process.env.OPENROUTER_MODEL || "z-ai/glm-4.5-air:free"
      return {
        model: createOpenRouterModel(fallbackModel, config.openrouterApiKey),
        modelName: `openrouter:${fallbackModel}`,
        fallback: true,
      }
    }
    // No fallback available — caller will get circuit open error from queue
  }

  const { model, modelName } = getModel(overrideProvider, overrideModel)
  return { model, modelName, fallback: false }
}

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
