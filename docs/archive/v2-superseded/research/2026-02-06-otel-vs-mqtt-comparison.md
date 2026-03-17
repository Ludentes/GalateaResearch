# OpenTelemetry (OTEL) vs MQTT: Comprehensive Technical Analysis

**Date**: 2026-02-06
**Purpose**: Architectural decision for Galatea observation pipeline backbone
**Decision**: Use OTEL as primary backbone, MQTT→OTEL bridge for Home Assistant/Frigate

---

## Executive Summary

**Bottom line: OpenTelemetry and MQTT serve fundamentally different purposes and are complementary, not competing technologies.** OTEL is an observability framework for monitoring system behavior, while MQTT is a messaging protocol for event-driven communication.

**Recommendation for Galatea**: Use OTEL as the unified observation backbone with MQTT→OTEL bridging at infrastructure level (OTEL Collector MQTT receiver).

---

## 1. What is OpenTelemetry designed for?

OpenTelemetry is an **observability framework** that standardizes the collection and export of three types of telemetry data:

### Core Components

**Traces**: Distributed request tracking across services
- Track LLM call chains (context assembly → model inference → memory ingestion)
- Measure latency at each stage
- Correlate errors with specific requests

**Metrics**: Numerical measurements over time
- Token usage, request throughput, error rates
- Resource consumption (memory, CPU)
- Custom metrics (homeostasis dimension values, memory retrieval latency)

**Logs**: Time-stamped event records
- Structured logging with trace context
- Error details, debug information
- Can be queried alongside traces

### What OTEL is NOT

- **Not a message broker** - Can't deliver events to multiple subscribers
- **Not a pub/sub system** - No topic-based routing
- **Not a data store** - Needs a backend (Langfuse, Jaeger, Prometheus)
- **Not for domain events** - Optimized for observability, not business logic

### Current Usage in Galatea

Already using OTEL via Langfuse for LLM observability (`server/plugins/langfuse.ts`):

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node"
import { LangfuseSpanProcessor } from "@langfuse/otel"

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
})
sdk.start()
```

This gives visibility into LLM calls but doesn't handle domain events or user activity observation.

---

## 2. What is MQTT designed for?

MQTT (Message Queuing Telemetry Transport) is a **lightweight pub/sub messaging protocol** designed for IoT and real-time communication:

### Core Characteristics

**Publish/Subscribe Pattern**
- Publishers send messages to topics (e.g., `homeassistant/sensor/temperature`)
- Subscribers receive messages from topics they're interested in
- Decoupled architecture - publishers/subscribers don't know about each other

**Quality of Service Levels**
- QoS 0: At most once (fire-and-forget)
- QoS 1: At least once (guaranteed delivery)
- QoS 2: Exactly once (highest guarantee, lowest throughput)

**Broker Architecture**
- Central broker routes messages (Mosquitto, EMQX, HiveMQ)
- Handles connection state, topic subscriptions, message persistence

### Current Planning in Galatea

Per architecture docs (`docs/FINAL_MINIMAL_ARCHITECTURE.md`):

```yaml
# docker-compose.yml
mosquitto:
  image: eclipse-mosquitto:2
  ports:
    - "11883:1883"  # MQTT
    - "19001:9001"  # WebSockets
```

Already planned for MQTT integration with Home Assistant and Frigate NVR.

---

## 3. Can OTEL replace MQTT for event-driven architecture?

**No. They're fundamentally different technologies.**

### Technical Comparison

| Capability | OTEL | MQTT |
|------------|------|------|
| **Pub/Sub messaging** | ❌ No | ✅ Yes |
| **Multiple subscribers** | ❌ No | ✅ Yes (native) |
| **Topic-based routing** | ❌ No | ✅ Yes |
| **Persistent connections** | ❌ No | ✅ Yes |
| **Retained messages** | ❌ No | ✅ Yes |
| **Last will/testament** | ❌ No | ✅ Yes |
| **Request correlation** | ✅ Yes (traces) | ⚠️ Manual |
| **Performance monitoring** | ✅ Yes | ❌ No |
| **Distributed tracing** | ✅ Yes | ❌ No |

---

## 4. OTEL Observability vs MQTT Messaging - Key Differences

### Architectural Purpose

**OTEL: Passive Observation**
- **Role**: "Tell me what happened so I can debug/optimize"
- **Direction**: Application → Observability backend (Langfuse, Jaeger)
- **Consumers**: Developers, SREs, monitoring tools
- **After-the-fact**: Data collected for later analysis

**MQTT: Active Communication**
- **Role**: "Something happened, react now"
- **Direction**: Component → Component (via broker)
- **Consumers**: Other application components
- **Real-time**: Immediate event delivery and reaction

### Data Flow Patterns

**OTEL Pattern (Telemetry Export)**
```
Component → OTEL SDK → Exporter → Backend → Dashboard/Query
                           ↓
                     (fire-and-forget)
