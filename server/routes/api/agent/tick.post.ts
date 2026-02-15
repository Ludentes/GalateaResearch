import { defineEventHandler } from "h3"
import { tick } from "../../../agent/tick"

export default defineEventHandler(async () => {
  const result = await tick("manual")
  return result
})
