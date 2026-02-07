/**
 * Database queries for homeostasis state storage
 */

import { desc, eq } from "drizzle-orm"
import { db } from ".."
import { homeostasisStates } from "../schema"
import type { HomeostasisState } from "../../engine/types"

/**
 * Store homeostasis state assessment in database
 */
export async function storeHomeostasisState(
  sessionId: string,
  messageId: string,
  state: HomeostasisState,
) {
  const [stored] = await db
    .insert(homeostasisStates)
    .values({
      sessionId,
      messageId,
      knowledgeSufficiency: state.knowledge_sufficiency,
      certaintyAlignment: state.certainty_alignment,
      progressMomentum: state.progress_momentum,
      communicationHealth: state.communication_health,
      productiveEngagement: state.productive_engagement,
      knowledgeApplication: state.knowledge_application,
      assessmentMethod: state.assessment_method,
      assessedAt: state.assessed_at,
    })
    .returning()

  return stored
}

/**
 * Get most recent homeostasis state for a session
 */
export async function getLatestHomeostasisState(sessionId: string) {
  const [latest] = await db
    .select()
    .from(homeostasisStates)
    .where(eq(homeostasisStates.sessionId, sessionId))
    .orderBy(desc(homeostasisStates.assessedAt))
    .limit(1)

  return latest
}

/**
 * Get homeostasis history for a session
 */
export async function getHomeostasisHistory(
  sessionId: string,
  limit: number = 10,
) {
  return db
    .select()
    .from(homeostasisStates)
    .where(eq(homeostasisStates.sessionId, sessionId))
    .orderBy(desc(homeostasisStates.assessedAt))
    .limit(limit)
}
