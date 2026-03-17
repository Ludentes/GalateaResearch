# Existing Solutions for OTEL Observation Pipeline

**Date**: 2026-02-06
**Purpose**: Research existing solutions to minimize custom development

---

## Summary

| Source | Existing Solutions | Status | Recommendation |
|--------|-------------------|--------|----------------|
| **Linux Activity** | ActivityWatch, OTEL Collector (Host Metrics, Journald) | ✅ Production-ready | **Use existing + build bridges** |
| **Browser** | ActivityWatch (aw-watcher-web), tbrockman OTEL extension | ⚠️ Needs bridge or early-stage | **ActivityWatch + OTLP bridge recommended** |
| **Discord** | No mature OTEL solutions | 🔴 Build required | **Build custom with OTEL JS SDK** |

---

## 1. Linux Activity Monitoring

### ✅ Production-Ready Solutions Found

#### **OpenTelemetry Collector Contrib** (Official)
- **GitHub**: [open-telemetry/opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- **Stars**: 4,400+ | **Status**: Actively maintained (CNCF project)
- **Latest**: v0.144.0 (January 20, 2026)

**Components**:
- **Host Metrics Receiver**: CPU, memory, disk, network, filesystem
- **Journald Receiver**: SystemD journal events
- **Process Metrics**: Per-process CPU, memory, disk I/O

**What it does NOT do**:
- ❌ Window focus tracking
- ❌ Application launches (desktop)
- ❌ Desktop environment events

#### **ActivityWatch** (Best for Desktop Activity)
- **GitHub**: [ActivityWatch/activitywatch](https://github.com/ActivityWatch/activitywatch)
- **Status**: Actively maintained, popular in time-tracking community
- **Privacy**: Excellent (all local storage)

**Features**:
- ✅ Active window tracking (app name, title)
- ✅ Keyboard/mouse activity (AFK detection)
- ✅ Cross-platform (Linux, Windows, macOS)
- ✅ Works on X11 and Wayland
- ✅ REST API for data export

**OTEL Integration**: ❌ No native support - requires custom bridge

### 📋 Recommended Architecture

**Tier 1: Use OTEL Collector** (Production-ready)
- Host Metrics Receiver for system resources
- Journald Receiver for systemd events

**Tier 2: Bridge ActivityWatch** (Custom development)
- Install ActivityWatch for desktop tracking
- Build OTLP bridge: Poll REST API → Transform to OTLP → Export
- **Effort**: Low-Medium

**Alternative**: Build custom DBus listener for sleep/wake events

---

## 2. Browser Activity Monitoring

### ✅ Mature Solution Found: ActivityWatch

#### **aw-watcher-web** (ActivityWatch Browser Extension)
- **GitHub**: [ActivityWatch/aw-watcher-web](https://github.com/ActivityWatch/aw-watcher-web)
- **Stars**: 488 | **Status**: Actively maintained
- **Latest**: Ported to Vite, TypeScript, Manifest V3 (January 2026)

**Features**:
- ✅ Active tab tracking (title, URL, audible, incognito)
- ✅ Time on page
- ✅ Cross-browser (Chrome, Edge, Firefox)
- ✅ Privacy-focused (all local storage)
- ✅ REST API

**OTEL Integration**: ❌ No native support - requires bridge

#### **tbrockman/browser-extension-for-opentelemetry**
- **GitHub**: [tbrockman/browser-extension-for-opentelemetry](https://github.com/tbrockman/browser-extension-for-opentelemetry)
- **Status**: ⚠️ Early development
- **Rating**: 4.2/5 (Chrome Web Store)

**Features**:
- ✅ Native OTLP export
- ✅ Automatic webpage instrumentation
- ✅ No separate server required

**Limitations**: Early stage, limited features

### 📋 Recommended Options

**Option A: ActivityWatch + OTLP Bridge** (Recommended)
- Use mature, well-tested extension
- Build bridge: aw-server REST API → OTLP
- **Effort**: Low-Medium
- **Privacy**: Excellent

**Option B: Extend tbrockman's extension**
- Already OTLP-native
- Add missing features (time tracking, search queries)
- **Effort**: Medium
- **Risk**: Early-stage project

**Option C: Build from scratch**
- Full control, optimized for needs
- **Effort**: High

---

## 3. Discord Activity Monitoring

### 🔴 No Viable Solutions Found

#### Projects Evaluated

| Project | Stars | Last Commit | Status | OTEL Support |
|---------|-------|-------------|--------|--------------|
| **discord-tracker** | 9 | Aug 2025 | Active | ❌ No |
| **rankore** | 9 | Oct 2023 | Minimal | ❌ No |
| **Promcord** | 148 | Archived 2024 | 🔴 Dead | ❌ (Prometheus) |
| **discord.js-datadog** | 5 | Mar 2021 | 🔴 Dead | ❌ (Datadog) |
| **opentelemetry-instrumentation-discordpy** | 2 | Feb 2024 | ⚠️ Alpha | ✅ (Python only) |

**Key Findings**:
- ❌ No Discord.js + OpenTelemetry library exists
- ❌ Only Python has OTEL support (alpha quality)
- ❌ Most projects are small (1-9 stars) and abandoned
- ❌ Best option (Promcord, 148 stars) is archived

### 📋 Recommendation: Build Custom

**Approach**: Custom Discord.js bot with OTEL instrumentation

**Why**:
- No mature existing solutions
- OpenTelemetry JS SDK is production-ready
- Discord.js provides clear event hooks
- Estimated effort: 23-37 hours (3-5 days)

**Architecture**:
```javascript
// Use OpenTelemetry JavaScript SDK
import { trace } from '@opentelemetry/api'
import { Client } from 'discord.js'

const tracer = trace.getTracer('galatea-observer')
const client = new Client({ ... })

client.on('messageCreate', async (message) => {
  if (message.author.id !== USER_ID) return

  const span = tracer.startSpan('discord.message_sent')
  span.setAttributes({
    'discord.server': message.guild?.name,
    'discord.channel': message.channel.name,
    'discord.message_length': message.content.length
  })
  span.end()
})
```

---

## 4. Implementation Priority

### Phase 1 (Week 1): Production-Ready OTEL
- ✅ Install OTEL Collector Contrib
- ✅ Configure Host Metrics + Journald receivers
- ✅ Test system metrics flow

### Phase 2 (Week 2): Linux Desktop Bridge
- ✅ Install ActivityWatch
- ✅ Build ActivityWatch → OTLP bridge
- ✅ Test window focus tracking

### Phase 3 (Week 2-3): Browser Bridge
- ✅ Install aw-watcher-web
- ✅ Build browser activity → OTLP bridge (or extend Linux bridge)
- ✅ Test tab tracking

### Phase 4 (Week 3-4): Discord Custom Bot
- ✅ Build Discord.js bot with OTEL SDK
- ✅ Instrument messageCreate, voiceStateUpdate
- ✅ Export to OTLP Collector

---

## 5. Effort Estimate

| Component | Approach | Effort | Risk |
|-----------|----------|--------|------|
| Linux System | OTEL Collector | **Low** (config only) | Low |
| Linux Desktop | ActivityWatch + bridge | **Medium** (bridge dev) | Low |
| Browser | ActivityWatch + bridge | **Low-Medium** (share bridge) | Low |
| Discord | Custom OTEL bot | **Medium-High** (build from scratch) | Medium |

**Total**: 4-6 weeks for complete observation pipeline

---

## 6. Key Takeaway

**80/20 Rule Applied**:
- **80% solved** by existing tools (OTEL Collector, ActivityWatch)
- **20% custom development** for bridges and Discord

**Do NOT build**:
- ❌ System metrics (use OTEL Collector)
- ❌ Desktop tracking (use ActivityWatch)
- ❌ Browser tracking (use aw-watcher-web)

**Build custom**:
- ✅ OTLP bridges (ActivityWatch → OTLP)
- ✅ Discord bot (no viable alternative)

---

## Sources

See individual research reports:
- Linux: Agent a4082fb research output
- Discord: Agent a612e40 research output
- Browser: Agent a0b9990 research output
