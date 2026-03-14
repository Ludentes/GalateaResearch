// Module-level variable to track when the server started
const serverStartTime = Date.now()

export function getServerUptime() {
  return Date.now() - serverStartTime
}

export function getServerStartTime() {
  return new Date(serverStartTime)
}

export function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
