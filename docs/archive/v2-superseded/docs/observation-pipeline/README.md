# Observation Pipeline Documentation

**Date**: 2026-02-06
**Status**: Design Phase
**Purpose**: OTEL-first architecture for capturing user activity across all sources

---

## Overview

This directory contains comprehensive documentation for Galatea's observation pipeline, which uses **OpenTelemetry (OTEL) as the unified backbone** for capturing user activity from multiple sources.

## Key Decision

**Use OTEL for observation pipeline** with infrastructure-level MQTT→OTEL bridging for Home Assistant/Frigate.

**Rationale**:
- Claude Code has native OTEL support
- Unified data format (OTLP) across all sources
- Infrastructure-level filtering & transformation (OTEL Collector)
- Extensible (add sources by emitting OTEL)
- Can replay/debug via Jaeger/Langfuse

See [../research/2026-02-06-otel-vs-mqtt-comparison.md](../research/2026-02-06-otel-vs-mqtt-comparison.md) for full analysis.

---

## Documents

### [00-architecture-overview.md](./00-architecture-overview.md)
**Overall system architecture**

- OTEL-first design
- Data flow: Sources → Collector → Galatea API
- Event format standardization
- Benefits & implementation priority

**Start here** to understand the complete picture.

---

### [01-claude-code-otel.md](./01-claude-code-otel.md)
**Observing Claude Code interactions**

- User prompts to Claude
- Tool usage (Read, Edit, Bash, etc.)
- File context tracking
- Hook-based implementation

**Priority**: HIGH - This is how you code

**What we learn**:
- Workflow patterns (TDD, exploration style)
- Domain knowledge (what you work on)
- Tool preferences
- Problem-solving approach

---

### [02-vscode-otel.md](./02-vscode-otel.md)
**Observing VSCode editor activity**

- Files opened/edited/saved
- Debug sessions
- Git operations
- Navigation patterns

**Priority**: HIGH - What files you work on

**What we learn**:
- Coding patterns (save frequency, debug usage)
- Domain focus (which modules you edit)
- Workflow (TDD, exploratory, etc.)

---

### [03-linux-activity-otel.md](./03-linux-activity-otel.md)
**Observing Linux system activity**

- Application launches
- Window focus changes
- System sleep/wake
- Workspace switching

**Priority**: MEDIUM - Contextual awareness

**What we learn**:
- Work patterns (start time, focus apps)
- Context switches (Slack, browser, terminal)
- Presence detection

---

### [04-discord-otel.md](./04-discord-otel.md)
**Observing Discord activity**

- Messages sent (metadata only)
- Channels active in
- Voice chat participation
- Social context

**Priority**: LOW - Social context

**What we learn**:
- Communication patterns
- Work context (coordinating releases, helping others)
- Collaboration style

---

### [05-browser-otel.md](./05-browser-otel.md)
**Observing browser activity**

- Sites visited
- Search queries
- Time on page
- Tab switching

**Priority**: HIGH - Research & learning

**What we learn**:
- Research patterns (Stack Overflow, docs)
- Knowledge gaps (what you search for)
- Tool discovery (npm packages, libraries)

---

### [06-mqtt-to-otel-bridge.md](./06-mqtt-to-otel-bridge.md)
**MQTT → OTEL bridge for Home Assistant & Frigate**

- OTEL Collector MQTT receiver
- Transform MQTT messages to OTEL format
- Home Assistant state changes
- Frigate person/vehicle detections

**Priority**: MEDIUM - Home context & presence

**What we learn**:
- Presence detection (arrived/left office)
- Work context (desk lamp on = starting work)
- Daily patterns (consistent schedule)

---

## Implementation Priority

### Phase 1 (MVP)
1. **OTEL Collector setup** - Infrastructure foundation
2. **Claude Code observation** - Native OTEL hooks
3. **Browser observation** - Extension
4. **Galatea ingest endpoint** - API to receive OTEL events

### Phase 2
5. **VSCode observation** - Extension
6. **Linux activity observation** - systemd/X11 monitoring
7. **Filtering & processors** - Noise reduction

