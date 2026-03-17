# MQTT to OTEL Bridge: Home Assistant & Frigate

**Date**: 2026-02-06
**Source**: MQTT events from Home Assistant and Frigate NVR
**Priority**: Medium (home context & presence detection)
**Status**: Design

---

## Overview

Home Assistant and Frigate publish events to MQTT natively. We need to bridge these to OTEL for unified observation pipeline.

**Sources**:
- **Home Assistant**: State changes (doors, lights, presence sensors)
- **Frigate NVR**: Person/vehicle detections from cameras

**Goal**: Understand **user presence** and **home context** during work.

---

## Architecture

```
Home Assistant → MQTT Broker (Mosquitto)
Frigate NVR   ↗                          ↘
                                   [OTEL Collector MQTT Receiver]
                                              ↓
                                     Transform to OTEL format
                                              ↓
                                      Galatea Enrichment API
```

The OTEL Collector has an **MQTT receiver** that subscribes to topics and converts messages to OTEL events.

---

## OpenTelemetry Collector Configuration

### OTEL Collector Config

```yaml
# otel-collector-config.yaml

receivers:
  # Native OTLP receivers (for Claude Code, VSCode, Browser)
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  # MQTT receiver for Home Assistant & Frigate
  mqtt:
    endpoint: tcp://mosquitto:1883
    topics:
      # Home Assistant state changes
      - topic: "homeassistant/+/+/state"
        qos: 1

      # Frigate events
      - topic: "frigate/events"
        qos: 1
      - topic: "frigate/+/person"
        qos: 1
      - topic: "frigate/+/car"
        qos: 1

    # Parse JSON payload
    encoding: json

processors:
  # Transform MQTT messages to OTEL format
  transform:
    log_statements:
      - context: log
        statements:
          # Extract Home Assistant attributes
          - set(resource.attributes["service.name"], "galatea-observer")
          - set(resource.attributes["source.type"], "homeassistant") where body["topic"] starts_with "homeassistant/"

          # Extract entity ID from topic (homeassistant/sensor/temperature/state)
          - set(attributes["activity.type"], "homeassistant_state_change") where body["topic"] starts_with "homeassistant/"
          - set(attributes["homeassistant.entity_id"], Split(body["topic"], "/")[1] + "." + Split(body["topic"], "/")[2]) where body["topic"] starts_with "homeassistant/"
          - set(attributes["homeassistant.state"], body["payload"]["state"])

          # Extract Frigate attributes
          - set(resource.attributes["source.type"], "frigate") where body["topic"] starts_with "frigate/"
          - set(attributes["activity.type"], "frigate_detection") where body["topic"] starts_with "frigate/"
          - set(attributes["frigate.camera"], Split(body["topic"], "/")[1]) where body["topic"] starts_with "frigate/"
          - set(attributes["frigate.detection_type"], Split(body["topic"], "/")[2]) where body["topic"] starts_with "frigate/"
          - set(attributes["frigate.confidence"], body["payload"]["score"])

  # Filter noise
  filter:
    logs:
      exclude:
        # Exclude frequent, unimportant state changes
        match_type: strict
        record_attributes:
          - key: homeassistant.entity_id
            value: "sensor.time"  # Time sensor updates every minute
          - key: homeassistant.entity_id
            value: "sensor.date"

  # Batch for efficiency
  batch:
    timeout: 1s
    send_batch_size: 100

exporters:
  # Export to Galatea API
  otlphttp:
    endpoint: http://galatea:3000/api/observation/ingest
    compression: gzip

  # Also log to file for debugging
  file:
    path: /var/log/otel/observations.jsonl
    format: json

service:
  pipelines:
    logs:
      receivers: [otlp, mqtt]
      processors: [transform, filter, batch]
      exporters: [otlphttp, file]
```

### Docker Compose Setup

```yaml
# docker-compose.yml

services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto-data:/mosquitto/data
      - mosquitto-logs:/mosquitto/log

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
      - otel-logs:/var/log/otel
    command: ["--config=/etc/otel-collector-config.yaml"]
    depends_on:
      - mosquitto
    environment:
      - GALATEA_API_URL=http://galatea:3000

  galatea:
    # Your app
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - otel-collector

volumes:
  mosquitto-data:
  mosquitto-logs:
  otel-logs:
```

---

## Home Assistant Integration

### MQTT Topics

Home Assistant publishes state changes to:

