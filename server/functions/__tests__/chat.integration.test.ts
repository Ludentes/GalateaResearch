// @vitest-environment node

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { messages, sessions } from "../../db/schema"
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
    if (testSessionId) {
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
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    const msgs = await getSessionMessagesLogic(testSessionId)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe("user")
    expect(msgs[1].role).toBe("assistant")
    expect(msgs[1].model).toBe("glm-4.7-flash")
  }, 60000)
})
