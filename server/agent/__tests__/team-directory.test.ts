// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadTeamDirectory, resolveIdentity } from "../team-directory"

describe("Team Directory", () => {
  it("loads all teammates from directory", async () => {
    const team = await loadTeamDirectory()
    expect(team).toHaveLength(5)
    expect(team.map((t) => t.id)).toContain("kirill")
    expect(team.map((t) => t.id)).toContain("beki")
  })

  it("resolves Discord identity to teammate", async () => {
    const team = await loadTeamDirectory()
    const teammate = resolveIdentity(team, "discord", "kirill_dev")
    expect(teammate).toBeDefined()
    expect(teammate!.id).toBe("kirill")
    expect(teammate!.is_human).toBe(true)
  })

  it("returns undefined for unknown identity", async () => {
    const team = await loadTeamDirectory()
    const teammate = resolveIdentity(team, "discord", "unknown_user_42")
    expect(teammate).toBeUndefined()
  })

  it("resolves GitLab identity", async () => {
    const team = await loadTeamDirectory()
    const teammate = resolveIdentity(team, "gitlab", "sasha")
    expect(teammate).toBeDefined()
    expect(teammate!.id).toBe("sasha")
  })

  it("distinguishes humans from agents", async () => {
    const team = await loadTeamDirectory()
    const humans = team.filter((t) => t.is_human)
    const agents = team.filter((t) => !t.is_human)
    expect(humans).toHaveLength(3)
    expect(agents).toHaveLength(2)
  })

  it("sorts teammates alphabetically by id", async () => {
    const team = await loadTeamDirectory()
    const ids = team.map((t) => t.id)
    expect(ids).toEqual([...ids].sort())
  })

  it("loads teammate descriptions", async () => {
    const team = await loadTeamDirectory()
    const kirill = team.find((t) => t.id === "kirill")
    expect(kirill?.description).toContain("CTO")
    expect(kirill?.description).toContain("final decision maker")
  })
})
