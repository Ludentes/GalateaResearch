import { createError, defineEventHandler, readBody } from "h3"
import { retrieveRelevantFacts } from "../../../memory/fact-retrieval"

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    query?: string
    entity?: string
  }

  if (!body.query) {
    throw createError({ statusCode: 400, message: "Required: query" })
  }

  const result = await retrieveRelevantFacts(
    body.query,
    "data/memory/entries.jsonl",
    {
      additionalEntities: body.entity ? [body.entity] : [],
      trace: true,
    },
  )

  return {
    entries: result.entries,
    matchedEntities: result.matchedEntities,
    trace: result.trace,
  }
})
