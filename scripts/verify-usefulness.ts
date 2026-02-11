import { readFileSync } from "node:fs"
import { generateText } from "ai"
import { createOllamaModel } from "../server/providers/ollama"

const model = createOllamaModel(
  "glm-4.7-flash:latest",
  "http://localhost:11434",
)
const knowledge = readFileSync("data/memory/knowledge.md", "utf-8")

const questions = [
  "What package manager should I use for this project?",
  "What is the MVP scope for this project?",
  "How should IoT devices be controlled in the MVP?",
  "What is the Sentinel app and what does it do?",
  "Should I use MongoDB or PostgreSQL for the CMS?",
]

async function main() {
  for (const question of questions) {
    console.log("Q:", question)
    console.log()

    // With knowledge
    const withKnowledge = await generateText({
      model,
      system: knowledge,
      messages: [{ role: "user", content: question }],
    })
    console.log("WITH knowledge:", withKnowledge.text.slice(0, 300))
    console.log()

    // Without knowledge
    const withoutKnowledge = await generateText({
      model,
      messages: [{ role: "user", content: question }],
    })
    console.log("WITHOUT knowledge:", withoutKnowledge.text.slice(0, 300))
    console.log()
    console.log("---")
    console.log()
  }
}

main().catch(console.error)
