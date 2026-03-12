/**
 * Thin Qdrant REST client — no external dependency.
 * Uses fetch() against the Qdrant HTTP API.
 */

const DEFAULT_URL = "http://localhost:16333"
const COLLECTION_NAME = "galatea-knowledge"
const VECTOR_DIM = 768 // nomic-embed-text

export interface QdrantPoint {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

export interface QdrantSearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

export interface QdrantClient {
  baseUrl: string
  collectionName: string
}

export function createQdrantClient(
  baseUrl = DEFAULT_URL,
  collectionName = COLLECTION_NAME,
): QdrantClient {
  return { baseUrl, collectionName }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function isQdrantAvailable(client: QdrantClient): Promise<boolean> {
  try {
    const res = await fetch(`${client.baseUrl}/collections/${client.collectionName}`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Collection management
// ---------------------------------------------------------------------------

export async function ensureCollection(client: QdrantClient): Promise<void> {
  const checkRes = await fetch(
    `${client.baseUrl}/collections/${client.collectionName}`,
    { signal: AbortSignal.timeout(5000) },
  )

  if (checkRes.ok) return

  const res = await fetch(
    `${client.baseUrl}/collections/${client.collectionName}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: { size: VECTOR_DIM, distance: "Cosine" },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!res.ok) {
    throw new Error(`Failed to create Qdrant collection: ${res.status} ${await res.text()}`)
  }
}

// ---------------------------------------------------------------------------
// Upsert points
// ---------------------------------------------------------------------------

export async function upsertPoints(
  client: QdrantClient,
  points: QdrantPoint[],
): Promise<void> {
  if (points.length === 0) return

  const res = await fetch(
    `${client.baseUrl}/collections/${client.collectionName}/points`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  )

  if (!res.ok) {
    throw new Error(`Qdrant upsert failed: ${res.status} ${await res.text()}`)
  }
}

// ---------------------------------------------------------------------------
// Search (vector similarity with optional payload filter)
// ---------------------------------------------------------------------------

export interface SearchOptions {
  vector: number[]
  limit?: number
  filter?: QdrantFilter
  scoreThreshold?: number
}

export interface QdrantFilter {
  must?: QdrantCondition[]
  should?: QdrantCondition[]
}

export interface QdrantCondition {
  key: string
  match: { value: string | number | boolean }
}

export async function searchPoints(
  client: QdrantClient,
  opts: SearchOptions,
): Promise<QdrantSearchResult[]> {
  const body: Record<string, unknown> = {
    vector: opts.vector,
    limit: opts.limit ?? 20,
    with_payload: true,
  }

  if (opts.filter) body.filter = opts.filter
  if (opts.scoreThreshold !== undefined) body.score_threshold = opts.scoreThreshold

  const res = await fetch(
    `${client.baseUrl}/collections/${client.collectionName}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!res.ok) {
    throw new Error(`Qdrant search failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  return (data.result ?? []).map((r: { id: string; score: number; payload: Record<string, unknown> }) => ({
    id: typeof r.id === "string" ? r.id : String(r.id),
    score: r.score,
    payload: r.payload,
  }))
}

// ---------------------------------------------------------------------------
// Delete points
// ---------------------------------------------------------------------------

export async function deletePoints(
  client: QdrantClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return

  const res = await fetch(
    `${client.baseUrl}/collections/${client.collectionName}/points/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: ids }),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!res.ok) {
    throw new Error(`Qdrant delete failed: ${res.status} ${await res.text()}`)
  }
}
