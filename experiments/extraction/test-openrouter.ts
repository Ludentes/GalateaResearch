import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  console.error("OPENROUTER_API_KEY not set")
  process.exit(1)
}

const provider = createOpenRouter({ apiKey })
const model = provider("anthropic/claude-haiku-4.5")

const { text, usage } = await generateText({
  model,
  prompt: "Reply with exactly: HAIKU_OK",
  maxTokens: 10,
})
console.log("Response:", text)
console.log("Usage:", JSON.stringify(usage))
