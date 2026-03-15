import { checkToolCallSafety } from "../../engine/homeostasis-engine"
import type { SafetyCheckResult, TrustLevel } from "../../engine/types"

interface PreToolUseHookOptions {
  workingDirectory: string
  trustLevel: TrustLevel
}

/**
 * Creates a preToolUse hook callback compatible with AdapterHooks.
 * Wraps checkToolCallSafety with workspace and trust context.
 */
export function createPreToolUseHook(
  options: PreToolUseHookOptions,
): (
  toolName: string,
  toolInput: Record<string, unknown>,
) => Promise<SafetyCheckResult> {
  const { workingDirectory, trustLevel } = options

  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<SafetyCheckResult> => {
    return checkToolCallSafety({
      toolName,
      toolArgs: toolInput,
      trustLevel,
      workingDirectory,
    })
  }
}
