import { defineEventHandler } from "h3"
import { isHealthy } from "../../../memory/graphiti-client"

export default defineEventHandler(async () => {
  const healthy = await isHealthy()
  return { healthy }
})
