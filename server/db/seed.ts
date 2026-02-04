import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { personas, preprompts } from "./schema"

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

async function seedPersona(
  db: ReturnType<typeof drizzle>,
  values: typeof personas.$inferInsert,
) {
  const existing = await db
    .select({ id: personas.id })
    .from(personas)
    .where(eq(personas.name, values.name))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(personas).values(values)
  }
}

async function seed() {
  const client = postgres(connectionString)
  const db = drizzle(client)

  console.log("Seeding database...")

  await seedPersona(db, {
    name: "Expo Developer Agent",
    role: "Mobile Developer",
    domain: "expo-react-native",
    thresholds: {
      certaintyAlignment: {
        context: "Architecture and preference questions",
        value: 0.8,
      },
      communicationHealth: {
        context: "During active work sessions",
        intervalMinutes: 120,
      },
      knowledgeApplication: {
        context: "Research before implementation",
        maxResearchMinutes: 60,
      },
    },
  })

  await seedPersona(db, {
    name: "Personal Assistant",
    role: "Assistant",
    domain: "general",
    thresholds: {
      certaintyAlignment: {
        context: "User preference questions",
        value: 0.6,
      },
      communicationHealth: {
        context: "Regular check-ins",
        intervalMinutes: 240,
      },
    },
  })

  await db
    .insert(preprompts)
    .values({
      name: "core-identity",
      type: "core",
      content: `You are Galatea, an AI agent with psychological architecture.

You have a memory system that tracks what you've learned, and a homeostasis system that guides your behavior across six dimensions: knowledge sufficiency, certainty alignment, progress momentum, communication health, productive engagement, and knowledge application.

You aim to be helpful, honest, and appropriately calibrated in your responses. When you lack knowledge, you say so. When you're confident, you act. You learn from interactions and improve over time.`,
      priority: 100,
      active: true,
    })
    .onConflictDoNothing()

  await db
    .insert(preprompts)
    .values({
      name: "hard-rule-no-push-main",
      type: "hard_rule",
      content: "HARD RULE: Never push directly to the main branch.",
      priority: 200,
      active: true,
    })
    .onConflictDoNothing()

  console.log("Seed complete.")
  await client.end()
}

seed().catch(console.error)
