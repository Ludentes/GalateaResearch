# Observation Pipeline Implementation Updates

**Date**: 2026-02-06
**Based on**: Research into existing solutions

---

## Key Findings

After researching existing solutions, we found **80% can be solved with existing tools**:

| Source | Solution | Status | Custom Work Needed |
|--------|----------|--------|-------------------|
| **Claude Code** | Native OTEL hooks | ✅ Production-ready | Add subagent tracking |
| **Linux System** | OTEL Collector (Host/Journald) | ✅ Production-ready | Configuration only |
| **Linux Desktop** | ActivityWatch | ✅ Mature | Build OTLP bridge |
| **Browser** | ActivityWatch (aw-watcher-web) | ✅ Mature | Build OTLP bridge (can share with desktop) |
| **Discord** | None viable | 🔴 Must build | Custom Discord.js + OTEL bot |

**See**: [research/2026-02-06-existing-solutions-research.md](../research/2026-02-06-existing-solutions-research.md)

---

##  1. Claude Code Updates

### ✅ Already Covered
- User prompts via hooks ✓
- Tool usage tracking ✓
- File context tracking ✓

### 🆕 ADD: Subagent Monitoring

**Task Tool (Subagents) are critical to track** because they reveal:
- Complex task delegation patterns
- Parallel vs sequential agent usage
- Agent efficiency metrics
- Correlation with subsequent file edits

**New Event Schema**:

```typescript
// Add to Tool Use Event
{
  "claude_code.is_subagent": boolean,  // true if tool_name === "Task"
  "claude_code.subagent_type": string,  // "general-purpose", "Explore", "Plan"
  "claude_code.subagent_description": string,  // Short task description
  "claude_code.subagent_id": string,  // Agent ID for resuming (e.g., "a9e7d0a")
}
```

**Hook Implementation**:
```bash
# ~/.claude/hooks/otel-tool-observer.sh
# Detect if tool is "Task" and extract subagent metadata
if [ "$TOOL_NAME" = "Task" ]; then
  SUBAGENT_TYPE=$(echo "$ARGS" | jq -r '.subagent_type')
  DESCRIPTION=$(echo "$ARGS" | jq -r '.description')
  # Emit enhanced OTEL event
fi
```

---

## 2. Linux Activity Updates

### ✅ Use Existing Solutions (Don't Build)