```
homeassistant/{domain}/{entity_id}/state
```

**Examples**:
- `homeassistant/binary_sensor/front_door/state` - Door sensor
- `homeassistant/sensor/office_motion/state` - Motion detector
- `homeassistant/light/desk_lamp/state` - Light state

### Example MQTT Message

**Topic**: `homeassistant/binary_sensor/office_door/state`

**Payload**:
```json
{
  "state": "on",
  "attributes": {
    "device_class": "door",
    "friendly_name": "Office Door"
  }
}
```

### OTEL Transformation

OTEL Collector transforms this to:

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "galatea-observer" }},
        { "key": "source.type", "value": { "stringValue": "homeassistant" }}
      ]
    },
    "scopeLogs": [{
      "logRecords": [{
        "timeUnixNano": "1675700000000000000",
        "body": { "stringValue": "Office Door: on" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "homeassistant_state_change" }},
          { "key": "homeassistant.entity_id", "value": { "stringValue": "binary_sensor.office_door" }},
          { "key": "homeassistant.state", "value": { "stringValue": "on" }},
          { "key": "homeassistant.device_class", "value": { "stringValue": "door" }},
          { "key": "session.id", "value": { "stringValue": "abc123" }}
        ]
      }]
    }]
  }]
}
```

---

## Frigate Integration

### MQTT Topics

Frigate publishes detections to:

```
frigate/events
frigate/{camera_name}/person
frigate/{camera_name}/car
```

### Example MQTT Message

**Topic**: `frigate/driveway/person`

**Payload**:
```json
{
  "type": "person",
  "score": 0.89,
  "camera": "driveway",
  "timestamp": 1675700000.123,
  "region": [100, 200, 300, 400],
  "snapshot": "/media/frigate/events/snapshot.jpg"
}
```

### OTEL Transformation

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "galatea-observer" }},
        { "key": "source.type", "value": { "stringValue": "frigate" }}
      ]
    },
    "scopeLogs": [{
      "logRecords": [{
        "timeUnixNano": "1675700000123000000",
        "body": { "stringValue": "Person detected: driveway" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "frigate_detection" }},
          { "key": "frigate.camera", "value": { "stringValue": "driveway" }},
          { "key": "frigate.detection_type", "value": { "stringValue": "person" }},
          { "key": "frigate.confidence", "value": { "doubleValue": 0.89 }},
          { "key": "session.id", "value": { "stringValue": "abc123" }}
        ]
      }]
    }]
  }]
}
```

---

## Event Schema

### Home Assistant State Change Event

**Event Type**: `homeassistant_state_change`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "homeassistant_state_change" | `homeassistant_state_change` |
| `homeassistant.entity_id` | string | Entity ID | `binary_sensor.office_door` |
| `homeassistant.state` | string | New state | `on`, `off`, `open`, `closed` |
| `homeassistant.device_class` | string | Device type | `door`, `motion`, `light` |
| `homeassistant.friendly_name` | string | Display name | `Office Door` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Office Door: open"`

### Frigate Detection Event

**Event Type**: `frigate_detection`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "frigate_detection" | `frigate_detection` |
| `frigate.camera` | string | Camera name | `driveway`, `office_window` |
| `frigate.detection_type` | string | Object detected | `person`, `car`, `dog` |
| `frigate.confidence` | double | Detection confidence | `0.89` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Person detected: driveway"`

---

## What We Learn

From Home Assistant & Frigate:

**Presence Detection**:
- "Office door opened at 9am" → User arrived at desk
- "Person detected in driveway" → User came home
- "Office motion sensor inactive for 30min" → User took a break

**Work Context**:
- "Desk lamp turned on" → User starting work
- "Office door closed" → User wants privacy (meeting/focus time)
- "Person detected in office" → User physically present

**Daily Patterns**:
- "Office door opens at 9am daily" → Consistent schedule
- "No motion after 6pm" → Work ends at 6pm
- "Person detected on weekends" → Works from home on weekends

---

## Correlation with Other Sources

### With Claude Code

1. 09:00:00 - Office door opens (Home Assistant)
2. 09:02:00 - Desk lamp turns on (Home Assistant)
3. 09:05:00 - User prompts Claude "Review yesterday's code" (Claude Code)

Context: User arrived, settled in, started work.

### With Browser + VSCode

