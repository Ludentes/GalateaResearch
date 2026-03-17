# Observation Pipeline Architecture

**Date**: 2026-02-06
**Status**: Design
**Purpose**: Define OTEL-first architecture for capturing user activity streams

---

## Vision

Use OpenTelemetry as the unified backbone for observing user activity across all sources. OTEL provides:
- **Standardized format** (OTLP - OpenTelemetry Protocol)
- **Rich ecosystem** (collectors, exporters, processors)
- **Native instrumentation** (Claude Code, many dev tools)
- **Infrastructure-level bridging** (MQTT receiver for Home Assistant/Frigate)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVITY SOURCES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Primary (Native OTEL):                                         │
│  ├─ Claude Code (hooks emit OTEL spans/events)                 │
│  ├─ VSCode (custom extension → OTEL exporter)                  │
│  ├─ Browser (custom extension → OTEL exporter)                 │
│  ├─ Discord (bot/client → OTEL exporter)                       │
│  └─ Linux Activity (systemd journal → OTEL)                    │
│                                                                 │
│  Secondary (MQTT → OTEL):                                       │
│  ├─ Home Assistant (MQTT → OTEL Collector)                     │
│  └─ Frigate NVR (MQTT → OTEL Collector)                        │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ OTLP/gRPC or HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              OPENTELEMETRY COLLECTOR                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receivers:                                                     │
│  ├─ OTLP (native)                                               │
│  └─ MQTT (for Home Assistant/Frigate)                          │
│                                                                 │
│  Processors:                                                    │
│  ├─ Filter (noise reduction)                                    │
│  ├─ Batch (efficiency)                                          │
│  ├─ Attributes (enrichment)                                     │
│  └─ Transform (normalize MQTT events)                          │
│                                                                 │
│  Exporters:                                                     │
│  ├─ HTTP (to Galatea enrichment endpoint)                      │
│  └─ File/OTLP (for replay/debugging)                           │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              GALATEA ENRICHMENT LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /api/observation/ingest                                   │
│  ├─ Receives OTEL events (spans/logs)                          │
│  ├─ Single unified interface                                    │
│  └─ Routes to Layer 2 (Enrichment)                             │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    [Rest of Pipeline]
              (Enrichment → Dialogue → Memory)
```

---

## Event Format

All activity sources emit **OTEL Spans** or **OTEL Log Records** with standardized attributes.

### Span Example (Claude Code interaction)

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "galatea-observer" }},
        { "key": "source.type", "value": { "stringValue": "claude_code" }}
      ]
    },
    "scopeSpans": [{
      "spans": [{
        "name": "user.prompt",
        "kind": "SPAN_KIND_INTERNAL",
        "startTimeUnixNano": "1675700000000000000",
        "endTimeUnixNano": "1675700002340000000",
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "claude_code_prompt" }},
          { "key": "prompt.text", "value": { "stringValue": "Add JWT auth to API" }},
          { "key": "session.id", "value": { "stringValue": "abc123" }},
          { "key": "working_directory", "value": { "stringValue": "/home/user/project" }}
        ]
      }]
    }]
  }]
}
```

