import { defineEventHandler, HTTPError, readBody } from "h3"
import { readEntries, writeEntries } from "../../../../memory/knowledge-store"
import type { CurationStatus } from "../../../../memory/types"

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    ids?: string[]
    curationStatus?: CurationStatus
  }>(event)
  const { ids, curationStatus } = body ?? {}

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HTTPError("ids must be a non-empty array", { status: 400 })
  }

  if (!curationStatus || !["approved", "rejected"].includes(curationStatus)) {
    throw new HTTPError("curationStatus must be approved or rejected", {
      status: 400,
    })
  }

  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)

  const idSet = new Set(ids)
  let updated = 0

  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.curationStatus = curationStatus
      entry.curatedAt = new Date().toISOString()
      entry.curatedBy = "human"
      updated++
    }
  }

  if (updated === 0) {
    throw new HTTPError("No matching entries found", { status: 404 })
  }

  await writeEntries(entries, storePath)

  return { ok: true, updated }
})
