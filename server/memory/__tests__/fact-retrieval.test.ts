// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { retrieveRelevantFacts } from "../fact-retrieval"
import { appendEntries } from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-retrieval")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")

const mqttFact: KnowledgeEntry = {
  id: "mqtt-1",
  type: "fact",
  content: "MQTT client uses QoS 1 for reliability",
  confidence: 0.9,
  entities: ["mqtt", "umka"],
  about: { entity: "umka", type: "project" },
  source: "session:abc",
  extractedAt: "2026-02-11T10:00:00Z",
}

const mqttFact2: KnowledgeEntry = {
  id: "mqtt-2",
  type: "fact",
  content: "MQTT broker runs on port 1883",
  confidence: 0.85,
  entities: ["mqtt"],
  about: { entity: "umka", type: "project" },
  source: "session:abc",
  extractedAt: "2026-02-11T10:01:00Z",
}

const alinaEntry: KnowledgeEntry = {
  id: "alina-1",
  type: "preference",
  content: "Alina prefers status updates in Russian",
  confidence: 0.95,
  entities: ["alina"],
  about: { entity: "alina", type: "user" },
  source: "session:def",
  extractedAt: "2026-02-11T11:00:00Z",
}

const domainEntry: KnowledgeEntry = {
  id: "domain-1",
  type: "fact",
  content: "TypeScript strict mode catches null reference errors at compile time",
  confidence: 0.8,
  entities: [],
  about: { entity: "typescript", type: "domain" },
  source: "session:ghi",
  extractedAt: "2026-02-11T12:00:00Z",
}

const supersededEntry: KnowledgeEntry = {
  id: "old-1",
  type: "fact",
  content: "MQTT uses QoS 0",
  confidence: 0.7,
  entities: ["mqtt"],
  about: { entity: "umka", type: "project" },
  source: "session:abc",
  extractedAt: "2026-02-11T09:00:00Z",
  supersededBy: "mqtt-1",
}

const allEntries = [mqttFact, mqttFact2, alinaEntry, domainEntry, supersededEntry]

describe("Fact Retrieval", () => {
  beforeEach(async () => {
    await appendEntries(allEntries, TEST_STORE)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("retrieves entries matching entity in message", async () => {
    const result = await retrieveRelevantFacts(
      "The MQTT client needs to persist",
      TEST_STORE,
    )
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.matchedEntities).toContain("mqtt")
  })

  it("retrieves entries via about.entity match", async () => {
    const result = await retrieveRelevantFacts(
      "What's the status of Umka?",
      TEST_STORE,
    )
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.matchedEntities).toContain("umka")
    const umkaEntries = result.entries.filter(
      (e) => e.about?.entity === "umka",
    )
    expect(umkaEntries.length).toBeGreaterThan(0)
  })

  it("does not retrieve unrelated entities", async () => {
    const result = await retrieveRelevantFacts(
      "The MQTT client needs to persist",
      TEST_STORE,
    )
    const alinaEntries = result.entries.filter(
      (e) => e.about?.entity === "alina",
    )
    expect(alinaEntries).toHaveLength(0)
  })

  it("filters out superseded entries", async () => {
    const result = await retrieveRelevantFacts(
      "MQTT client configuration",
      TEST_STORE,
    )
    const superseded = result.entries.filter((e) => e.id === "old-1")
    expect(superseded).toHaveLength(0)
  })

  it("includes domain-tagged entries matching keywords", async () => {
    const result = await retrieveRelevantFacts(
      "How should I handle TypeScript strict mode for null checks?",
      TEST_STORE,
    )
    const domainEntries = result.entries.filter(
      (e) => e.about?.type === "domain",
    )
    expect(domainEntries.length).toBeGreaterThan(0)
  })

  it("sorts by confidence descending", async () => {
    const result = await retrieveRelevantFacts("MQTT client", TEST_STORE)
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i].confidence).toBeLessThanOrEqual(
        result.entries[i - 1].confidence,
      )
    }
  })

  it("respects maxEntries limit", async () => {
    const result = await retrieveRelevantFacts("MQTT umka", TEST_STORE, {
      maxEntries: 1,
    })
    expect(result.entries.length).toBeLessThanOrEqual(1)
  })

  it("returns empty for message with no entity matches", async () => {
    const result = await retrieveRelevantFacts(
      "Hello, how are you?",
      TEST_STORE,
    )
    expect(result.entries).toHaveLength(0)
    expect(result.matchedEntities).toHaveLength(0)
  })

  it("returns empty for non-existent store", async () => {
    const result = await retrieveRelevantFacts(
      "MQTT test",
      "/tmp/nonexistent-store.jsonl",
    )
    expect(result.entries).toHaveLength(0)
  })
})
