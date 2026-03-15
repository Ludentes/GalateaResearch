// @vitest-environment node
import { describe, expect, it } from "vitest"
import { formatDuration } from "../utils"

describe("formatDuration", () => {
  it("returns 0ms for zero milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms")
  })

  it("formats seconds only", () => {
    expect(formatDuration(45000)).toBe("45s")
  })

  it("formats minutes and seconds", () => {
    expect(formatDuration(150000)).toBe("2m 30s")
  })

  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(3930000)).toBe("1h 5m 30s")
  })

  it("formats hours and minutes", () => {
    expect(formatDuration(3900000)).toBe("1h 5m")
  })

  it("formats very small durations less than 1 second", () => {
    expect(formatDuration(500)).toBe("500ms")
  })

  it("formats durations with only milliseconds", () => {
    expect(formatDuration(100)).toBe("100ms")
  })

  it("formats hours only", () => {
    expect(formatDuration(3600000)).toBe("1h")
  })

  it("formats large durations", () => {
    expect(formatDuration(7325000)).toBe("2h 2m 5s")
  })

  it("omits zero components", () => {
    expect(formatDuration(65000)).toBe("1m 5s")
  })
})