### Phase 3
8. **Discord observation** - Bot (optional)
9. **MQTT→OTEL bridge** - Home Assistant/Frigate
10. **Replay/debugging** - Jaeger integration

---

## Quick Start

### 1. Launch OTEL Collector

```bash
# In project root
docker-compose up otel-collector
```

### 2. Configure Source

Pick a source from docs above and follow implementation guide.

### 3. Test Event Flow

```bash
# Check Collector received events
docker logs otel-collector | grep "galatea-observer"

# Check Galatea API received events
curl http://localhost:3000/api/observation/recent | jq .
```

---

## Event Format

All sources emit standardized OTEL events:

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "galatea-observer" }},
        { "key": "source.type", "value": { "stringValue": "claude_code" }}
      ]
    },
    "scopeLogs": [{
      "logRecords": [{
        "timeUnixNano": "1675700000000000000",
        "body": { "stringValue": "Opened: src/auth.ts" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "vscode_file_open" }},
          { "key": "vscode.file_path", "value": { "stringValue": "/home/user/project/src/auth.ts" }},
          { "key": "session.id", "value": { "stringValue": "abc123" }}
        ]
      }]
    }]
  }]
}
```

**Standard Attributes** (all events):
- `service.name`: Always "galatea-observer"
- `source.type`: Source of event (`claude_code`, `vscode`, `browser`, etc.)
- `activity.type`: Specific event type (`claude_code_prompt`, `vscode_file_open`, etc.)
- `session.id`: Galatea session ID

**Source-specific attributes** are namespaced (e.g., `vscode.file_path`, `browser.domain`).

---

## Privacy & Filtering

### At Infrastructure Level (OTEL Collector)

```yaml
# otel-collector-config.yaml
processors:
  filter:
    logs:
      exclude:
        match_type: regexp
        record_attributes:
          - key: domain
            value: "chrome://.*"
          - key: vscode.file_path
            value: ".*/node_modules/.*"
```

### At Source Level

Each source doc includes privacy considerations:
- Sensitive data redaction
- Exclude patterns
- User control (disable observation)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVITY SOURCES                             │
├─────────────────────────────────────────────────────────────────┤
│  Primary (Native OTEL):                                         │
│  ├─ Claude Code (hooks)                                         │
│  ├─ VSCode (extension)                                          │
│  ├─ Browser (extension)                                         │
│  ├─ Discord (bot)                                               │
│  └─ Linux Activity (systemd/X11)                               │
│                                                                 │
│  Secondary (MQTT → OTEL):                                       │
│  ├─ Home Assistant (MQTT Receiver)                             │
│  └─ Frigate NVR (MQTT Receiver)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │ OTLP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              OPENTELEMETRY COLLECTOR                            │
├─────────────────────────────────────────────────────────────────┤
│  Receivers: OTLP + MQTT                                         │
│  Processors: Filter, Transform, Batch                           │
│  Exporters: HTTP (Galatea) + File (debug)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              GALATEA ENRICHMENT LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/observation/ingest                                   │
│  Single unified OTEL interface                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    [Enrichment → Dialogue → Memory]
```

---

## Related Documentation

- [../research/2026-02-06-otel-vs-mqtt-comparison.md](../research/2026-02-06-otel-vs-mqtt-comparison.md) - Full OTEL vs MQTT analysis
- [../archive/pre-v2/OBSERVATION_PIPELINE.md](../archive/pre-v2/OBSERVATION_PIPELINE.md) - Original high-level pipeline design (archived)
- [../archive/pre-v2/FINAL_MINIMAL_ARCHITECTURE.md](../archive/pre-v2/FINAL_MINIMAL_ARCHITECTURE.md) - Overall system architecture (archived)

---

## Next Steps

1. **Review docs** - Read 00-architecture-overview.md first
2. **Pick MVP sources** - Claude Code + Browser (highest value)
3. **Set up Collector** - Deploy OTEL Collector with basic config
4. **Build first source** - Implement Claude Code hooks
5. **Test end-to-end** - Verify events flow to Galatea API

---

**Status**: Design complete, ready for implementation
**Created**: 2026-02-06
