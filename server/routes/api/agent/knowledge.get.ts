import { defineEventHandler, getQuery } from "h3"
import { distinctEntities, readEntries } from "../../../memory/knowledge-store"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)

  let filtered = entries

  // Filter by type
  if (query.type) {
    filtered = filtered.filter((e) => e.type === query.type)
  }

  // Filter by entity
  if (query.entity) {
    const entity = String(query.entity).toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.about?.entity?.toLowerCase() === entity ||
        e.entities?.some((ent) => ent.toLowerCase() === entity) ||
        e.content.toLowerCase().includes(entity),
    )
  }

  // Search text
  if (query.search) {
    const search = String(query.search).toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.content.toLowerCase().includes(search) ||
        e.entities?.some((ent) => ent.toLowerCase().includes(search)),
    )
  }

  // Filter by curation status
  if (query.curationStatus) {
    filtered = filtered.filter((e) => e.curationStatus === query.curationStatus)
  }

  // Filter by target channel
  if (query.targetChannel) {
    filtered = filtered.filter(
      (e) =>
        e.targetOverride === query.targetChannel ||
        e.targetChannel === query.targetChannel,
    )
  }

  // Hide superseded by default
  if (query.showSuperseded !== "true") {
    filtered = filtered.filter((e) => !e.supersededBy)
  }

  // Stats
  const allEntities = distinctEntities(entries)
  const stats = {
    total: entries.length,
    active: entries.filter((e) => !e.supersededBy).length,
    superseded: entries.filter((e) => e.supersededBy).length,
    byType: Object.fromEntries(
      ["fact", "preference", "rule", "procedure", "correction", "decision"].map(
        (t) => [
          t,
          entries.filter((e) => e.type === t && !e.supersededBy).length,
        ],
      ),
    ),
    byCuration: Object.fromEntries(
      ["pending", "approved", "rejected"].map((s) => [
        s,
        entries.filter((e) => e.curationStatus === s && !e.supersededBy).length,
      ]),
    ),
    entities: allEntities,
  }

  return { entries: filtered, stats }
})
