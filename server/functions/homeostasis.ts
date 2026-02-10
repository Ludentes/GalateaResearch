import { createServerFn } from "@tanstack/react-start"
import { getHomeostasisStateLogic } from "./homeostasis.logic"

/**
 * Get latest homeostasis state for a session.
 * Returns null if no state exists (404 equivalent).
 */
export const getHomeostasisState = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => {
    if (!input.sessionId || input.sessionId.trim() === "") {
      throw new Error("sessionId is required")
    }
    return input
  })
  .handler(async ({ data }) => {
    return getHomeostasisStateLogic(data.sessionId)
  })
