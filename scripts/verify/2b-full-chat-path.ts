import { eq } from "drizzle-orm"
import { ollama } from "ai-sdk-ollama"
import { db } from "../../server/db"
import { messages, sessions } from "../../server/db/schema"
import {
  createSessionLogic,
  sendMessageLogic,
} from "../../server/functions/chat.logic"

;(async () => {
  const session = await createSessionLogic("Phase D verification")
  console.log("Session ID:", session.id)

  const result = await sendMessageLogic(
    session.id,
    "What do you know about stakeholder Alina and how she prefers to receive updates?",
    ollama("glm-4.7-flash"),
    "glm-4.7-flash",
  )

  console.log()
  console.log("--- LLM Response ---")
  console.log(result.text)
  console.log()
  console.log(
    "If the response mentions Alina-specific details from the knowledge store,",
  )
  console.log(
    "the feedback loop is working. If it gives a generic response, it is not.",
  )

  // Cleanup
  await db.delete(messages).where(eq(messages.sessionId, session.id))
  await db.delete(sessions).where(eq(sessions.id, session.id))
  process.exit(0)
})()
