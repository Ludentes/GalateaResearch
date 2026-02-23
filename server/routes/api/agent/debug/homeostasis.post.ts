import { createError, defineEventHandler, readBody } from "h3"
import { updateCache } from "../../../../engine/homeostasis-engine"
import type { Dimension, DimensionState } from "../../../../engine/types"

const VALID_DIMENSIONS: Dimension[] = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
]

const VALID_STATES: DimensionState[] = ["LOW", "HEALTHY", "HIGH"]

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    dimension?: string
    state?: string
  }

  if (
    !body.dimension ||
    !VALID_DIMENSIONS.includes(body.dimension as Dimension)
  ) {
    throw createError({
      statusCode: 400,
      message: `Invalid dimension. Valid: ${VALID_DIMENSIONS.join(", ")}`,
    })
  }
  if (!body.state || !VALID_STATES.includes(body.state as DimensionState)) {
    throw createError({
      statusCode: 400,
      message: `Invalid state. Valid: ${VALID_STATES.join(", ")}`,
    })
  }

  updateCache(
    body.dimension as Dimension,
    "debug",
    body.state as DimensionState,
  )

  return { updated: true, dimension: body.dimension, state: body.state }
})