```

**MQTT Pattern (Event Bus)**
```
Publisher → Broker → Subscriber 1
                  ↘ Subscriber 2
                  ↘ Subscriber 3
                    (real-time delivery)
```

---

## 5. Can OTEL carry domain events (not just telemetry)?

**Technically possible, but architecturally inappropriate.**

### What OTEL Supports

**OTEL Events API** (built on LogRecords):
```typescript
import { logs } from '@opentelemetry/api-logs'

const logger = logs.getLogger('galatea')
logger.emit({
  name: 'homeostasis.state_changed',
  timestamp: Date.now(),
  attributes: {
    dimension: 'knowledge_sufficiency',
    oldState: 'HEALTHY',
    newState: 'LOW'
  }
})
```

This is valid OTEL code. But where does it go?

### The Problems

**1. No Pub/Sub**
- OTEL events go to your observability backend (Langfuse)
- Other components in your system don't see them
- Can't subscribe to specific event types

**2. Not Designed for Application Logic**
> "Events in OpenTelemetry are explicitly defined as semantic convention for logs... An event is a 'semantically rigorous log'" - [OpenTelemetry Events Specification](https://opentelemetry.io/docs/specs/semconv/general/events/)

OTEL events are for **observability**, not **orchestration**.

**3. Semantic Conventions Focus on Observability Use Cases**
- User actions (clicks, logins)
- Performance milestones (transaction complete)
- Errors and exceptions
- NOT: "Memory system should now reassess context"

---

## 6. Performance Comparison (Latency, Throughput)

### OpenTelemetry Performance

**Overhead in Node.js** (from actual GitHub issues):

| Scenario | Baseline | With OTEL | Overhead |
|----------|----------|-----------|----------|
| Basic HTTP endpoint | 6.26ms | 22.03ms | +252% |
| GraphQL queries | ~20ms event loop | ~250ms event loop | +1150% |
| HTTP requests/sec | Baseline | -80% throughput | Significant |

**Mitigation strategies**:
- Selective instrumentation (don't instrument everything)
- Async export (don't block on telemetry)
- Sampling (trace 1% of requests in production)

**For Galatea observation pipeline**:
Observing user activity (low frequency events: prompts, file edits, page visits). OTEL overhead is negligible compared to human action intervals (seconds/minutes). **Acceptable.**

### MQTT Performance

**Modern broker benchmarks** (2025-2026):

| Broker | Throughput | Latency (P99) | Notes |
|--------|------------|---------------|-------|
| TBMQ 2.x | 1M msg/sec | 7.4ms avg | Single node |
| TBMQ | 3M msg/sec | Single-digit ms | Stress test |
| EMQX | 60K TPS | 15ms | QoS 1, 1K pub/sub |

**For Galatea**:
Event throughput is low (dozens of events per second at most). MQTT latency will be <10ms, negligible. **Not a bottleneck.**

---

## 7. Ecosystem Maturity (Node.js, TypeScript Support)

### OpenTelemetry Ecosystem

**Node.js Support**: ✅ Excellent
- Official `@opentelemetry/sdk-node` package
- Stable API (GA since 2021)
- Active development

**TypeScript Support**: ✅ Native
- Written in TypeScript
- Full type definitions

**Integration Libraries**:
- `@langfuse/otel` (already using)
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-express`

**Maturity Rating**: 8/10 - Mature but performance requires care

### MQTT Ecosystem

