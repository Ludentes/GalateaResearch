/**
 * Sync knowledge entries from JSONL to Qdrant.
 *
 * Reads all active (non-superseded) entries, generates embeddings via Ollama,
 * and upserts them to Qdrant with payload fields for filtering.
 *
 * Usage: pnpm exec tsx scripts/sync-qdrant.ts [--store <path>] [--dry-run]
 */

import { batchEmbed, readEntries } from "../server/memory/knowledge-store"
import {
  createQdrantClient,
  ensureCollection,
  isQdrantAvailable,
  type QdrantPoint,
  upsertPoints,
} from "../server/memory/qdrant-client"
import type { KnowledgeEntry } from "../server/memory/types"

const STORE_PATH = process.argv.includes("--store")
  ? process.argv[process.argv.indexOf("--store") + 1]
  : "data/memory/entries.jsonl"

const DRY_RUN = process.argv.includes("--dry-run")
const BATCH_SIZE = 32 // embed + upsert in batches
const OLLAMA_URL = "http://localhost:11434"

async function main() {
  console.log(`[sync] Reading entries from ${STORE_PATH}`)
  const allEntries = await readEntries(STORE_PATH)
  const active = allEntries.filter((e) => !e.supersededBy)
  console.log(
    `[sync] ${allEntries.length} total entries, ${active.length} active (non-superseded)`,
  )

  if (active.length === 0) {
    console.log("[sync] Nothing to sync.")
    return
  }

  const client = createQdrantClient()

  // Check Qdrant
  const up = await isQdrantAvailable(client)
  if (!up) {
    console.log("[sync] Ensuring collection exists...")
    await ensureCollection(client)
  }
  console.log(
    `[sync] Qdrant OK at ${client.baseUrl}, collection: ${client.collectionName}`,
  )

  if (DRY_RUN) {
    console.log(`[sync] DRY RUN — would upsert ${active.length} points`)
    return
  }

  // Process in batches
  let totalUpserted = 0
  for (let i = 0; i < active.length; i += BATCH_SIZE) {
    const batch = active.slice(i, i + BATCH_SIZE)
    const texts = batch.map((e) => e.content)

    console.log(
      `[sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: embedding ${batch.length} entries...`,
    )
    const embeddings = await batchEmbed(texts, OLLAMA_URL)

    if (!embeddings || embeddings.length !== batch.length) {
      console.error(
        `[sync] Embedding failed for batch starting at index ${i} — skipping`,
      )
      continue
    }

    const points: QdrantPoint[] = batch.map((entry, idx) => ({
      id: entry.id,
      vector: embeddings[idx],
      payload: entryToPayload(entry),
    }))

    await upsertPoints(client, points)
    totalUpserted += points.length
    console.log(`[sync] Upserted ${totalUpserted}/${active.length}`)
  }

  console.log(`[sync] Done. ${totalUpserted} points in Qdrant.`)
}

function entryToPayload(entry: KnowledgeEntry): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: entry.type,
    content: entry.content,
    confidence: entry.confidence,
    source: entry.source,
    extractedAt: entry.extractedAt,
  }
  if (entry.entities && entry.entities.length > 0) {
    payload.entities = entry.entities
  }
  if (entry.about) {
    payload.about_entity = entry.about.entity
    payload.about_type = entry.about.type
  }
  if (entry.evidence) {
    payload.evidence = entry.evidence
  }
  return payload
}

main().catch((err) => {
  console.error("[sync] Fatal:", err)
  process.exit(1)
})
