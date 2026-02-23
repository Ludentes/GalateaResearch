import { defineEventHandler } from "h3"
import { loadConfig } from "../../../engine/config"

export default defineEventHandler(() => {
  const config = loadConfig()
  return { config }
})
