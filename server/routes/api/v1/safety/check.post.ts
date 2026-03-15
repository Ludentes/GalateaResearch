import { defineEventHandler, readBody } from "h3"
import { checkToolCallSafety } from "../../../../engine/homeostasis-engine"
import type { ToolCallCheckInput, TrustLevel } from "../../../../engine/types"

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  const input: ToolCallCheckInput = {
    toolName: (body.tool_name ?? body.toolName ?? "") as string,
    toolArgs: (body.tool_input ?? body.toolArgs ?? {}) as Record<
      string,
      unknown
    >,
    trustLevel: (body.trust_level ??
      body.trustLevel ??
      "MEDIUM") as string as TrustLevel,
    workingDirectory: (body.working_directory ?? body.workingDirectory) as
      | string
      | undefined,
  }
  return checkToolCallSafety(input)
})
