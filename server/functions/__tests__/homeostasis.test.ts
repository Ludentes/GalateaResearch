import { describe, it, expect, beforeEach, vi } from "vitest"
import { getHomeostasisStateLogic } from "../homeostasis.logic"
import { db } from "../../db"

// Mock database
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
  },
}))

describe("getHomeostasisStateLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns latest homeostasis state for session", async () => {
    const mockState = {
      id: "test-id",
      sessionId: "session-123",
      messageId: "msg-123",
      knowledgeSufficiency: "HEALTHY",
      certaintyAlignment: "HIGH",
      progressMomentum: "LOW",
      communicationHealth: "HEALTHY",
      productiveEngagement: "HEALTHY",
      knowledgeApplication: "LOW",
      assessmentMethod: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
      },
      assessedAt: new Date("2026-02-07T12:00:00Z"),
      createdAt: new Date("2026-02-07T12:00:00Z"),
    }

    const mockQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockState]),
    }

    vi.mocked(db.select).mockReturnValue(mockQuery as any)

    const result = await getHomeostasisStateLogic("session-123")

    expect(result).toEqual({
      id: "test-id",
      sessionId: "session-123",
      messageId: "msg-123",
      dimensions: {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HIGH",
        progress_momentum: "LOW",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "LOW",
      },
      assessmentMethod: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
      },
      assessedAt: "2026-02-07T12:00:00.000Z",
    })
  })

  it("returns null when no homeostasis state exists", async () => {
    const mockQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(db.select).mockReturnValue(mockQuery as any)

    const result = await getHomeostasisStateLogic("session-123")

    expect(result).toBeNull()
  })
})
