import { defineEventHandler } from "h3"
import {
  getServerUptime,
  getServerStartTime,
  formatUptime,
} from "../../utils/startup-time"

export default defineEventHandler(() => {
  const uptimeMs = getServerUptime()
  const startTime = getServerStartTime()

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: {
      milliseconds: uptimeMs,
      formatted: formatUptime(uptimeMs),
    },
    server: {
      startTime: startTime.toISOString(),
      pid: process.pid,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    },
  }
})
