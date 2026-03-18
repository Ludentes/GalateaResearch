import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentDefaultSpec } from "../../../agent/agent-spec"
import { runExtraction } from "../../../memory/extraction-pipeline"
import { getTickRecordPath } from "../../../observation/tick-record"

interface ExtractBody {
  agentId?: string
  /** Force re-extraction even if already extracted */
  force?: boolean
}

/**
 * Run the knowledge extraction pipeline on an agent's tick records.
 *
 * POST /api/agent/knowledge-extract { agentId: "beki" }
 *
 * Reads the agent's tick record JSONL, extracts knowledge entries,
 * and appends them to the agent's knowledge store.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as ExtractBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const agentId = body.agentId

  let storePath = "data/memory/entries.jsonl"
  try {
    const spec = await loadAgentDefaultSpec(agentId)
    if (spec.knowledge_store) storePath = spec.knowledge_store
  } catch {
    // Use default
  }

  const transcriptPath = getTickRecordPath(agentId)

  const result = await runExtraction({
    transcriptPath,
    storePath,
    force: body.force ?? false,
  })

  return {
    ok: true,
    agentId,
    stats: result.stats,
    entriesExtracted: result.entries.length,
  }
})