**Node.js Support**: ✅ Excellent
- `mqtt.js` - most popular (8.5K GitHub stars, 2.9M weekly downloads)
- `aedes` - embedded broker for Node.js

**TypeScript Support**: ✅ Strong
- `mqtt.js` has full TypeScript definitions

**Broker Options**:
- **Mosquitto** (lightweight, C-based)
- **EMQX** (scalable, built-in analytics)
- **Aedes** (pure Node.js, embeddable)

**Maturity Rating**: 9/10 - Battle-tested, IoT industry standard

---

## 8. Use Cases for Galatea

### User Activity Observation (OTEL ✅)

**Use Case**: Track user prompts, file edits, browser activity

**Winner: OTEL**

**Why**:
- This is literally "observing" user behavior (observability)
- Claude Code has native OTEL support
- Unified format across all sources (Claude Code, VSCode, Browser)
- Can send to Langfuse/Jaeger for visual debugging
- OTEL Collector can receive MQTT and convert (infrastructure-level bridging)

**Implementation**:
```
Claude Code → OTEL (native hooks)
VSCode Extension → OTEL
Browser Extension → OTEL
Home Assistant/Frigate → MQTT → [OTEL Collector] → OTEL
                                      ↓
                          Galatea Enrichment Layer (single OTEL interface)
```

### Internal Agent Events (MQTT or Direct Calls)

**Use Case**: Homeostasis state changes, memory formation events

**Winner: Function calls for now, MQTT if event-driven later**

**Why**:
- These are internal to Galatea (not observing external user)
- Don't need observability backend (Langfuse) for internal events
- MQTT makes sense IF you want event-driven architecture (multiple subscribers react)
- For MVP, direct function calls are simpler

**Implementation** (if using MQTT later):
```typescript
// Homeostasis engine publishes
mqtt.publish('homeostasis/knowledge_sufficiency', {
  state: 'LOW',
  dimension: 'knowledge_sufficiency'
})

// Multiple subscribers react:
// 1. Activity Router escalates
// 2. UI updates
// 3. Memory system searches
```

---

## 9. Can they coexist? Should they?

### Yes, they absolutely should coexist for different purposes.

**The Pattern**: User Activity via OTEL, Internal Events via MQTT (optional)

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER ACTIVITY SOURCES                        │
├─────────────────────────────────────────────────────────────────┤
│  Claude Code → OTEL                                             │
│  VSCode → OTEL                                                  │
│  Browser → OTEL                                                 │
│  Linux Activity → OTEL                                          │
│  Discord → OTEL                                                 │
│  Home Assistant → MQTT → [OTEL Collector MQTT Receiver] → OTEL │
│  Frigate → MQTT → [OTEL Collector MQTT Receiver] → OTEL        │
└────────────────────────────┬────────────────────────────────────┘
                             │ OTLP
                             ▼
           ┌─────────────────────────────────┐
           │  OpenTelemetry Collector        │
           │  - Receives OTLP + MQTT         │
           │  - Transforms to unified OTEL   │
           │  - Filters noise                │
           │  - Exports to Galatea           │
           └─────────────────┬───────────────┘
                             │ HTTP
                             ▼
           ┌─────────────────────────────────┐
           │  Galatea Enrichment API         │
           │  POST /api/observation/ingest   │
           │  (Single OTEL interface)        │
           └─────────────────┬───────────────┘
                             │
                             ▼
                  [Enrichment → Dialogue → Memory]
```

**Internal Agent Events** (optional, separate from observation):
```
┌─────────────────────────────────────────────────────────────────┐
│  Homeostasis Engine → MQTT (if event-driven)                   │
│  Memory Formation → MQTT (if event-driven)                     │
│  Activity Router → MQTT (if event-driven)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                        [Components subscribe]
```

---

## 10. Real-World Examples of OTEL for Domain Events

### The Reality: OTEL is used FOR observability OF event systems, not AS the event system

**Example 1: Manufacturing System (2026)**

> "OpenTelemetry Collector parsing domain events from legacy systems, such as manufacturing events like 'PRODUCT_COMPLETED,' 'FAULT_DETECTED,' and 'MACHINE_START.'"

**Key insight**: Events already exist in the legacy system. OTEL is **observing** them, not delivering them.

**Example 2: MQTT + OTEL Integration**

> "While MQTT handles message transport for IoT devices, OpenTelemetry provides the observability framework to monitor and trace those messages through distributed systems."

**Architecture**:
```
IoT Device → MQTT Broker → Subscriber
                ↓
         OTEL traces MQTT messages
                ↓
         Observability Backend
