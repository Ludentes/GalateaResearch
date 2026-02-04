import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { messages, personas, preprompts, sessions } from "../schema"

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

describe("Drizzle Schema", () => {
  const client = postgres(TEST_DB_URL)
  const db = drizzle(client)

  afterAll(async () => {
    await client.end()
  })

  it("creates and retrieves a session", async () => {
    const [session] = await db
      .insert(sessions)
      .values({ name: "Test Session" })
      .returning()

    expect(session.id).toBeDefined()
    expect(session.name).toBe("Test Session")

    await db.delete(sessions).where(eq(sessions.id, session.id))
  })

  it("creates a message linked to a session", async () => {
    const [session] = await db
      .insert(sessions)
      .values({ name: "Test Session" })
      .returning()

    const [message] = await db
      .insert(messages)
      .values({
        sessionId: session.id,
        role: "user",
        content: "Hello, Galatea",
      })
      .returning()

    expect(message.sessionId).toBe(session.id)
    expect(message.content).toBe("Hello, Galatea")

    await db.delete(messages).where(eq(messages.id, message.id))
    await db.delete(sessions).where(eq(sessions.id, session.id))
  })

  it("creates a persona with JSON thresholds", async () => {
    const [persona] = await db
      .insert(personas)
      .values({
        name: "Test Programmer",
        role: "Mobile Developer",
        domain: "expo-react-native",
        thresholds: {
          certaintyAlignment: {
            context: "Architecture questions",
            value: 0.8,
          },
        },
      })
      .returning()

    expect(persona.thresholds).toEqual({
      certaintyAlignment: {
        context: "Architecture questions",
        value: 0.8,
      },
    })

    await db.delete(personas).where(eq(personas.id, persona.id))
  })

  it("creates a preprompt with unique name", async () => {
    const [preprompt] = await db
      .insert(preprompts)
      .values({
        name: "test-core-identity",
        type: "core",
        content: "You are Galatea, an AI agent.",
        priority: 100,
      })
      .returning()

    expect(preprompt.type).toBe("core")
    expect(preprompt.priority).toBe(100)

    await db.delete(preprompts).where(eq(preprompts.id, preprompt.id))
  })
})
