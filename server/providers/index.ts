import type { LanguageModel } from "ai"
import { createClaudeCodeModel } from "./claude-code"
import { getLLMConfig } from "./config"
import { createOllamaModel } from "./ollama"
import { createOpenRouterModel } from "./openrouter"

export function getModel(): { model: LanguageModel; modelName: string } {
  const config = getLLMConfig()
  switch (config.provider) {
    case "ollama":
      return {
        model: createOllamaModel(config.model, config.ollamaBaseUrl),
        modelName: config.model,
      }
    case "openrouter":
      return {
        model: createOpenRouterModel(config.model, config.openrouterApiKey!),
        modelName: config.model,
      }
    case "claude-code":
      return {
        model: createClaudeCodeModel(config.model),
        modelName: config.model,
      }
  }
}
