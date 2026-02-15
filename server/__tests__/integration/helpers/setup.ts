// @vitest-environment node
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { existsSync, rmSync } from "node:fs"
import postgres from "postgres"
import { messages, preprompts, sessions } from "../../../db/schema"

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

let client: ReturnType<typeof postgres> | null = null
let testDb: ReturnType<typeof drizzle> | null = null

export function getTestDb() {
  if (!testDb) {
    client = postgres(TEST_DB_URL)
    testDb = drizzle(client)
  }
  return testDb
}

export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.end()
    client = null
    testDb = null
  }
}

export async function ensureTestDb(): Promise<void> {
  const db = getTestDb()
  try {
    await db.select().from(sessions).limit(1)
  } catch (e) {
    throw new Error(
      `PostgreSQL not reachable at ${TEST_DB_URL}. Start with: docker compose up -d\n${e}`,
    )
  }
}

export async function ensureOllama(): Promise<void> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  try {
    const res = await fetch(`${baseUrl}/api/tags`)
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
  } catch {
    throw new Error(
      `Ollama not reachable at ${baseUrl}. Start with: ollama serve`,
    )
  }
}

export async function cleanupTestSession(sessionId: string): Promise<void> {
  const db = getTestDb()
  await db.delete(messages).where(eq(messages.sessionId, sessionId))
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function cleanupTestPreprompts(
  prepromptIds: string[],
): Promise<void> {
  const db = getTestDb()
  for (const id of prepromptIds) {
    await db.delete(preprompts).where(eq(preprompts.id, id))
  }
}

export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    if (existsSync(p)) rmSync(p, { recursive: true })
  }
}
