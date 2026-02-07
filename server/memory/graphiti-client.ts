/**
 * HTTP client for the Graphiti REST API sidecar.
 *
 * All methods are fire-and-forget safe — errors are caught and logged,
 * never thrown to callers, following the graceful-degradation principle.
 */

import type {
  AddEntityNodeRequest,
  AddMessagesRequest,
  AddMessagesResponse,
  EpisodeResult,
  FactResult,
  GetMemoryRequest,
  GraphitiMessage,
  HealthcheckResponse,
  SearchRequest,
  SearchResponse,
} from "./types"

const GRAPHITI_URL = process.env.GRAPHITI_URL || "http://localhost:18000"

const REQUEST_TIMEOUT_MS = 30_000

async function graphitiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${GRAPHITI_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.warn(
        `[graphiti] ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`,
      )
      return null
    }

    return (await res.json()) as T
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn(`[graphiti] ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`)
    } else {
      console.warn(`[graphiti] ${path} failed:`, err)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Check if the Graphiti sidecar is reachable. */
export async function isHealthy(): Promise<boolean> {
  const res = await graphitiFetch<HealthcheckResponse>("/healthcheck")
  return res?.status === "healthy"
}

/**
 * Ingest messages into the knowledge graph.
 * Messages are processed asynchronously by the sidecar (returns 202).
 */
export async function ingestMessages(
  groupId: string,
  messages: GraphitiMessage[],
): Promise<boolean> {
  const body: AddMessagesRequest = {
    group_id: groupId,
    messages,
  }

  const res = await graphitiFetch<AddMessagesResponse>("/messages", {
    method: "POST",
    body: JSON.stringify(body),
  })

  return res != null
}

/**
 * Check if query text matches the fact text (case-insensitive, whole word match)
 */
function hasExactKeywordMatch(fact: string, query: string): boolean {
  const queryLower = query.toLowerCase().trim()
  const factLower = fact.toLowerCase()

  // Match whole words only (not substrings)
  const wordBoundaryRegex = new RegExp(
    `\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  )
  return wordBoundaryRegex.test(factLower)
}

/**
 * Search the knowledge graph for relevant facts.
 *
 * For short queries (< 10 chars OR single word), prioritizes exact keyword matches
 * to avoid vector similarity false positives on small datasets.
 *
 * Returns an empty array on failure (graceful degradation).
 */
export async function searchFacts(
  query: string,
  groupIds: string[],
  maxFacts = 10,
): Promise<FactResult[]> {
  const body: SearchRequest = {
    query,
    max_facts: maxFacts * 2, // Fetch more results for filtering
    // Only include group_ids if non-empty (empty array causes Graphiti to return nothing)
    ...(groupIds.length > 0 && { group_ids: groupIds }),
  }

  const res = await graphitiFetch<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify(body),
  })

  const facts = res?.facts ?? []

  // For short queries, prioritize exact keyword matches
  const isShortQuery =
    query.trim().length < 10 || query.trim().split(/\s+/).length === 1

  if (isShortQuery && facts.length > 0) {
    // Separate exact matches from fuzzy matches
    const exactMatches = facts.filter((f) =>
      hasExactKeywordMatch(f.fact, query),
    )
    const fuzzyMatches = facts.filter(
      (f) => !hasExactKeywordMatch(f.fact, query),
    )

    // Return exact matches first, then fuzzy matches, limited to maxFacts
    return [...exactMatches, ...fuzzyMatches].slice(0, maxFacts)
  }

  return facts.slice(0, maxFacts)
}

/**
 * Retrieve context-aware memory for a conversation.
 * Returns an empty array on failure (graceful degradation).
 */
export async function getMemory(
  groupId: string,
  messages: Array<{ role: string; content: string }>,
  maxFacts = 10,
): Promise<FactResult[]> {
  const body: GetMemoryRequest = {
    group_id: groupId,
    messages: messages.map((m) => ({
      ...m,
      role_type: m.role,
    })),
    max_facts: maxFacts,
    center_node_uuid: null,
  }

  const res = await graphitiFetch<SearchResponse>("/get-memory", {
    method: "POST",
    body: JSON.stringify(body),
  })

  return res?.facts ?? []
}

/**
 * Create or update an entity node in the knowledge graph.
 * Used by cognitive models to create structured self-model / user-model nodes.
 */
export async function addEntityNode(
  node: AddEntityNodeRequest,
): Promise<boolean> {
  const res = await graphitiFetch<{ message: string; success: boolean }>(
    "/entity-node",
    {
      method: "POST",
      body: JSON.stringify(node),
    },
  )
  return res?.success ?? false
}

/**
 * Retrieve recent episodes for a group.
 * Returns an empty array on failure (graceful degradation).
 */
export async function getEpisodes(
  groupId: string,
  lastN = 20,
): Promise<EpisodeResult[]> {
  const res = await graphitiFetch<EpisodeResult[]>(
    `/episodes/${encodeURIComponent(groupId)}?last_n=${lastN}`,
  )
  return res ?? []
}

/**
 * Delete all data for a group (session).
 */
export async function deleteGroup(groupId: string): Promise<boolean> {
  const res = await graphitiFetch<{ message: string; success: boolean }>(
    `/group/${encodeURIComponent(groupId)}`,
    { method: "DELETE" },
  )
  return res?.success ?? false
}