### Log Record Example (Browser activity)

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "galatea-observer" }},
        { "key": "source.type", "value": { "stringValue": "browser" }}
      ]
    },
    "scopeLogs": [{
      "logRecords": [{
        "timeUnixNano": "1675700000000000000",
        "body": { "stringValue": "Viewing: JWT best practices - Stack Overflow" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "tab_active" }},
          { "key": "domain", "value": { "stringValue": "stackoverflow.com" }},
          { "key": "title", "value": { "stringValue": "JWT best practices" }},
          { "key": "duration_ms", "value": { "intValue": "45000" }}
        ]
      }]
    }]
  }]
}
```

---

## Standardized Attributes

All events MUST include:

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `service.name` | string | Always "galatea-observer" | `galatea-observer` |
| `source.type` | string | Activity source | `claude_code`, `vscode`, `browser`, `discord`, `linux`, `homeassistant`, `frigate` |
| `activity.type` | string | Specific event type | `claude_code_prompt`, `file_open`, `tab_active` |
| `session.id` | string | User session ID | `abc123` |
| `timestamp` | int64 | Unix nano | `1675700000000000000` |

Source-specific attributes are namespaced (e.g., `claude_code.*`, `vscode.*`, `browser.*`).

---

## Benefits of OTEL-First Design

### 1. Single Interface
```typescript
// server/routes/api/observation/ingest.ts
export default defineEventHandler(async (event) => {
  const otelPayload = await readBody(event) // OTLP/JSON

  // Parse OTEL spans or logs
  const activities = parseOtelEvents(otelPayload)

  // Route to enrichment (Layer 2)
  for (const activity of activities) {
    await enrichmentQueue.add(activity)
  }

  return { received: activities.length }
})
```

No need to handle MQTT, HTTP webhooks, WebSockets separately - everything arrives as OTEL.

### 2. Infrastructure-Level Filtering

```yaml
# otel-collector-config.yaml
processors:
  filter:
    # Drop noise at infrastructure level
    logs:
      exclude:
        match_type: regexp
        record_attributes:
          - key: domain
            value: "chrome://.*"
          - key: vscode.file_path
            value: ".*/node_modules/.*"
```

Pipeline code never sees noise.

### 3. Replay & Debugging

```yaml
exporters:
  file:
    path: /var/log/galatea/observations.jsonl
    format: json

  otlp:
    endpoint: http://galatea:3000/api/observation/ingest
```

Export to file for replay, plus live stream to Galatea.

### 4. Extensibility

Adding a new source (e.g., Slack):
1. Build Slack bot that emits OTEL events
2. No changes to pipeline code
3. Update Collector config if needed

### 5. Ecosystem Integration

- **Jaeger**: View activity traces visually
- **Prometheus**: Metrics on activity patterns
- **Grafana**: Dashboards for user behavior
- **Langfuse**: Already using OTEL for LLM observability

---

## Data Flow

### Real-Time Path
```
Activity Source → OTEL Collector → Galatea API → Enrichment → Dialogue → Memory
```

### Debugging Path
```
Activity Source → OTEL Collector → File Export → Replay Tool → Galatea API
                                  → Jaeger UI (visual traces)
```

---

## Configuration

### Environment Variables

```bash
# .env
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318  # HTTP
OTEL_COLLECTOR_GRPC_ENDPOINT=http://localhost:4317  # gRPC
OTEL_SERVICE_NAME=galatea-observer
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf  # or grpc
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    command: ["--config=/etc/otel-collector-config.yaml"]
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
      - "11883:11883"  # MQTT (for Home Assistant/Frigate)
    environment:
      - GALATEA_API_URL=http://galatea:3000

  galatea:
    # Your app
    environment:
      - OTEL_COLLECTOR_ENDPOINT=http://otel-collector:4318
```

---

## Implementation Priority

**Phase 1 (MVP)**:
1. Claude Code observation (native OTEL hooks)
2. Browser observation (custom extension)
3. OTEL Collector setup (basic config)
4. Galatea ingest endpoint

**Phase 2**:
5. VSCode observation (custom extension)
6. Linux activity observation (systemd journal)
7. Filtering & processors

**Phase 3**:
8. Discord observation (bot)
9. MQTT→OTEL bridge (Home Assistant/Frigate)
10. Replay/debugging tools

---

## Related Docs

- [01-claude-code-otel.md](./01-claude-code-otel.md) - Claude Code observation via hooks
- [02-vscode-otel.md](./02-vscode-otel.md) - VSCode extension design
- [03-linux-activity-otel.md](./03-linux-activity-otel.md) - System activity capture
- [04-discord-otel.md](./04-discord-otel.md) - Discord bot integration
- [05-browser-otel.md](./05-browser-otel.md) - Browser extension design
- [06-mqtt-to-otel-bridge.md](./06-mqtt-to-otel-bridge.md) - Home Assistant/Frigate bridge

---

**Status**: Design phase - ready for implementation planning
**Next Step**: Implement Phase 1 (Claude Code + Browser + Collector)
