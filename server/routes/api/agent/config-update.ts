import { defineEventHandler, createError, readBody } from "h3"
import { getConfig, updateConfigRuntime } from "~/server/engine/config"
import { validateConfigUpdate } from "./config-validation"

export default defineEventHandler(async (event) => {
  if (event.node.req.method !== "POST") {
    throw createError({
      statusCode: 405,
      statusMessage: "Method Not Allowed",
    })
  }

  try {
    const body = await readBody(event)

    // Validate
    const validationError = validateConfigUpdate(body)
    if (validationError) {
      throw createError({
        statusCode: 400,
        statusMessage: validationError.message,
      })
    }

    // Apply runtime update (in-memory only, not persisted to disk)
    updateConfigRuntime(body)

    // Return updated config
    const updatedConfig = getConfig()
    return {
      success: true,
      message: "Config updated successfully",
      config: updatedConfig,
    }
  } catch (error: any) {
    console.error("Config update error:", error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to update config",
    })
  }
})
