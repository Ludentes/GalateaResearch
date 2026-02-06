import { defineEventHandler, getQuery } from "h3"
import { searchFacts } from "../../../memory/graphiti-client"

export default defineEventHandler(async (event) => {
  const { query, group_ids, max_facts } = getQuery(event) as {
    query?: string
    group_ids?: string
    max_facts?: string
  }

  if (!query) {
    return { facts: [] }
  }

  // Pass empty array to let searchFacts handle the group_ids logic
  const groupIds = group_ids ? group_ids.split(",").filter(Boolean) : []
  const maxFacts = max_facts ? Number.parseInt(max_facts, 10) : 20

  const facts = await searchFacts(query, groupIds, maxFacts)
  return { facts }
})
