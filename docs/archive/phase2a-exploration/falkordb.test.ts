import { afterAll, describe, expect, it } from "vitest"
import { closeFalkorDB, getGraph } from "../falkordb"

describe("FalkorDB Connection", () => {
  afterAll(async () => {
    await closeFalkorDB()
  })

  it("connects and creates a test node", async () => {
    const graph = await getGraph("galatea_test")

    await graph.query("CREATE (n:TestNode {name: $name, created: $created})", {
      params: { name: "smoke-test", created: Date.now() },
    })

    const result = await graph.query(
      "MATCH (n:TestNode {name: 'smoke-test'}) RETURN n.name AS name",
    )

    expect(result.data?.length).toBeGreaterThan(0)
    expect((result.data?.[0] as Record<string, unknown>)?.name).toBe(
      "smoke-test",
    )

    await graph.query("MATCH (n:TestNode) DELETE n")
  })

  it("creates and queries edges between nodes", async () => {
    const graph = await getGraph("galatea_test")

    await graph.query(
      "CREATE (a:Memory {type: 'fact', content: 'Prefer Clerk'})-[:RELATED_TO]->(b:Memory {type: 'preference', content: 'Auth library'})",
    )

    const result = await graph.query(
      "MATCH (a:Memory)-[:RELATED_TO]->(b:Memory) RETURN a.content AS from_content, b.content AS to_content",
    )

    expect(result.data?.length).toBe(1)
    expect((result.data?.[0] as Record<string, unknown>)?.from_content).toBe(
      "Prefer Clerk",
    )

    await graph.query("MATCH (n:Memory) DETACH DELETE n")
  })
})