```

**Example 3: Cloud Pub/Sub + OTEL**

Google Cloud Pub/Sub uses OTEL to trace message lifecycle:

> "For every message published, the client library creates a new trace that represents the entire lifecycle of the message."

**Pattern**: Pub/Sub is the event system, OTEL tracks it.

---

## Recommendations for Galatea

### 1. Use OTEL for Observation Pipeline

**User Activity Capture**:
- Claude Code → OTEL (native support via hooks)
- VSCode → OTEL (build extension that emits OTEL)
- Browser → OTEL (build extension that emits OTEL)
- Linux Activity → OTEL (systemd journal + OTEL exporter)
- Discord → OTEL (bot that emits OTEL)
- Home Assistant/Frigate → **MQTT → OTEL Collector MQTT Receiver** (infrastructure bridge)

**Benefits**:
- Unified format (OTLP)
- Single ingestion endpoint in Galatea
- Can replay/debug via Jaeger/Langfuse
- Infrastructure-level filtering (OTEL Collector processors)
- Extensible (add sources by emitting OTEL)

### 2. Keep Internal MQTT for Internal Agent Events (Optional)

**Internal coordination** (homeostasis, memory, routing):
- Use direct function calls for MVP
- Add MQTT later if event-driven architecture needed
- Separate from observation pipeline

### 3. Implementation Roadmap

**Phase 1 (MVP)**:
1. OTEL Collector setup (basic config)
2. Claude Code observation (hooks)
3. Browser observation (extension)
4. Galatea ingest endpoint

**Phase 2**:
5. VSCode observation (extension)
6. Linux activity observation (systemd)
7. MQTT→OTEL bridge (Home Assistant/Frigate)

**Phase 3**:
8. Discord observation (bot)
9. Advanced filtering & processors
10. Replay/debugging tools

---

## Conclusion

**OTEL and MQTT solve different problems**:

| Concern | Use OTEL | Use MQTT |
|---------|----------|----------|
| Observe user activity | ✅ | ❌ |
| Track system health | ✅ | ❌ |
| Debug/optimize | ✅ | ❌ |
| Request correlation | ✅ | ❌ |
| Component coordination | ❌ | ✅ |
| Real-time pub/sub | ❌ | ✅ |
| Multiple subscribers | ❌ | ✅ |

**For Galatea specifically**:

**Use OTEL for**:
- Observation pipeline (user activity from all sources)
- Unified data format
- Infrastructure-level transformation (MQTT→OTEL)

**Keep MQTT for** (optional):
- Home Assistant/Frigate (already MQTT-native, bridge via OTEL Collector)
- Internal agent events (if event-driven architecture needed later)

**They're not competitors - they're teammates.**

---

## Sources

- [Demystifying OpenTelemetry](https://opentelemetry.io/blog/2026/demystifying-opentelemetry/)
- [OpenTelemetry for MQTT and IoT Observability](https://www.emqx.com/en/blog/open-telemetry-the-basics-and-benefits-for-mqtt-and-iot-observability)
- [AsyncAPI, CloudEvents, OpenTelemetry Comparison](https://www.asyncapi.com/blog/async_standards_compare)
- [OpenTelemetry in Event-Driven Architectures](https://www.cncf.io/blog/2023/11/02/opentelemetry-in-decoupled-event-driven-architectures-solving-for-the-black-box-when-your-consuming-applications-are-constantly-changing/)
- [MQTT.js GitHub](https://github.com/mqttjs/MQTT.js)
- [TBMQ Performance Tests](https://thingsboard.io/docs/mqtt-broker/reference/3m-throughput-single-node-performance-test/)
- [OpenTelemetry Node.js Performance Issues](https://github.com/open-telemetry/opentelemetry-js/discussions/5525)
