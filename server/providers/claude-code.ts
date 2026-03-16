import type { LanguageModel } from "ai"
import { generateText } from "ai"
import { claudeCode } from "ai-sdk-provider-claude-code"

export function createClaudeCodeModel(modelId: string): LanguageModel {
  return claudeCode(modelId) as LanguageModel
}

function isAuthError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err)
  return (
    msg.includes("401") ||
    msg.includes("authentication_error") ||
    msg.includes("OAuth token has expired") ||
    msg.includes("Unauthorized")
  )
}

/**
 * Call Claude Code with a single retry on auth errors.
 * Unsets CLAUDECODE env var to avoid nested-session detection,
 * and on 401 waits 2s for Claude Code to refresh its token before retrying.
 */
export async function claudeCodeGenerateText(opts: {
  modelId: string
  prompt: string
  maxOutputTokens: number
  timeoutMs: number
}): Promise<string> {
  const attempt = async () => {
    const savedEnv = process.env.CLAUDECODE
    delete process.env.CLAUDECODE
    try {
      const model = createClaudeCodeModel(opts.modelId)
      const result = await generateText({
        model,
        prompt: opts.prompt,
        maxOutputTokens: opts.maxOutputTokens,
        abortSignal: AbortSignal.timeout(opts.timeoutMs),
      })
      return result.text
    } finally {
      if (savedEnv) process.env.CLAUDECODE = savedEnv
    }
  }

  try {
    return await attempt()
  } catch (err) {
    if (isAuthError(err)) {
      // Wait briefly for Claude Code to refresh its token, then retry once
      await new Promise((r) => setTimeout(r, 2000))
      return await attempt()
    }
    throw err
  }
}
