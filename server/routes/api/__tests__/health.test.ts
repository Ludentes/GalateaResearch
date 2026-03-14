import { describe, it, expect, beforeAll } from "vitest"
import { formatUptime } from "../../../utils/startup-time"

describe("health check endpoint", () => {
  describe("formatUptime", () => {
    it("should format uptime in seconds", () => {
      expect(formatUptime(5000)).toBe("5s")
      expect(formatUptime(45000)).toBe("45s")
    })

    it("should format uptime in minutes", () => {
      expect(formatUptime(60000)).toBe("1m 0s")
      expect(formatUptime(125000)).toBe("2m 5s")
    })

    it("should format uptime in hours", () => {
      expect(formatUptime(3600000)).toBe("1h 0m 0s")
      expect(formatUptime(5425000)).toBe("1h 30m 25s")
    })

    it("should format uptime in days", () => {
      expect(formatUptime(86400000)).toBe("1d 0h 0m")
      expect(formatUptime(172800000)).toBe("2d 0h 0m")
      expect(formatUptime(90061000)).toBe("1d 1h 1m")
    })

    it("should handle edge cases", () => {
      expect(formatUptime(0)).toBe("0s")
      expect(formatUptime(1000)).toBe("1s")
    })
  })
})
