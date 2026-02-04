import type { LanguageModel } from "ai"
import { claudeCode } from "ai-sdk-provider-claude-code"

export function createClaudeCodeModel(modelId: string): LanguageModel {
  return claudeCode(modelId) as LanguageModel
}
