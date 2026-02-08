// @vitest-environment node

/**
 * Stage F: UI Visualization Integration Tests
 *
 * Tests the full data flow from database to API functions:
 * - Messages with activityLevel are queryable
 * - Homeostasis states are queryable via getHomeostasisStateLogic
 * - Missing data is handled gracefully
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import { getSessionMessagesLogic } from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis"

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

describe("Stage F: UI Visualization Integration", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  beforeAll(async () => {
    const [session] = await testDb
      .insert(sessions)
      .values({ name: "Stage F Integration Test" })
      .returning()
    testSessionId = session.id
  })

  afterAll(async () => {
    if (testSessionId) {
      await testDb
        .delete(homeostasisStates)
        .where(eq(homeostasisStates.sessionId, testSessionId))
      await testDb
        .delete(messages)
        .where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("full flow: message with activityLevel + homeostasis state queryable via APIs", async () => {
    // Insert assistant message with activity level
    const [message] = await testDb
      .insert(messages)
      .values({
        sessionId: testSessionId,
        role: "assistant",
        content: "Test response",
        model: "Sonnet",
        activityLevel: 2,
        tokenCount: 100,
        inputTokens: 60,
        outputTokens: 40,
      })
      .returning()

    // Insert homeostasis state for the message
    await testDb
      .insert(homeostasisStates)
      .values({
        sessionId: testSessionId,
        messageId: message.id,
        knowledgeSufficiency: "HEALTHY",
        certaintyAlignment: "HIGH",
        progressMomentum: "LOW",
        communicationHealth: "HEALTHY",
        productiveEngagement: "HEALTHY",
        knowledgeApplication: "LOW",
        assessmentMethod: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "llm",
        },
        assessedAt: new Date(),
      })
      .returning()

    // Query messages API — should include activityLevel
    const msgs = await getSessionMessagesLogic(testSessionId)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].activityLevel).toBe(2)
    expect(msgs[0].model).toBe("Sonnet")
    expect(msgs[0].inputTokens).toBe(60)
    expect(msgs[0].outputTokens).toBe(40)

    // Query homeostasis API — should return formatted state
    const state = await getHomeostasisStateLogic(testSessionId)
    expect(state).not.toBeNull()
    expect(state?.dimensions.knowledge_sufficiency).toBe("HEALTHY")
    expect(state?.dimensions.certainty_alignment).toBe("HIGH")
    expect(state?.dimensions.progress_momentum).toBe("LOW")
    expect(state?.dimensions.communication_health).toBe("HEALTHY")
    expect(state?.dimensions.productive_engagement).toBe("HEALTHY")
    expect(state?.dimensions.knowledge_application).toBe("LOW")
    expect(state?.assessmentMethod.knowledge_sufficiency).toBe("computed")
    expect(state?.assessmentMethod.certainty_alignment).toBe("llm")
  })

  it("returns null homeostasis for session with no assessment", async () => {
    // Use a valid UUID that doesn't exist in the database
    const result = await getHomeostasisStateLogic("00000000-0000-0000-0000-000000000000")
    expect(result).toBeNull()
  })

  it("handles old messages without activityLevel gracefully", async () => {
    // Insert message without activityLevel (simulates pre-Phase 3 data)
    await testDb
      .insert(messages)
      .values({
        sessionId: testSessionId,
        role: "assistant",
        content: "Old message without activity level",
        model: "llama3.2",
      })
      .returning()

    const msgs = await getSessionMessagesLogic(testSessionId)
    const oldMsg = msgs.find((m) => m.content === "Old message without activity level")
    expect(oldMsg).toBeDefined()
    expect(oldMsg?.activityLevel).toBeNull()
  })
})
