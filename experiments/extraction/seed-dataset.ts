/**
 * seed-dataset.ts
 *
 * Reads gold-standard.jsonl and pushes each item to a Langfuse dataset.
 * Creates the dataset if it doesn't exist.
 *
 * Uses the Langfuse REST API directly (the Node SDK's batch ingestion
 * doesn't reliably create dataset items on all Langfuse versions).
 *
 * Usage: pnpm tsx experiments/extraction/seed-dataset.ts
 *
 * Requires LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL in .env
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { config } from "dotenv"
config({ override: true })

const DATASET_NAME = "extraction-gold-standard"
const GOLD_PATH = resolve(import.meta.dirname, "gold-standard.jsonl")

const BASE_URL = process.env.LANGFUSE_BASE_URL || "http://localhost:3000"
const AUTH = Buffer.from(
  `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`,
).toString("base64")

interface GoldItem {
  input: Array<{ role: string; content: string }>
  expected: {
    items: Array<{
      type: string
      content: string
      confidence: number
      entities: string[]
      about?: { entity: string; type: string }
    }>
  }
  _meta?: unknown
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/public${path}`, {
    method,
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Langfuse API ${method} ${path}: ${res.status} ${text}`)
  }
  return res.json()
}

async function main() {
  // Read gold standard
  const raw = await readFile(GOLD_PATH, "utf-8")
  const items: GoldItem[] = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))

  console.log(`[seed] Loaded ${items.length} gold-standard items`)

  // Create dataset (idempotent)
  try {
    await api("POST", "/v2/datasets", {
      name: DATASET_NAME,
      description:
        "Gold-standard extraction examples for evaluating knowledge extraction prompt quality",
    })
  } catch {
    // May already exist
  }
  console.log(`[seed] Dataset "${DATASET_NAME}" ready`)

  // Delete old items first
  let page = 1
  let deleted = 0
  while (true) {
    const resp = (await api("GET", `/dataset-items?datasetName=${DATASET_NAME}&limit=100&page=${page}`)) as {
      data: Array<{ id: string }>
      meta?: { totalPages?: number }
    }
    if (!resp.data || resp.data.length === 0) break
    for (const old of resp.data) {
      await api("DELETE", `/dataset-items/${old.id}`)
      deleted++
    }
    // Don't increment page since deleting shifts items
  }
  if (deleted > 0) {
    console.log(`[seed] Deleted ${deleted} old items`)
  }

  // Push items via REST API
  let created = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    await api("POST", "/dataset-items", {
      datasetName: DATASET_NAME,
      input: item.input,
      expectedOutput: item.expected,
      metadata: {
        index: i,
        expectedItemCount: item.expected.items.length,
      },
    })
    created++
    if (created % 10 === 0) {
      console.log(`[seed] Pushed ${created}/${items.length} items`)
    }
  }

  console.log(`[seed] Done — ${created} items pushed to "${DATASET_NAME}"`)
  console.log(`[seed] View at: ${BASE_URL}`)
}

main().catch(console.error)