**Tier 1: OpenTelemetry Collector Contrib**
- **GitHub**: [open-telemetry/opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- **Stars**: 4,400+ | **Status**: Actively maintained (CNCF)
- **Install**: `docker pull otel/opentelemetry-collector-contrib:latest`

**What it provides**:
- Host Metrics Receiver: CPU, memory, disk, network
- Journald Receiver: SystemD events (service starts, sleep/wake)
- Process Metrics: Per-process monitoring

**What it does NOT provide**:
- ❌ Window focus tracking
- ❌ Desktop environment events
- ❌ Application launches (desktop apps)

**Tier 2: ActivityWatch (for Desktop Activity)**
- **GitHub**: [ActivityWatch/activitywatch](https://github.com/ActivityWatch/activitywatch)
- **Status**: Actively maintained, excellent privacy
- **Install**: Download from activitywatch.net

**What it provides**:
- ✅ Active window tracking (app name + title)
- ✅ Works on X11 and Wayland
- ✅ REST API for data export
- ✅ Local storage only (privacy-focused)

**Bridge Required**: ActivityWatch → OTLP
```python
# Poll ActivityWatch REST API
# Transform bucket/event format to OTLP
# Export to OTEL Collector
```

**Estimated Effort**: Low-Medium (REST API well-documented)

**Updated Recommendation**:
```
✅ Use OTEL Collector for system metrics
✅ Use ActivityWatch for desktop activity
✅ Build OTLP bridge (ActivityWatch → Collector)
❌ Don't build window tracking from scratch
```

---

## 3. Browser Activity Updates

### ✅ Use ActivityWatch Extension

**aw-watcher-web** (ActivityWatch Browser Extension)
- **GitHub**: [ActivityWatch/aw-watcher-web](https://github.com/ActivityWatch/aw-watcher-web)
- **Stars**: 488 | **Status**: Recently updated to Manifest V3 (Jan 2026)
- **Privacy**: Excellent (all local storage)

**What it provides**:
- ✅ Active tab tracking (title, URL, incognito status)
- ✅ Time on page
- ✅ Cross-browser (Chrome, Edge, Firefox)
- ✅ REST API (same as desktop ActivityWatch)

**Alternative: tbrockman OTEL Extension**
- **GitHub**: [tbrockman/browser-extension-for-opentelemetry](https://github.com/tbrockman/browser-extension-for-opentelemetry)
- **Status**: ⚠️ Early development
- **Pros**: Native OTLP export
- **Cons**: Limited features, early-stage

**Updated Recommendation**:
```
✅ Use ActivityWatch extension (mature, proven)
✅ Share OTLP bridge with desktop ActivityWatch
⚠️ Alternative: Extend tbrockman's extension if want native OTLP
```

---

## 4. Discord Activity Updates

### 🔴 No Viable Solutions - Must Build Custom

**Projects Evaluated**:
| Project | Stars | Status | OTEL Support |
|---------|-------|--------|--------------|
| discord-tracker | 9 | Active | ❌ No |
| Promcord | 148 | 🔴 Archived Oct 2024 | ❌ (Prometheus) |
| discord.js-datadog | 5 | 🔴 Dead (2021) | ❌ (Datadog) |
| opentelemetry-instrumentation-discordpy | 2 | ⚠️ Alpha | ✅ (Python only) |

**Finding**: ❌ **No Discord.js + OpenTelemetry library exists**

**Updated Recommendation**:
```
🔴 Build custom Discord.js bot with OTEL instrumentation
✅ Use OpenTelemetry JavaScript SDK (mature)
✅ Instrument messageCreate, voiceStateUpdate events
📅 Estimated: 3-5 days (23-37 hours)
```

**Priority**: **LOW** - Discord observation is optional, defer to later phase

---

## 5. Revised Implementation Roadmap

### Phase 4A: Production-Ready OTEL (Week 1)
1. ✅ Deploy OTEL Collector Contrib (Docker)
2. ✅ Configure Host Metrics Receiver
3. ✅ Configure Journald Receiver
4. ✅ Test system metrics → Galatea API

**Effort**: Low (configuration only)

### Phase 4B: Desktop & Browser (Week 2)
1. ✅ Install ActivityWatch (desktop + browser extension)
2. ✅ Build unified OTLP bridge (ActivityWatch → Collector)
3. ✅ Test window focus + tab tracking

**Effort**: Low-Medium (bridge development)

### Phase 4C: Claude Code Subagents (Week 2)
1. ✅ Update Claude Code hooks to detect Task tool
2. ✅ Extract subagent metadata (type, description, ID)
3. ✅ Test subagent tracking

**Effort**: Low (extend existing hooks)

### Phase 4D: Discord Bot (Optional, Week 3-4)
1. ⚠️ Build custom Discord.js bot
2. ⚠️ Integrate OTEL JavaScript SDK
3. ⚠️ Instrument key events

**Effort**: Medium-High | **Priority**: LOW (defer if needed)

---

## 6. Updated Effort Estimate

| Component | Original | Revised | Savings |
|-----------|----------|---------|---------|
| Linux System | Build from scratch | Config only | **90% reduction** |
| Linux Desktop | Build from scratch | Bridge ActivityWatch | **70% reduction** |
| Browser | Build extension | Bridge ActivityWatch | **70% reduction** |
| Claude Code | As planned | Add subagents | **Same +10%** |
| Discord | Build bot | Build bot | **Same** |

**Total Savings**: ~60% effort reduction by using existing tools

**Revised Timeline**: **2-3 weeks** instead of 4-6 weeks

---

## 7. Architecture Diagram (Updated)

```
┌────────────────────────────────────────────────────────────────┐
│                    ACTIVITY SOURCES                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ✅ ActivityWatch (Desktop + Browser)                          │
│     ├─ Desktop watcher (window focus, app launches)           │
│     └─ Browser extension (tabs, page visits)                  │
│                                                                │
│  ✅ Claude Code                                                │
│     └─ Native OTEL hooks (prompts, tools, subagents)          │
│                                                                │
│  🔴 Discord (if needed)                                        │
│     └─ Custom bot with OTEL SDK                               │
│                                                                │
└───────────────────┬────────────────────────────────────────────┘
                    │
       ┌────────────┴───────────┐
       │                        │
       ▼                        ▼
┌─────────────┐         ┌──────────────┐
│  OTLP Bridge│         │ OTEL Hooks   │
│ (ActivityW) │         │ (Claude Code)│
└──────┬──────┘         └──────┬───────┘
       │                       │
       │   OTLP (HTTP/gRPC)   │
       └───────────┬───────────┘
                   ▼
        ┌────────────────────────┐
        │  OTEL Collector        │
        │  ┌──────────────────┐  │
        │  │ OTLP Receiver    │  │
        │  │ Host Metrics     │  │
        │  │ Journald         │  │
        │  └──────────────────┘  │
        └──────────┬─────────────┘
                   │ HTTP POST
                   ▼
        ┌────────────────────────┐
        │ Galatea Ingest API     │
        │ /api/observation/ingest│
        └────────────────────────┘
```

---

## 8. Action Items

**Immediate (This Week)**:
1. [ ] Install OTEL Collector Contrib
2. [ ] Install ActivityWatch (desktop + browser)
3. [ ] Update Claude Code hooks for subagent tracking

**Next Week**:
4. [ ] Build ActivityWatch → OTLP bridge
5. [ ] Test end-to-end observation flow
6. [ ] Implement Galatea ingest API endpoint

**Later (Optional)**:
7. [ ] Build Discord bot if social context needed

---

## 9. References

**Research Reports**:
- [research/2026-02-06-existing-solutions-research.md](../research/2026-02-06-existing-solutions-research.md)
- [research/2026-02-06-otel-vs-mqtt-comparison.md](../research/2026-02-06-otel-vs-mqtt-comparison.md)

**External Links**:
- [OpenTelemetry Collector Contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- [ActivityWatch](https://activitywatch.net/)
- [aw-watcher-web](https://github.com/ActivityWatch/aw-watcher-web)

---

**Status**: Ready for implementation with significantly reduced effort
**Updated**: 2026-02-06
