export type LLMProvider = "ollama" | "openrouter" | "claude-code"

const VALID_PROVIDERS: readonly string[] = [
  "ollama",
  "openrouter",
  "claude-code",
]

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  ollama: "llama3.2",
  openrouter: "anthropic/claude-sonnet-4",
  "claude-code": "sonnet",
}

export interface LLMConfig {
  provider: LLMProvider
  model: string
  ollamaBaseUrl: string
  openrouterApiKey?: string
  anthropicApiKey?: string
}

export function getLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER || "ollama"
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown LLM_PROVIDER: "${provider}". Valid: ${VALID_PROVIDERS.join(", ")}`,
    )
  }
  const typed = provider as LLMProvider
  const model = process.env.LLM_MODEL || DEFAULT_MODELS[typed]
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (typed === "openrouter" && !openrouterApiKey)
    throw new Error(
      "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter",
    )
  if (typed === "claude-code" && !anthropicApiKey)
    throw new Error(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude-code",
    )

  return {
    provider: typed,
    model,
    ollamaBaseUrl,
    openrouterApiKey,
    anthropicApiKey,
  }
}
