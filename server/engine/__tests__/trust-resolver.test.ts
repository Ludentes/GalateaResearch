// @vitest-environment node
import { describe, expect, it } from "vitest"
import { resolveTrust } from "../trust-resolver"

const TRUST_CONFIG = {
  identities: [
    { entity: "sasha", level: "full" as const },
    { entity: "denis", level: "high" as const },
    { entity: "alina", level: "medium" as const },
  ],
  channels: {
    dashboard: "full" as const,
    discord: "high" as const,
    gitlab: "medium" as const,
  },
  default_identity_trust: "none" as const,
}

describe("resolveTrust", () => {
  it("full identity + full channel → ABSOLUTE", () => {
    expect(resolveTrust(TRUST_CONFIG, "dashboard", "sasha")).toBe("ABSOLUTE")
  })

  it("full identity + high channel → HIGH (channel caps)", () => {
    expect(resolveTrust(TRUST_CONFIG, "discord", "sasha")).toBe("HIGH")
  })

  it("high identity + medium channel → MEDIUM (min)", () => {
    expect(resolveTrust(TRUST_CONFIG, "gitlab", "denis")).toBe("MEDIUM")
  })

  it("unknown identity uses default_identity_trust", () => {
    expect(resolveTrust(TRUST_CONFIG, "discord", "stranger")).toBe("NONE")
  })

  it("unknown channel → NONE regardless of identity", () => {
    expect(resolveTrust(TRUST_CONFIG, "telegram", "sasha")).toBe("NONE")
  })

  it("medium identity + high channel → MEDIUM (identity caps)", () => {
    expect(resolveTrust(TRUST_CONFIG, "discord", "alina")).toBe("MEDIUM")
  })

  it("high identity + high channel → HIGH", () => {
    expect(resolveTrust(TRUST_CONFIG, "discord", "denis")).toBe("HIGH")
  })
})
