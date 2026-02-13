// @vitest-environment node
/**
 * Cognitive Model Tests — Using Real Umka Project Data
 *
 * Tests that KnowledgeEntry.about field enables cognitive model construction
 * (User Model, Domain Model, etc.) as views over the knowledge store.
 *
 * Test data derived from actual Umka project extraction (259 entries from
 * session:64d737f3). See: data/memory/entries.jsonl
 *
 * These tests serve dual purpose:
 * 1. Verify store mechanics (about field persists, filters work)
 * 2. Define expected subject classifications for Umka data (evaluation spec)
 */

import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  appendEntries,
  distinctEntities,
  entriesByEntity,
  entriesBySubjectType,
  readEntries,
} from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-cognitive")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")

// ============ Real Umka Data (with expected `about` tags) ============
// These are actual entries from the Umka extraction, annotated with the
// `about` field that a correct extraction should produce.

const umkaEntries: KnowledgeEntry[] = [
  // --- User-scoped: Alina (stakeholder) ---
  {
    id: "umka-alina-1",
    type: "fact",
    content:
      "Stakeholder (Alina) lacks understanding of technical IoT concepts like IoTController and ModBus.",
    confidence: 1,
    entities: ["IoTController", "ModBus"],
    evidence: "Alina does not know what is IoTController, ModBus.",
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:06:06.023Z",
    about: { entity: "alina", type: "user" },
  },
  {
    id: "umka-alina-2",
    type: "decision",
    content:
      "Presentation for Alina has been updated with simplified technical details and electron-builder information.",
    confidence: 1,
    entities: ["presentation"],
    evidence:
      '[USER]: So she can present, but not really go into detail.',
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:07:03.205Z",
    about: { entity: "alina", type: "user" },
  },

  // --- Team-scoped ---
  {
    id: "umka-team-1",
    type: "fact",
    content:
      "The team speaks Russian, so all documentation should be in Russian.",
    confidence: 1,
    entities: ["Team Language"],
    evidence:
      '"Most the team speaks Russian so let\'s do all docs in Russia for them."',
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:22:16.455Z",
    about: { entity: "umka-team", type: "team" },
  },

  // --- Project-scoped (default — about omitted or explicit) ---
  {
    id: "umka-proj-1",
    type: "preference",
    content: "Package Manager: Use `pnpm`.",
    confidence: 1,
    entities: ["Package Manager"],
    evidence: 'User said: "1. Let\'s document that we prefer pnpm."',
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:08:18.387Z",
    // about omitted → project default
  },
  {
    id: "umka-proj-2",
    type: "decision",
    content:
      "The ContentPackage collection has a 1:1 relationship with Kiosks (not M:N).",
    confidence: 1,
    entities: ["ContentPackage", "Kiosk"],
    evidence: "[USER]: Change to 1:1",
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:07:03.205Z",
    // about omitted → project default
  },
  {
    id: "umka-proj-3",
    type: "preference",
    content:
      "The admin panel interface must be in Russian (MVP scope).",
    confidence: 1,
    entities: [],
    evidence:
      "[USER]: Item 1: Интерфейс админ-панели должен быть на русском... This is MVP scope.",
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:11:06.425Z",
    about: { entity: "umka", type: "project" },
  },

  // --- Domain-scoped ---
  {
    id: "umka-domain-1",
    type: "rule",
    content:
      "The Payload CMS MQTT client must persist its connection state across Next.js hot reloads.",
    confidence: 1,
    entities: ["Payload CMS", "MQTT", "Next.js"],
    evidence:
      "MQTT connection drops during Next.js HMR, must survive hot reload",
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:09:36.826Z",
    about: { entity: "payload-cms", type: "domain" },
  },

  // --- User-scoped: the developer (self-referencing preferences) ---
  {
    id: "umka-dev-1",
    type: "preference",
    content:
      "Development workflow: Infrastructure is managed via Docker Compose, while application logic is run locally using `pnpm dev`.",
    confidence: 1,
    entities: [],
    evidence:
      "I typically only ran infra from docker and everything else as pnpm dev.",
    source: "session:64d737f3",
    extractedAt: "2026-02-11T21:21:06.564Z",
    about: { entity: "developer", type: "user" },
  },
]

