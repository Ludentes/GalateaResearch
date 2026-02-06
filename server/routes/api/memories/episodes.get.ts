import { defineEventHandler, getQuery } from "h3"
import { getEpisodes } from "../../../memory/graphiti-client"

export default defineEventHandler(async (event) => {
  const { group_id, last_n } = getQuery(event) as {
    group_id?: string
    last_n?: string
  }

  if (!group_id) {
    return { episodes: [] }
  }

  const lastN = last_n ? Number.parseInt(last_n, 10) : 20
  const episodes = await getEpisodes(group_id, lastN)
  return { episodes }
})
