/**
 * Cognitive Models — self-awareness and user personalization via the
 * knowledge graph.
 *
 * Two model types:
 *   - Self-Model (per persona): strengths, weaknesses, recent misses
 *   - User-Model (per user): preferences, expectations, communication style
 *
 * Data lives in the "global" group_id (cross-session) so cognitive models
 * accumulate across conversations. Entity naming convention:
 *   - Self-model root: "self:<personaId>"
 *   - User-model root: "user:<userName>"
 *
 * Uses Graphiti HTTP API:
 *   - Search (`POST /search`) for retrieval (semantic similarity on facts)
 *   - Ingestion (`POST /messages`) for adding observations
 *
 * Graceful degradation: returns empty models when Graphiti is down.
 */

import { ingestMessages, searchFacts } from "./graphiti-client"
import type {
  CognitiveObservationType,
  GraphitiMessage,
  SelfModel,
  UserModel,
} from "./types"

const GLOBAL_GROUP = "global"

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve the self-model for a persona. Searches the knowledge graph
 * for facts about strengths, weaknesses, and recent misses.
 */
export async function getSelfModel(personaId: string): Promise<SelfModel> {
  const empty: SelfModel = {
    strengths: [],
    weaknesses: [],
    recentMisses: [],
  }

  const query = `self:${personaId} strengths weaknesses recent misses`
  const facts = await searchFacts(query, [GLOBAL_GROUP], 30)
  if (facts.length === 0) return empty

  for (const f of facts) {
    const lower = f.fact.toLowerCase()
    if (lower.includes("weakness") || lower.includes("struggle")) {
      empty.weaknesses.push(f.fact)
    } else if (lower.includes("miss") || lower.includes("forgot")) {
      empty.recentMisses.push(f.fact)
    } else if (
      lower.includes("strength") ||
      lower.includes("strong") ||
      lower.includes("good at")
    ) {
      empty.strengths.push(f.fact)
    } else {
      // Ambiguous — treat as strength (optimistic default)
      empty.strengths.push(f.fact)
    }
  }

  return empty
}

/**
 * Retrieve the user-model for a given user name. Searches for facts
 * about preferences, expectations, and communication style.
 */
export async function getUserModel(userName: string): Promise<UserModel> {
  const empty: UserModel = {
    preferences: [],
    expectations: [],
    communicationStyle: null,
  }

  const query = `user:${userName} preferences expectations communication style`
  const facts = await searchFacts(query, [GLOBAL_GROUP], 30)
  if (facts.length === 0) return empty

  for (const f of facts) {
    const lower = f.fact.toLowerCase()
    if (
      lower.includes("communication style") ||
      lower.includes("communicates")
    ) {
      empty.communicationStyle = f.fact
    } else if (
      lower.includes("expect") ||
      lower.includes("requires") ||
      lower.includes("wants")
    ) {
      empty.expectations.push(f.fact)
    } else {
      // Default to preference
      empty.preferences.push(f.fact)
    }
  }

  return empty
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

/**
 * Record a self-model observation by ingesting a structured message
 * into the "global" group.
 */
export async function updateSelfModel(
  personaId: string,
  type: Extract<
    CognitiveObservationType,
    "strength" | "weakness" | "recent_miss"
  >,
  observation: string,
): Promise<boolean> {
  const label = type.replace("_", " ")
  const messages: GraphitiMessage[] = [
    {
      content: `[Self-model observation for ${personaId}] ${label}: ${observation}`,
      role_type: "system",
      role: "system",
      name: `self-${personaId}-${type}-${Date.now()}`,
      source_description: `cognitive-model:self:${personaId}`,
    },
  ]

  return ingestMessages(GLOBAL_GROUP, messages)
}

/**
 * Record a user-model observation by ingesting a structured message
 * into the "global" group.
 */
export async function updateUserModel(
  userName: string,
  type: Extract<
    CognitiveObservationType,
    "preference" | "expectation" | "communication_style"
  >,
  observation: string,
): Promise<boolean> {
  const label = type.replace("_", " ")
  const messages: GraphitiMessage[] = [
    {
      content: `[User-model observation for ${userName}] ${label}: ${observation}`,
      role_type: "system",
      role: "system",
      name: `user-${userName}-${type}-${Date.now()}`,
      source_description: `cognitive-model:user:${userName}`,
    },
  ]

  return ingestMessages(GLOBAL_GROUP, messages)
}
