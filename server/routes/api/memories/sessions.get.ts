import { desc } from "drizzle-orm"
import { defineEventHandler } from "h3"
import { db } from "../../../db"
import { sessions } from "../../../db/schema"

export default defineEventHandler(async () => {
  const rows = await db
    .select({
      id: sessions.id,
      name: sessions.name,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .orderBy(desc(sessions.createdAt))

  return { sessions: rows }
})
