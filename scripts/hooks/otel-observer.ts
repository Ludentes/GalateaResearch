#!/usr/bin/env -S pnpm tsx
/**
 * Claude Code OTEL Observer Hook
 *
 * Emits real-time OTEL events for Claude Code interactions:
 * - UserPromptSubmit: When user sends a prompt
 * - PostToolUse: After a tool is executed
 *
 * Sends OTLP/JSON to OTEL Collector at localhost:4318
 */
import { randomUUID } from "node:crypto"

// Read hook input from stdin
const input = await new Promise<string>((resolve) => {
  let data = ""
  process.stdin.on("data", (chunk) => (data += chunk))
  process.stdin.on("end", () => resolve(data))
})

const hookData = JSON.parse(input)
const { event_type } = hookData

const OTEL_ENDPOINT =
  process.env.OTEL_COLLECTOR_URL || "http://localhost:4318/v1/logs"

/**
 * Send OTLP/JSON log to collector
 */
async function sendOTLPLog(body: string, attributes: Record<string, string>) {
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "claude-code" },
            },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "galatea-hooks" },
            logRecords: [
              {
                timeUnixNano: String(Date.now() * 1_000_000),
                severityText: "INFO",
                body: { stringValue: body },
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: value },
                })),
              },
            ],
          },
        ],
      },
    ],
  }

  try {
    await fetch(OTEL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Don't block hook on OTEL failure
    console.error(`OTEL observer failed: ${err}`)
  }
}

// Handle different event types
if (event_type === "UserPromptSubmit") {
  const { user_prompt, session_id } = hookData
  await sendOTLPLog(`User prompt: ${user_prompt.slice(0, 100)}...`, {
    event_type: "user_prompt_submit",
    session_id: session_id || "unknown",
    prompt_length: String(user_prompt.length),
    event_id: randomUUID(),
  })
} else if (event_type === "PostToolUse") {
  const { tool_name, tool_input, session_id } = hookData
  await sendOTLPLog(`Tool executed: ${tool_name}`, {
    event_type: "post_tool_use",
    session_id: session_id || "unknown",
    tool_name: tool_name || "unknown",
    has_input: String(!!tool_input),
    event_id: randomUUID(),
  })
}

// Output for Claude Code
console.log(JSON.stringify({ continue: true }))