1. 10:00:00 - No office motion for 15 min (Home Assistant)
2. 10:00:05 - Browser active on YouTube (Browser)
3. 10:15:00 - Motion detected (Home Assistant)
4. 10:15:10 - VSCode active again (VSCode)

Context: User took a break, returned to work.

---

## Privacy & Security

### Sensitive Entities

Exclude bedroom sensors, bathroom sensors:

```yaml
processors:
  filter:
    logs:
      exclude:
        match_type: regexp
        record_attributes:
          - key: homeassistant.entity_id
            value: ".*(bedroom|bathroom|private).*"
```

### Frigate Snapshots

**DO NOT** store snapshots in OTEL events. Only metadata.

```yaml
processors:
  transform:
    log_statements:
      - context: log
        statements:
          # Remove snapshot URLs
          - delete_key(body["payload"], "snapshot")
```

### MQTT Authentication

Secure MQTT broker:

```conf
# mosquitto.conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/password_file
```

Generate password file:
```bash
mosquitto_passwd -c /path/to/password_file galatea
```

---

## Testing

### Publish Test MQTT Message

```bash
# Home Assistant door event
mosquitto_pub -h localhost -p 1883 \
  -t "homeassistant/binary_sensor/office_door/state" \
  -m '{"state": "on", "attributes": {"device_class": "door", "friendly_name": "Office Door"}}'

# Frigate person detection
mosquitto_pub -h localhost -p 1883 \
  -t "frigate/driveway/person" \
  -m '{"type": "person", "score": 0.92, "camera": "driveway", "timestamp": 1675700000.123}'
```

### Verify OTEL Collector Received

```bash
# Check OTEL Collector logs
docker logs otel-collector | grep "office_door"

# Check exported file
tail -f /var/log/otel/observations.jsonl | jq .
```

### Verify Galatea API Received

```bash
# Check Galatea logs
curl http://localhost:3000/api/observation/recent | jq .
```

---

## Alternative: Custom MQTT→OTEL Bridge

If OTEL Collector's MQTT receiver is insufficient, build custom bridge:

```typescript
// mqtt-otel-bridge.ts
import mqtt from 'mqtt'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'

const loggerProvider = new LoggerProvider()
const exporter = new OTLPLogExporter({
  url: 'http://localhost:4318/v1/logs',
})

loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter))
const logger = loggerProvider.getLogger('galatea-observer')

const client = mqtt.connect('mqtt://localhost:1883')

client.on('connect', () => {
  client.subscribe('homeassistant/+/+/state')
  client.subscribe('frigate/+/+')
})

client.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString())

  // Determine source type
  const sourceType = topic.startsWith('homeassistant/') ? 'homeassistant' : 'frigate'

  // Parse attributes
  let attributes: Record<string, any> = {
    'activity.type': `${sourceType}_event`,
    'session.id': process.env.GALATEA_SESSION_ID || 'default',
  }

  if (sourceType === 'homeassistant') {
    const [, domain, entity] = topic.split('/')
    attributes['homeassistant.entity_id'] = `${domain}.${entity}`
    attributes['homeassistant.state'] = payload.state
  } else if (sourceType === 'frigate') {
    const [, camera, detectionType] = topic.split('/')
    attributes['frigate.camera'] = camera
    attributes['frigate.detection_type'] = detectionType
    attributes['frigate.confidence'] = payload.score
  }

  // Emit OTEL log
  logger.emit({
    body: `${sourceType}: ${topic}`,
    attributes,
  })
})
```

Run as service:
```bash
ts-node mqtt-otel-bridge.ts
```

---

## Future Enhancements

### Automation Tracking

Track Home Assistant automations that fire:

```yaml
# Subscribe to automation events
- topic: "homeassistant/automation/+/triggered"
```

Learn which automations user relies on.

### Energy Monitoring

Track office power consumption:

```yaml
- topic: "homeassistant/sensor/office_power/state"
```

Correlate high power usage with work activity.

### Climate Context

Track temperature, humidity:

```yaml
- topic: "homeassistant/sensor/office_temperature/state"
```

Understand environmental conditions during work.

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [01-claude-code-otel.md](./01-claude-code-otel.md) - Correlate with coding activity
- [03-linux-activity-otel.md](./03-linux-activity-otel.md) - Correlate with system activity

---

**Status**: Ready for implementation (OTEL Collector MQTT receiver)
**Next Step**: Configure OTEL Collector with MQTT receiver and test
**Alternative**: Build custom TypeScript bridge if Collector insufficient
