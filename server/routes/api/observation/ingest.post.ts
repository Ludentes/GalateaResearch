import { randomUUID } from "node:crypto"
import { defineEventHandler, readBody } from "h3"
import { appendEvents } from "../../../observation/event-store"
import type { ObservationEvent } from "../../../observation/types"

/**
 * POST /api/observation/ingest
 *
 * Receives OTLP/JSON payloads from OTEL Collector, parses them into
 * ObservationEvents, and stores them to data/observation/events.jsonl.
 */
export default defineEventHandler(async (event) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await readBody(event)) as any

  const events: ObservationEvent[] = []

  // Parse OTLP logs format
  // @ts-ignore - OTLP payload structure is complex and loosely typed
  if (body.resourceLogs) {
    for (const resourceLog of body.resourceLogs) {
      const source =
        resourceLog.resource?.attributes?.find(
          (a: { key: string }) => a.key === "service.name",
        )?.value?.stringValue || "unknown"

      for (const scopeLog of resourceLog.scopeLogs || []) {
        for (const logRecord of scopeLog.logRecords || []) {
          const attributes: Record<string, unknown> = {}

          // Extract attributes
          for (const attr of logRecord.attributes || []) {
            const value = attr.value?.stringValue ?? attr.value?.intValue ?? attr.value
            attributes[attr.key] = value
          }

          events.push({
            id: randomUUID(),
            timestamp: new Date(
              Number(logRecord.timeUnixNano) / 1_000_000,
            ).toISOString(),
            type: "log",
            source,
            attributes,
            body: logRecord.body?.stringValue,
          })
        }
      }
    }
  }

  // Parse OTLP traces format
  if (body.resourceSpans) {
    for (const resourceSpan of body.resourceSpans) {
      const source =
        resourceSpan.resource?.attributes?.find(
          (a: { key: string }) => a.key === "service.name",
        )?.value?.stringValue || "unknown"

      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          const attributes: Record<string, unknown> = {}

          for (const attr of span.attributes || []) {
            const value = attr.value?.stringValue ?? attr.value?.intValue ?? attr.value
            attributes[attr.key] = value
          }

          events.push({
            id: randomUUID(),
            timestamp: new Date(Number(span.startTimeUnixNano) / 1_000_000).toISOString(),
            type: "trace",
            source,
            attributes,
            body: span.name,
            traceId: span.traceId,
            spanId: span.spanId,
          })
        }
      }
    }
  }

  // Store events
  const storePath = "data/observation/events.jsonl"
  if (events.length > 0) {
    await appendEvents(storePath, events)
  }

  return {
    success: true,
    eventsReceived: events.length,
  }
})
