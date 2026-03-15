import { defineEventHandler, HTTPError, readBody } from "h3"
import { readEntries, writeEntries } from "../../../memory/knowledge-store"
import type { CurationStatus } from "../../../memory/types"

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    curationStatus?: CurationStatus
    contentOverride?: string
    targetOverride?: "claude-md" | "skill" | "hook" | "none"
  }>(event)
  const { id, curationStatus, contentOverride, targetOverride } = body ?? {}

  if (!id) {
    throw new HTTPError("id is required", { status: 400 })
  }

  if (
    curationStatus &&
    !["pending", "approved", "rejected"].includes(curationStatus)
  ) {
    throw new HTTPError(
      "curationStatus must be pending, approved, or rejected",
      {
        status: 400,
      },
    )
  }

  if (
    targetOverride &&
    !["claude-md", "skill", "hook", "none"].includes(targetOverride)
  ) {
    throw new HTTPError(
      "targetOverride must be claude-md, skill, hook, or none",
      {
        status: 400,
      },
    )
  }

  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)

  const idx = entries.findIndex((e) => e.id === id)
  if (idx === -1) {
    throw new HTTPError(`Entry not found: ${id}`, { status: 404 })
  }

  const entry = entries[idx]

  if (curationStatus !== undefined) {
    entry.curationStatus = curationStatus
    entry.curatedAt = new Date().toISOString()
    entry.curatedBy = "human"
  }

  if (contentOverride !== undefined) {
    entry.contentOverride = contentOverride
  }

  if (targetOverride !== undefined) {
    entry.targetOverride = targetOverride
  }

  entries[idx] = entry
  await writeEntries(entries, storePath)

  return { ok: true, entry }
})
