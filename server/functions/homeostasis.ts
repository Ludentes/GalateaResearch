import { createServerFn } from "@tanstack/react-start"
import { desc, eq } from "drizzle-orm"
import { db } from "../db"
import { homeostasisStates } from "../db/schema"

/**
 * Get latest homeostasis state for a session (logic function).
 * Returns null if no state exists.
 */
export async function getHomeostasisStateLogic(sessionId: string) {
  const [state] = await db
    .select()
    .from(homeostasisStates)
    .where(eq(homeostasisStates.sessionId, sessionId))
    .orderBy(desc(homeostasisStates.assessedAt))
    .limit(1)

  if (!state) {
    return null
  }

  return {
    id: state.id,
    sessionId: state.sessionId,
    messageId: state.messageId,
    dimensions: {
      knowledge_sufficiency: state.knowledgeSufficiency,
      certainty_alignment: state.certaintyAlignment,
      progress_momentum: state.progressMomentum,
      communication_health: state.communicationHealth,
      productive_engagement: state.productiveEngagement,
      knowledge_application: state.knowledgeApplication,
    },
    assessmentMethod: state.assessmentMethod as Record<string, "computed" | "llm">,
    assessedAt: state.assessedAt.toISOString(),
  }
}

/**
 * Get latest homeostasis state for a session.
 * Returns null if no state exists (404 equivalent).
 */
export const getHomeostasisState = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data }) => {
    return getHomeostasisStateLogic(data.sessionId)
  })
