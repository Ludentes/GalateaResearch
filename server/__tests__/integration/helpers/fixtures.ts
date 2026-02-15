import type { KnowledgeEntry } from "../../../memory/types"

let counter = 0
function nextId(): string {
  return `test-${++counter}-${Date.now()}`
}

export function resetFixtureCounter(): void {
  counter = 0
}

export function fact(
  content: string,
  opts?: Partial<KnowledgeEntry>,
): KnowledgeEntry {
  return {
    id: nextId(),
    type: "fact",
    content,
    confidence: 0.85,
    entities: [],
    source: "test:fixture",
    extractedAt: new Date().toISOString(),
    ...opts,
  }
}

export function preference(
  content: string,
  opts?: Partial<KnowledgeEntry>,
): KnowledgeEntry {
  return {
    id: nextId(),
    type: "preference",
    content,
    confidence: 0.9,
    entities: [],
    source: "test:fixture",
    extractedAt: new Date().toISOString(),
    ...opts,
  }
}

export function procedure(
  content: string,
  opts?: Partial<KnowledgeEntry>,
): KnowledgeEntry {
  return {
    id: nextId(),
    type: "procedure",
    content,
    confidence: 0.8,
    entities: [],
    source: "test:fixture",
    extractedAt: new Date().toISOString(),
    ...opts,
  }
}

export function userModel(
  entity: string,
  traits: Record<string, string>,
): KnowledgeEntry[] {
  return Object.entries(traits).map(([key, value]) =>
    fact(`${entity}: ${key} — ${value}`, {
      entities: [entity],
      about: { entity: entity.toLowerCase(), type: "user" },
    }),
  )
}
