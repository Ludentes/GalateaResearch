// @vitest-environment node
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it, vi } from "vitest"
import { messages, sessions } from "../../db/schema"
import { streamMessageLogic } from "../chat.logic"

// Mock the AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Mocked AI response",
    usage: { totalTokens: 42 },
  }),
  streamText: vi.fn().mockReturnValue({
    textStream: (async function* () {
      yield "Hello "
      yield "from "
      yield "stream"
    })(),
    text: Promise.resolve("Hello from stream"),
    usage: Promise.resolve({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    }),
    toTextStreamResponse: vi
      .fn()
      .mockReturnValue(new Response("Hello from stream")),
  }),
}))

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

describe("Stream Chat Logic (unit)", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  afterAll(async () => {
    // Clean up test data
    if (testSessionId) {
      await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("streamMessageLogic stores user message and returns stream result", async () => {
    // Create a test session
    const [session] = await testDb
      .insert(sessions)
      .values({ name: "Stream Unit Test Session" })
      .returning()
    testSessionId = session.id

    // Create a mock model object that satisfies LanguageModel
    const mockModel = {} as Parameters<typeof streamMessageLogic>[2]

    const result = await streamMessageLogic(
      testSessionId,
      "Hello from stream test",
      mockModel,
      "mock-stream-model",
    )

    // Verify result has expected stream properties
    expect(result.textStream).toBeDefined()
    expect(result.toTextStreamResponse).toBeDefined()

    // Verify user message was stored in DB
    const msgs = await testDb
      .select()
      .from(messages)
      .where(eq(messages.sessionId, testSessionId))
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe("user")
    expect(msgs[0].content).toBe("Hello from stream test")
  })
})
