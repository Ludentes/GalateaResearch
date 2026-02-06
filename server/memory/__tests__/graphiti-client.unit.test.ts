// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(status: number, body = "") {
  return new Response(body, { status })
}

describe("graphiti-client", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.GRAPHITI_URL = "http://graphiti-test:18000"
  })

  afterEach(() => {
    delete process.env.GRAPHITI_URL
    vi.resetModules()
  })

  describe("isHealthy", () => {
    it("returns true when sidecar responds with healthy status", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: "healthy" }),
      )
      const { isHealthy } = await import("../graphiti-client")
      expect(await isHealthy()).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        "http://graphiti-test:18000/healthcheck",
        expect.objectContaining({ headers: expect.any(Object) }),
      )
    })

    it("returns false when sidecar is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
      const { isHealthy } = await import("../graphiti-client")
      expect(await isHealthy()).toBe(false)
    })

    it("returns false on non-200 status", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500))
      const { isHealthy } = await import("../graphiti-client")
      expect(await isHealthy()).toBe(false)
    })
  })

  describe("ingestMessages", () => {
    it("sends messages and returns true on success", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Messages added for processing" }, 202),
      )
      const { ingestMessages } = await import("../graphiti-client")
      const result = await ingestMessages("session-123", [
        {
          content: "I prefer dark mode",
          role_type: "user",
          role: "user",
          name: "msg-1",
          source_description: "chat",
        },
      ])
      expect(result).toBe(true)

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe("http://graphiti-test:18000/messages")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body)
      expect(body.group_id).toBe("session-123")
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].content).toBe("I prefer dark mode")
    })

    it("returns false on network error (graceful degradation)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
      const { ingestMessages } = await import("../graphiti-client")
      const result = await ingestMessages("session-123", [])
      expect(result).toBe(false)
    })
  })

  describe("searchFacts", () => {
    it("returns facts on successful search", async () => {
      const facts = [
        {
          uuid: "abc-123",
          name: "PREFERS",
          fact: "User prefers dark mode",
          valid_at: null,
          invalid_at: null,
          created_at: "2026-02-05T00:00:00Z",
          expired_at: null,
        },
      ]
      mockFetch.mockResolvedValueOnce(jsonResponse({ facts }))
      const { searchFacts } = await import("../graphiti-client")
      const result = await searchFacts("dark mode", ["session-123"])
      expect(result).toHaveLength(1)
      expect(result[0].fact).toBe("User prefers dark mode")

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.query).toBe("dark mode")
      expect(body.group_ids).toEqual(["session-123"])
      expect(body.max_facts).toBe(20)  // maxFacts * 2 for client-side filtering
    })

    it("returns empty array on failure (graceful degradation)", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, "Internal error"))
      const { searchFacts } = await import("../graphiti-client")
      const result = await searchFacts("query", ["session-123"])
      expect(result).toEqual([])
    })

    it("passes custom maxFacts", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ facts: [] }))
      const { searchFacts } = await import("../graphiti-client")
      await searchFacts("query", ["s1", "s2"], 5)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.max_facts).toBe(10)  // maxFacts * 2 for client-side filtering
      expect(body.group_ids).toEqual(["s1", "s2"])
    })
  })

  describe("getMemory", () => {
    it("returns facts for context-aware retrieval", async () => {
      const facts = [
        {
          uuid: "xyz-456",
          name: "USES",
          fact: "User uses Vim keybindings",
          valid_at: null,
          invalid_at: null,
          created_at: "2026-02-05T00:00:00Z",
          expired_at: null,
        },
      ]
      mockFetch.mockResolvedValueOnce(jsonResponse({ facts }))
      const { getMemory } = await import("../graphiti-client")
      const result = await getMemory("session-123", [
        { role: "user", content: "What editor do I use?" },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].fact).toBe("User uses Vim keybindings")

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.group_id).toBe("session-123")
      expect(body.messages[0].role_type).toBe("user")
      expect(body.center_node_uuid).toBeNull()
    })

    it("returns empty array on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("timeout"))
      const { getMemory } = await import("../graphiti-client")
      const result = await getMemory("session-123", [])
      expect(result).toEqual([])
    })
  })

  describe("getEpisodes", () => {
    it("returns episodes for a group", async () => {
      const episodes = [
        {
          uuid: "ep-001",
          name: "msg-1707091200-user",
          group_id: "session-123",
          content: "I prefer dark mode",
          source: "message",
          source_description: "session:session-123",
          created_at: "2026-02-05T12:00:00Z",
          valid_at: "2026-02-05T12:00:00Z",
          entity_edges: ["edge-1", "edge-2"],
        },
      ]
      mockFetch.mockResolvedValueOnce(jsonResponse(episodes))
      const { getEpisodes } = await import("../graphiti-client")
      const result = await getEpisodes("session-123", 10)
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe("I prefer dark mode")
      expect(result[0].entity_edges).toEqual(["edge-1", "edge-2"])

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(
        "http://graphiti-test:18000/episodes/session-123?last_n=10",
      )
    })

    it("returns empty array on failure (graceful degradation)", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500))
      const { getEpisodes } = await import("../graphiti-client")
      const result = await getEpisodes("session-123")
      expect(result).toEqual([])
    })

    it("uses default lastN of 20", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      const { getEpisodes } = await import("../graphiti-client")
      await getEpisodes("session-123")
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain("last_n=20")
    })

    it("URL-encodes the group ID", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      const { getEpisodes } = await import("../graphiti-client")
      await getEpisodes("session/with spaces")
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain("episodes/session%2Fwith%20spaces")
    })
  })

  describe("deleteGroup", () => {
    it("returns true on successful deletion", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Group deleted", success: true }),
      )
      const { deleteGroup } = await import("../graphiti-client")
      expect(await deleteGroup("session-123")).toBe(true)

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe("http://graphiti-test:18000/group/session-123")
      expect(init.method).toBe("DELETE")
    })

    it("returns false on failure", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404))
      const { deleteGroup } = await import("../graphiti-client")
      expect(await deleteGroup("nonexistent")).toBe(false)
    })
  })
})
