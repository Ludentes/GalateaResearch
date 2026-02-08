// @vitest-environment node
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it, vi } from "vitest"
import { homeostasisStates, messages, sessions } from "../../db/schema"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../chat.logic"

// Mock the AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Mocked AI response",
    usage: { totalTokens: 42 },
  }),
}))

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

describe("Chat Logic (unit)", () => {
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

  it("createSessionLogic creates a session", async () => {
    const session = await createSessionLogic("Unit Test Session")
    testSessionId = session.id
    expect(session.name).toBe("Unit Test Session")
    expect(session.id).toBeDefined()
  })

  it("getSessionMessagesLogic returns empty for new session", async () => {
    const msgs = await getSessionMessagesLogic(testSessionId)
    expect(msgs).toHaveLength(0)
  })

  it("sendMessageLogic stores user message and mocked response", async () => {
    // Create a mock model object that satisfies LanguageModel
    const mockModel = {} as Parameters<typeof sendMessageLogic>[2]

    const result = await sendMessageLogic(
      testSessionId,
      "Hello from unit test",
      mockModel,
      "mock-model",
    )

    expect(result.text).toBe("Mocked AI response")

    const msgs = await getSessionMessagesLogic(testSessionId)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe("user")
    expect(msgs[0].content).toBe("Hello from unit test")
    expect(msgs[1].role).toBe("assistant")
    expect(msgs[1].content).toBe("Mocked AI response")
    expect(msgs[1].model).toBe("mock-model")
    expect(msgs[1].tokenCount).toBe(42)

    // Verify activityLevel is returned from message queries (Task 6: Stage F)
    // User messages have no activityLevel (inserted without one)
    expect(msgs[0].activityLevel).toBeNull()
    // Assistant messages get activityLevel from ActivityRouter classification
    // With null procedure and null homeostasis, defaults to Level 2
    expect(msgs[1].activityLevel).toBe(2)
  })
})
