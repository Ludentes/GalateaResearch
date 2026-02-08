// @vitest-environment node

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../db/schema"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../chat.logic"

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

describe("Chat Logic (integration with Ollama)", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  afterAll(async () => {
    // Wait for fire-and-forget homeostasis storage to complete
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Clean up test data (order matters: homeostasis_states FK -> messages FK -> sessions)
    if (testSessionId) {
      await testDb
        .delete(homeostasisStates)
        .where(eq(homeostasisStates.sessionId, testSessionId))
      await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("sends a message and gets a real LLM response", async () => {
    const session = await createSessionLogic("Integration Test Session")
    testSessionId = session.id

    const result = await sendMessageLogic(
      testSessionId,
      "What is 2 + 2? Reply with just the number.",
      ollama("llama3.2"),
      "llama3.2",
    )

    // The LLM should respond with something
    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // Verify messages were stored
    const msgs = await getSessionMessagesLogic(testSessionId)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe("user")
    expect(msgs[1].role).toBe("assistant")
    expect(msgs[1].model).toBe("llama3.2")

    // Verify activityLevel is returned from message queries (Task 6: Stage F)
    expect(msgs[0].activityLevel).toBeNull() // user messages have no activityLevel
    expect(msgs[1].activityLevel).toBe(2) // defaults to Level 2 (standard reasoning)
  }, 30000)
})
