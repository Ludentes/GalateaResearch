import { defineEventHandler, readBody } from "h3"
import { checkToolCallSafety } from "../../../../engine/homeostasis-engine"
import type { ToolCallCheckInput, TrustLevel } from "../../../../engine/types"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const input: ToolCallCheckInput = {
    toolName: body.tool_name ?? body.toolName ?? "",
    toolArgs: body.tool_input ?? body.toolArgs ?? {},
    trustLevel: (body.trust_level ?? body.trustLevel ?? "MEDIUM") as TrustLevel,
    workingDirectory: body.working_directory ?? body.workingDirectory,
  }
  return checkToolCallSafety(input)
})
