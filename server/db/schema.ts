import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// ============ Personas ============

export const personas = pgTable("personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  domain: text("domain").notNull(),
  thresholds: jsonb("thresholds").$type<{
    certaintyAlignment?: { context: string; value?: number }
    communicationHealth?: { context: string; intervalMinutes?: number }
    knowledgeApplication?: { context: string; maxResearchMinutes?: number }
  }>(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ============ Sessions ============

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  personaId: uuid("persona_id").references(() => personas.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at"),
})

// ============ Messages ============

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  activityLevel: integer("activity_level"),
  model: text("model"),
  tokenCount: integer("token_count"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ============ Preprompts ============

export const preprompts = pgTable("preprompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type", {
    enum: ["core", "persona", "hard_rule", "domain"],
  }).notNull(),
  content: text("content").notNull(),
  priority: integer("priority").default(0),
  active: boolean("active").default(true),
})

// v1 homeostasis_states table removed in v2 cleanup (2026-02-11).
// v2 homeostasis will be a Claude Code skill, not DB-backed.