describe("Cognitive Model Queries", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  // --- Store mechanics: about field persists ---

  it("persists about field through write/read cycle", async () => {
    await appendEntries(umkaEntries, TEST_STORE)
    const entries = await readEntries(TEST_STORE)

    const alina = entries.find((e) => e.id === "umka-alina-1")
    expect(alina?.about).toEqual({ entity: "alina", type: "user" })

    const team = entries.find((e) => e.id === "umka-team-1")
    expect(team?.about).toEqual({ entity: "umka-team", type: "team" })

    const proj = entries.find((e) => e.id === "umka-proj-1")
    expect(proj?.about).toBeUndefined() // project default = omitted
  })

  // --- User Model queries ---

  it("builds User Model view: all entries about a specific user", () => {
    const alinaModel = entriesByEntity(umkaEntries, "alina")
    expect(alinaModel).toHaveLength(2)
    expect(alinaModel.every((e) => e.about?.entity === "alina")).toBe(true)
    expect(alinaModel[0].content).toContain("lacks understanding")
    expect(alinaModel[1].content).toContain("Presentation for Alina")
  })

  it("builds User Model view: all user-type entries across people", () => {
    const allUsers = entriesBySubjectType(umkaEntries, "user")
    expect(allUsers).toHaveLength(3) // 2 alina + 1 developer
    expect(allUsers.map((e) => e.about?.entity)).toContain("alina")
    expect(allUsers.map((e) => e.about?.entity)).toContain("developer")
  })

  // --- Team Model queries ---

  it("builds Team Model view", () => {
    const teamModel = entriesBySubjectType(umkaEntries, "team")
    expect(teamModel).toHaveLength(1)
    expect(teamModel[0].content).toContain("team speaks Russian")
  })

  // --- Project Model queries (default) ---

  it("treats entries without about as project-scoped", () => {
    const projectModel = entriesBySubjectType(umkaEntries, "project")
    // umka-proj-1 (no about), umka-proj-2 (no about), umka-proj-3 (explicit project)
    expect(projectModel).toHaveLength(3)
    expect(projectModel.map((e) => e.id)).toContain("umka-proj-1")
    expect(projectModel.map((e) => e.id)).toContain("umka-proj-2")
    expect(projectModel.map((e) => e.id)).toContain("umka-proj-3")
  })

  // --- Domain Model queries ---

  it("builds Domain Model view", () => {
    const domainModel = entriesBySubjectType(umkaEntries, "domain")
    expect(domainModel).toHaveLength(1)
    expect(domainModel[0].content).toContain("MQTT client must persist")
  })

  // --- Entity discovery ---

  it("discovers all known entities", () => {
    const all = distinctEntities(umkaEntries)
    expect(all).toEqual([
      "alina",
      "developer",
      "payload-cms",
      "umka",
      "umka-team",
    ])
  })

  it("discovers entities filtered by type", () => {
    const users = distinctEntities(umkaEntries, "user")
    expect(users).toEqual(["alina", "developer"])

    const teams = distinctEntities(umkaEntries, "team")
    expect(teams).toEqual(["umka-team"])
  })

  // --- Case insensitivity ---

  it("entity lookup is case-insensitive", () => {
    const result = entriesByEntity(umkaEntries, "ALINA")
    expect(result).toHaveLength(2)
  })
})

describe("Umka Subject Classification Spec", () => {
  // These tests define EXPECTED subject classifications for real Umka data.
  // They serve as the evaluation spec for the extraction prompt.
  // When running re-extraction with the updated prompt, compare results
  // against these expectations.

  it("classifies person-specific knowledge as user-scoped", () => {
    // "Alina lacks understanding..." should be about Alina specifically
    const entry = umkaEntries.find((e) => e.id === "umka-alina-1")!
    expect(entry.about?.type).toBe("user")
    expect(entry.about?.entity).toBe("alina")
  })

  it("classifies team dynamics as team-scoped", () => {
    // "Team speaks Russian" is about the team, not a specific person
    const entry = umkaEntries.find((e) => e.id === "umka-team-1")!
    expect(entry.about?.type).toBe("team")
  })

  it("classifies tool preferences without person as project-scoped", () => {
    // "Package Manager: Use pnpm" — no specific person, project default
    const entry = umkaEntries.find((e) => e.id === "umka-proj-1")!
    expect(entry.about).toBeUndefined()
  })

  it("classifies developer self-references as user-scoped", () => {
    // "I typically only ran infra from docker" — first person = developer
    const entry = umkaEntries.find((e) => e.id === "umka-dev-1")!
    expect(entry.about?.type).toBe("user")
    expect(entry.about?.entity).toBe("developer")
  })

  it("classifies technology-specific rules as domain-scoped", () => {
    // "Payload CMS MQTT client must persist..." — domain-specific constraint
    const entry = umkaEntries.find((e) => e.id === "umka-domain-1")!
    expect(entry.about?.type).toBe("domain")
    expect(entry.about?.entity).toBe("payload-cms")
  })

  it("classifies codebase architectural decisions as project-scoped", () => {
    // "ContentPackage has 1:1 relationship with Kiosks" — project architecture
    const entry = umkaEntries.find((e) => e.id === "umka-proj-2")!
    expect(entry.about).toBeUndefined() // project default
  })
})
