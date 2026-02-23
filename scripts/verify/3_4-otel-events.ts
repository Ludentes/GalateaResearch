import { emitEvent } from "../../server/observation/emit"
import { readEvents } from "../../server/observation/event-store"
import { rmSync } from "fs"

const storePath = "/tmp/galatea-otel-test/events.jsonl"

await emitEvent({
  type: "log",
  source: "galatea-api",
  body: "chat.response_delivered",
  attributes: { "event.name": "chat.response_delivered", "session.id": "test-123", model: "test" },
}, storePath)

await emitEvent({
  type: "log",
  source: "galatea-api",
  body: "extraction.complete",
  attributes: { "event.name": "extraction.complete", "entries.count": 5 },
}, storePath)

const events = await readEvents(storePath)
console.log("Events written:", events.length)
for (const e of events) {
  console.log("  -", e.attributes["event.name"], "| id:", e.id?.slice(0, 8), "| timestamp:", e.timestamp)
}

rmSync("/tmp/galatea-otel-test", { recursive: true })
process.exit(0)
