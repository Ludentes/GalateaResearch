/**
 * Observation types — OTEL event storage
 *
 * Stores ObservationEvent records from OTEL Collector.
 * File-based JSONL storage (YAGNI approach for Phase C).
 */

export interface ObservationEvent {
  id: string
  timestamp: string // ISO 8601
  type: "log" | "trace" | "metric"
  source: string // e.g. "claude-code", "galatea-api"
  attributes: Record<string, unknown>
  body?: string
  traceId?: string
  spanId?: string
}

export interface EventStoreStats {
  totalEvents: number
  eventsByType: Record<string, number>
  eventsBySource: Record<string, number>
}
