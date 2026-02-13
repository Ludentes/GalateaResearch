# Galatea Observation Pipeline

**Date**: 2026-02-06 (Updated)
**Status**: OTEL-First Architecture
**Purpose**: Define how Galatea observes, enriches, validates, and learns from user activity

---

## Vision

Galatea is an **active companion**, not a passive logger. It:

1. **Asks** about your plans at the start of the day
2. **Observes** your activity across browser, terminal, IDE, Claude Code
3. **Guesses** what you're trying to accomplish
4. **Validates** guesses through natural dialogue
5. **Learns** from validated observations
6. **Summarizes** your day and asks for corrections

The goal is to transform noisy raw activity into rich, validated memories through natural interaction.

## Architectural Decision: OpenTelemetry as Unified Backbone

**2026-02-06 Update**: After comprehensive analysis (see [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md)), we've adopted **OpenTelemetry (OTEL) as the unified observation backbone**.

**Why OTEL?**
- **Claude Code has native OTEL support** (hooks, telemetry)
- **Single unified interface** for pipeline code (only consumes OTEL events)
- **Infrastructure-level bridging** (OTEL Collector MQTT receiver for Home Assistant/Frigate)
- **Extensible** (add sources by emitting OTEL)
- **Ecosystem integration** (Langfuse, Jaeger for debugging)

**MQTT Role**: Home Assistant and Frigate keep using MQTT (they're MQTT-native), but the OTEL Collector bridges MQTT→OTEL at infrastructure level. Your pipeline code never touches MQTT.

See detailed implementation docs: [observation-pipeline/](./observation-pipeline/)

---

## Pipeline Architecture (OTEL-First)

```
┌─────────────────────────────────────────────────────────────────┐
│   LAYER 0: ACTIVITY SOURCES (Emit OTEL Events)                 │
├─────────────────────────────────────────────────────────────────┤
│  Primary (Native OTEL):                                         │
│  ├─ Claude Code (hooks → OTEL)                                  │
│  ├─ VSCode (extension → OTEL)                                   │
│  ├─ Browser (extension → OTEL)                                  │
│  ├─ Linux Activity (systemd → OTEL)                            │
│  └─ Discord (bot → OTEL, optional)                             │
│                                                                 │
│  Secondary (MQTT → OTEL Bridge):                                │
│  ├─ Home Assistant (MQTT)                                       │
│  └─ Frigate NVR (MQTT)                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ OTLP (OpenTelemetry Protocol)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   OPENTELEMETRY COLLECTOR (Infrastructure Layer)                │
├─────────────────────────────────────────────────────────────────┤
│  Receivers: OTLP + MQTT                                         │
│  Processors: Filter (noise), Transform (normalize), Batch       │
│  Exporters: HTTP (Galatea API) + File (debug/replay)           │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST (unified OTEL format)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   LAYER 1: ACTIVITY INGESTION (Galatea API)                    │
│   POST /api/observation/ingest                                  │
│   Single interface consuming OTEL events                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   LAYER 2: ENRICHMENT                                           │
│   Group events, guess intent, compute confidence                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   LAYER 3: DIALOGUE                                             │
│   Validate guesses, ask learning questions, check in            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   LAYER 4: MEMORY FORMATION (Graphiti + FalkorDB)              │
│   Store validated knowledge as episodic/semantic/procedural     │
└─────────────────────────────────────────────────────────────────┘
```

**Key Change**: Added OTEL Collector as infrastructure layer that unifies all sources into single OTEL format before Galatea processes them.

---

## Layer 0: Activity Sources (OTEL Emitters)

### Purpose
Capture user activity from all sources and emit standardized OTEL events.

### Activity Sources

| Source | Events Captured | Implementation | Priority | Doc |
|--------|----------------|----------------|----------|-----|
| **Claude Code** | Prompts, tool usage, file context | Native OTEL hooks | **HIGH** | [01-claude-code-otel.md](./observation-pipeline/01-claude-code-otel.md) |
| **VSCode** | Files opened/saved, debug sessions, git operations | VSCode extension → OTEL | **HIGH** | [02-vscode-otel.md](./observation-pipeline/02-vscode-otel.md) |
| **Browser** | Sites visited, searches, time on page | Browser extension → OTEL | **HIGH** | [05-browser-otel.md](./observation-pipeline/05-browser-otel.md) |
| **Linux Activity** | App launches, window focus, system sleep/wake | systemd/X11 → OTEL | **MEDIUM** | [03-linux-activity-otel.md](./observation-pipeline/03-linux-activity-otel.md) |
| **Home Assistant** | State changes (doors, lights, motion sensors) | MQTT → OTEL Collector | **MEDIUM** | [06-mqtt-to-otel-bridge.md](./observation-pipeline/06-mqtt-to-otel-bridge.md) |
| **Frigate NVR** | Person/vehicle detections from cameras | MQTT → OTEL Collector | **MEDIUM** | [06-mqtt-to-otel-bridge.md](./observation-pipeline/06-mqtt-to-otel-bridge.md) |
| **Discord** | Messages sent (metadata), voice chat | Discord bot → OTEL | **LOW** | [04-discord-otel.md](./observation-pipeline/04-discord-otel.md) |
| **Manual** | User explicitly tells Galatea something | Chat interface | **HIGH** | Built-in |

**See**: [observation-pipeline/00-architecture-overview.md](./observation-pipeline/00-architecture-overview.md) for complete architecture.

### OTEL Event Format

All sources emit standardized OpenTelemetry events (OTLP format):

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
        "body": { "stringValue": "Add JWT auth to API" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "claude_code_prompt" }},
          { "key": "claude_code.working_directory", "value": { "stringValue": "/home/user/project" }},
          { "key": "session.id", "value": { "stringValue": "abc123" }}
        ]
      }]
    }]
  }]
}
```

**Standard Attributes** (all events):
- `service.name`: Always "galatea-observer"
- `source.type`: Source identifier (`claude_code`, `vscode`, `browser`, etc.)
- `activity.type`: Specific event type (`claude_code_prompt`, `vscode_file_open`, etc.)
- `session.id`: Galatea session ID

**Source-specific attributes** are namespaced (e.g., `claude_code.*`, `vscode.*`, `browser.*`).

### Internal Storage (After Ingestion)

After OTEL events are ingested, they're stored internally:

```typescript
// Internal activity record (PostgreSQL via Drizzle)
interface ActivityRecord {
  id: string;
  sessionId: string;

  // From OTEL
  source: string;              // From source.type
  activityType: string;        // From activity.type
  body: string;                // Human-readable summary
  attributes: Record<string, any>;  // All OTEL attributes

  // Timing
  timestamp: Date;
  duration?: number;

  // Processing
  processed: boolean;
  activitySessionId?: string;
}
```

### Event Types by Source

**Browser Events:**
```typescript
interface BrowserActivity {
  eventType: "tab_active" | "search" | "page_load";
  summary: string;  // "Viewing: JWT best practices - Stack Overflow"
  details: {
    domain: string;       // "stackoverflow.com"
    title: string;        // "JWT best practices"
    searchQuery?: string; // For search events
  };
}
```

**Terminal Events:**
```typescript
interface TerminalActivity {
  eventType: "command" | "error" | "output";
  summary: string;  // "Ran: npm test -- auth (failed)"
  details: {
    command: string;
    exitCode: number;
    workingDirectory: string;
    outputSummary?: string;  // Truncated, key lines only
  };
}
```

**VSCode Events:**
```typescript
interface VSCodeActivity {
  eventType: "file_open" | "file_save" | "file_close" | "debug_start" | "debug_end";
  summary: string;  // "Opened: src/auth/tokenService.ts"
  details: {
    filePath: string;
    language?: string;
    linesChanged?: number;  // For saves
  };
}
```

**MQTT Events (Home Assistant / Frigate):**
```typescript
interface MQTTActivity {
  eventType: "state_change" | "frigate_detection" | "device_event";
  summary: string;  // "Front door opened" or "Person detected in driveway"
  details: {
    topic: string;           // MQTT topic
    entityId?: string;       // Home Assistant entity ID
    oldState?: string;       // For state changes
    newState?: string;
    detectionType?: string;  // For Frigate: person, car, dog, etc.
    camera?: string;         // For Frigate
    confidence?: number;     // For Frigate
  };
}
```

**Manual Events:**
```typescript
interface ManualActivity {
  eventType: "user_statement" | "goal_set" | "correction";
  summary: string;  // User's own words
  details: {
    originalMessage: string;
    context?: string;
  };
}
```

### OTEL-Based Implementations

**See detailed implementation guides**: [observation-pipeline/](./observation-pipeline/)

#### Quick Overview

**Claude Code** (PRIORITY 1):
```bash
# Create OTEL hook in ~/.claude/hooks/otel-prompt-observer.sh
# Emits OTEL events on user prompts, tool usage
# See: observation-pipeline/01-claude-code-otel.md
```

**Browser** (PRIORITY 1):
```javascript
// Chrome/Firefox extension
// Tracks tabs, searches, page visits → emits OTEL
// See: observation-pipeline/05-browser-otel.md
```

**VSCode** (PRIORITY 2):
```typescript
// VSCode extension
// Tracks files opened/saved, debug sessions → emits OTEL
// See: observation-pipeline/02-vscode-otel.md
```

**OTEL Collector** (Infrastructure):
```yaml
# otel-collector-config.yaml
receivers:
  otlp:  # For Claude Code, VSCode, Browser
  mqtt:  # For Home Assistant, Frigate

processors:
  filter:  # Remove noise
  transform:  # Normalize formats

exporters:
  otlphttp:
    endpoint: http://galatea:3000/api/observation/ingest
```

---

### Legacy Approaches (Pre-OTEL, Archived)

#### Option A: ActivityWatch Integration (Deprecated)

ActivityWatch is open-source and already captures window/browser activity.

```typescript
// convex/actions/activitywatch.ts

import { internalAction } from "../_generated/server";

export const syncActivityWatch = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get events since last sync
    const lastSync = await ctx.runQuery(internal.activities.getLastSyncTime, {
      sessionId: args.sessionId,
      source: "activitywatch",
    });

    // Fetch from ActivityWatch API
    const buckets = ["aw-watcher-window", "aw-watcher-web"];

    for (const bucket of buckets) {
      const events = await fetch(
        `http://localhost:5600/api/0/buckets/${bucket}/events?start=${lastSync}`
      ).then(r => r.json());

      for (const event of events) {
        await ctx.runMutation(internal.activities.create, {
          sessionId: args.sessionId,
          source: "activitywatch",
          eventType: bucket.includes("web") ? "tab_active" : "window_active",
          summary: `${event.data.app}: ${event.data.title}`,
          details: event.data,
          timestamp: new Date(event.timestamp).getTime(),
          duration: event.duration * 1000,
          processed: false,
        });
      }
    }
  },
});

// Schedule sync every 30 seconds
// In convex/crons.ts:
// crons.interval("sync-activitywatch", { seconds: 30 }, internal.activitywatch.syncActivityWatch)
```

#### Option B: Browser Extension

```typescript
// browser-extension/background.ts

const GALATEA_API = "https://your-convex.cloud/api/activity";

// Track tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab.url) return;

  await reportActivity({
    source: "browser",
    eventType: "tab_active",
    summary: `Viewing: ${tab.title}`,
    details: {
      domain: new URL(tab.url).hostname,
      title: tab.title,
    },
  });
});

// Track searches (Google, etc.)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  const url = new URL(details.url);

  // Detect search queries
  const searchParams = ["q", "query", "search", "p"];
  for (const param of searchParams) {
    const query = url.searchParams.get(param);
    if (query) {
      await reportActivity({
        source: "browser",
        eventType: "search",
        summary: `Searched: ${query}`,
        details: {
          domain: url.hostname,
          searchQuery: query,
        },
      });
      break;
    }
  }
});

async function reportActivity(activity: Activity) {
  const sessionId = await getActiveSessionId();
  if (!sessionId) return;

  await fetch(GALATEA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...activity,
      sessionId,
      timestamp: Date.now(),
    }),
  });
}
```

#### Option C: VSCode Extension

```typescript
// vscode-extension/src/extension.ts

import * as vscode from 'vscode';

const GALATEA_API = "https://your-convex.cloud/api/activity";

export function activate(context: vscode.ExtensionContext) {
  // File open
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;

      await reportActivity({
        source: "vscode",
        eventType: "file_open",
        summary: `Opened: ${getRelativePath(editor.document.fileName)}`,
        details: {
          filePath: editor.document.fileName,
          language: editor.document.languageId,
        },
      });
    })
  );

  // File save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      await reportActivity({
        source: "vscode",
        eventType: "file_save",
        summary: `Saved: ${getRelativePath(doc.fileName)}`,
        details: {
          filePath: doc.fileName,
          language: doc.languageId,
        },
      });
    })
  );

  // Debug sessions
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      await reportActivity({
        source: "vscode",
        eventType: "debug_start",
        summary: `Started debugging: ${session.name}`,
        details: {
          sessionName: session.name,
          type: session.type,
        },
      });
    })
  );
}

function getRelativePath(fullPath: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return fullPath.replace(workspaceFolder.uri.fsPath, "");
  }
  return fullPath.split("/").slice(-2).join("/");
}
```

#### Option D: MQTT Subscriber (Home Assistant / Frigate)

```typescript
// server/integrations/mqtt.ts

import mqtt from 'mqtt';
import { db } from '../db';
import { activities } from '../db/schema';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

export function startMQTTSubscriber(sessionId: string) {
  const client = mqtt.connect(MQTT_BROKER);

  client.on('connect', () => {
    // Subscribe to Home Assistant state changes
    client.subscribe('homeassistant/+/+/state');

    // Subscribe to Frigate events
    client.subscribe('frigate/events');
    client.subscribe('frigate/+/person');
    client.subscribe('frigate/+/car');

    console.log('MQTT subscriber connected');
  });

  client.on('message', async (topic, message) => {
    const payload = JSON.parse(message.toString());

    // Frigate detection
    if (topic.startsWith('frigate/')) {
      const camera = topic.split('/')[1];
      const detectionType = topic.split('/')[2] || payload.type;

      await db.insert(activities).values({
        id: crypto.randomUUID(),
        sessionId,
        source: 'mqtt',
        eventType: 'frigate_detection',
        summary: `${detectionType} detected on ${camera}`,
        details: {
          topic,
          camera,
          detectionType,
          confidence: payload.score,
          timestamp: payload.timestamp,
        },
        timestamp: Date.now(),
        processed: false,
      });
    }

    // Home Assistant state change
    if (topic.startsWith('homeassistant/')) {
      const [, domain, entityId] = topic.split('/');

      await db.insert(activities).values({
        id: crypto.randomUUID(),
        sessionId,
        source: 'mqtt',
        eventType: 'state_change',
        summary: `${entityId}: ${payload.state}`,
        details: {
          topic,
          entityId: `${domain}.${entityId}`,
          newState: payload.state,
          attributes: payload.attributes,
        },
        timestamp: Date.now(),
        processed: false,
      });
    }
  });

  return client;
}
```

#### Option E: Shell Wrapper

```bash
# Add to ~/.bashrc or ~/.zshrc

galatea_wrap() {
  local cmd="$@"
  local start_time=$(date +%s%3N)

  # Execute command, capture output and exit code
  local output
  output=$("$@" 2>&1)
  local exit_code=$?
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Report to Galatea (async, don't block shell)
  (curl -s -X POST "$GALATEA_API/activity" \
    -H "Content-Type: application/json" \
    -d "{
      \"source\": \"terminal\",
      \"eventType\": \"command\",
      \"summary\": \"Ran: $cmd $([ $exit_code -eq 0 ] && echo '(success)' || echo '(failed)')\",
      \"details\": {
        \"command\": \"$cmd\",
        \"exitCode\": $exit_code,
        \"workingDirectory\": \"$(pwd)\",
        \"duration\": $duration
      },
      \"timestamp\": $start_time
    }" &) 2>/dev/null

  # Print output and return exit code
  echo "$output"
  return $exit_code
}

# Alias common commands (or use as prefix)
# Usage: galatea_wrap npm test
# Or alias: alias npm='galatea_wrap npm'
```

### Filtering Rules

Not all activity is worth capturing. Apply filters:

```typescript
// convex/lib/activityFilters.ts

export function shouldCapture(activity: RawActivity): boolean {
  // Exclude noise
  if (activity.source === "browser") {
    const domain = activity.details?.domain;

    // Skip internal/utility pages
    if (domain?.includes("chrome://")) return false;
    if (domain?.includes("localhost:5600")) return false; // ActivityWatch UI

    // Skip very short visits (< 3 seconds)
    if (activity.duration && activity.duration < 3000) return false;
  }

  if (activity.source === "vscode") {
    const filePath = activity.details?.filePath;

    // Skip generated/build files
    if (filePath?.includes("node_modules")) return false;
    if (filePath?.includes(".git/")) return false;
    if (filePath?.includes("dist/")) return false;
    if (filePath?.includes(".next/")) return false;
  }

  if (activity.source === "terminal") {
    const cmd = activity.details?.command;

    // Skip navigation commands
    if (cmd === "ls" || cmd === "cd" || cmd === "pwd") return false;
    if (cmd?.startsWith("cd ")) return false;
  }

  return true;
}
```

---

## Layer 2: Enrichment

### Purpose
Group raw activities into sessions, guess user intent, and compute confidence.

### Data Schema

```typescript
// convex/schema.ts

activitySessions: defineTable({
  sessionId: v.id("sessions"),

  // Time bounds
  startTime: v.number(),
  endTime: v.optional(v.number()),

  // Activities in this session
  activityIds: v.array(v.id("activities")),

  // Intent (guessed and validated)
  guessedIntent: v.string(),
  guessedIntentConfidence: v.number(),  // 0.0 - 1.0
  validatedIntent: v.optional(v.string()),

  // Context
  relatedGoal: v.optional(v.string()),  // From daily plan
  tags: v.array(v.string()),

  // State
  status: v.union(
    v.literal("active"),      // Currently happening
    v.literal("paused"),      // User took a break
    v.literal("completed"),   // Finished
    v.literal("abandoned")    // Switched without completing
  ),

  // Validation state
  needsValidation: v.boolean(),
  validatedAt: v.optional(v.number()),
})
  .index("by_session", ["sessionId", "startTime"])
  .index("by_needs_validation", ["sessionId", "needsValidation"]),
```

### Enrichment Process

```typescript
// convex/actions/enrichment.ts

import { internalAction } from "../_generated/server";

export const processActivities = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get unprocessed activities
    const activities = await ctx.runQuery(internal.activities.getUnprocessed, {
      sessionId: args.sessionId,
      limit: 50,
    });

    if (activities.length === 0) return;

    // Get current activity session (if any)
    const currentSession = await ctx.runQuery(
      internal.activitySessions.getCurrent,
      { sessionId: args.sessionId }
    );

    // Get today's goals for context
    const dailyPlan = await ctx.runQuery(internal.dailyPlans.getToday, {
      sessionId: args.sessionId,
    });

    // Get recent memories for pattern matching
    const recentMemories = await ctx.runAction(internal.mem0.search, {
      sessionId: args.sessionId,
      query: activities.map(a => a.summary).join(" "),
      limit: 10,
    });

    // Ask LLM to enrich
    const enrichment = await generateText({
      model: claude("claude-sonnet-4"),
      system: ENRICHMENT_SYSTEM_PROMPT,
      prompt: `
## New Activities
${activities.map(a => `- [${a.source}] ${a.summary}`).join("\n")}

## Current Activity Session
${currentSession ? `Intent: ${currentSession.guessedIntent}` : "None active"}

## Today's Goals
${dailyPlan?.goals.map(g => `- ${g.description} (${g.status})`).join("\n") || "No goals set"}

## Relevant Memories
${recentMemories.map(m => `- ${m.content}`).join("\n") || "None"}

Analyze these activities and return JSON:
{
  "continueSession": boolean,  // Should these join current session?
  "newSessionReason": string | null,  // If starting new, why?
  "intent": string,  // What is user trying to accomplish?
  "confidence": number,  // 0.0 - 1.0
  "relatedGoal": string | null,  // Which daily goal, if any?
  "tags": string[],  // Relevant tags
  "needsValidation": boolean,  // Should we ask user to confirm?
  "validationQuestion": string | null  // If yes, what to ask?
}
`,
    });

    const result = JSON.parse(enrichment.text);

    if (result.continueSession && currentSession) {
      // Add activities to current session
      await ctx.runMutation(internal.activitySessions.addActivities, {
        id: currentSession._id,
        activityIds: activities.map(a => a._id),
        guessedIntent: result.intent,
        guessedIntentConfidence: result.confidence,
      });
    } else {
      // Create new activity session
      if (currentSession) {
        await ctx.runMutation(internal.activitySessions.complete, {
          id: currentSession._id,
        });
      }

      await ctx.runMutation(internal.activitySessions.create, {
        sessionId: args.sessionId,
        startTime: activities[0].timestamp,
        activityIds: activities.map(a => a._id),
        guessedIntent: result.intent,
        guessedIntentConfidence: result.confidence,
        relatedGoal: result.relatedGoal,
        tags: result.tags,
        status: "active",
        needsValidation: result.needsValidation,
      });
    }

    // Mark activities as processed
    for (const activity of activities) {
      await ctx.runMutation(internal.activities.markProcessed, {
        id: activity._id,
      });
    }

    // If validation needed, create dialogue
    if (result.needsValidation && result.validationQuestion) {
      await ctx.runMutation(internal.dialogues.create, {
        sessionId: args.sessionId,
        type: "validation",
        context: result.intent,
        message: result.validationQuestion,
        status: "pending",
        activitySessionId: currentSession?._id,
        createdAt: Date.now(),
      });
    }
  },
});

const ENRICHMENT_SYSTEM_PROMPT = `You are analyzing user activity to understand what they're working on.

Your job is to:
1. Group related activities into coherent "activity sessions"
2. Guess what the user is trying to accomplish (intent)
3. Assess your confidence in that guess
4. Decide if you should ask the user to validate your guess

Guidelines:
- A new activity session starts when the user switches to something unrelated
- High confidence (>0.8): Clear pattern, matches stated goals
- Medium confidence (0.5-0.8): Reasonable guess but could be wrong
- Low confidence (<0.5): Unclear, definitely ask for validation
- Always ask for validation on significant transitions (new project, new goal)
- Don't ask too often - only when genuinely uncertain or important

Be concise in your intents. Good: "Fixing JWT auth bug on mobile"
Bad: "The user appears to be working on some kind of authentication-related issue"`;
```

### Session Boundary Detection

```typescript
// convex/lib/sessionBoundaries.ts

export function detectSessionBoundary(
  previousActivities: Activity[],
  newActivity: Activity
): { isBoundary: boolean; reason?: string } {
  const lastActivity = previousActivities[previousActivities.length - 1];
  if (!lastActivity) return { isBoundary: false };

  // Time gap > 30 minutes = new session
  const timeGap = newActivity.timestamp - lastActivity.timestamp;
  if (timeGap > 30 * 60 * 1000) {
    return { isBoundary: true, reason: "time_gap" };
  }

  // Different project/repo = likely new session
  if (newActivity.source === "vscode" && lastActivity.source === "vscode") {
    const newProject = getProjectFromPath(newActivity.details?.filePath);
    const lastProject = getProjectFromPath(lastActivity.details?.filePath);
    if (newProject !== lastProject) {
      return { isBoundary: true, reason: "project_switch" };
    }
  }

  // Context switch indicators
  const contextSwitchPatterns = [
    /pull request/i,
    /pr review/i,
    /meeting/i,
    /slack/i,
    /email/i,
  ];

  const newSummary = newActivity.summary.toLowerCase();
  for (const pattern of contextSwitchPatterns) {
    if (pattern.test(newSummary)) {
      return { isBoundary: true, reason: "context_switch" };
    }
  }

  return { isBoundary: false };
}
```

---

## Layer 3: Dialogue

### Purpose
Validate guesses, ask learning questions, and check in with user naturally.

### Data Schema

```typescript
// convex/schema.ts

dialogues: defineTable({
  sessionId: v.id("sessions"),

  // Type of dialogue
  type: v.union(
    v.literal("morning_plan"),      // "What's the plan for today?"
    v.literal("validation"),        // "Is this what you're working on?"
    v.literal("learning"),          // "Why did you do X?"
    v.literal("check_in"),          // "How's it going?"
    v.literal("proactive_offer"),   // "Want help with...?"
    v.literal("evening_summary"),   // "Here's what I saw today"
    v.literal("correction")         // User correcting the agent
  ),

  // Content
  context: v.string(),              // What triggered this dialogue
  message: v.string(),              // Agent's message

  // Response
  response: v.optional(v.string()), // User's response
  responseTimestamp: v.optional(v.number()),

  // State
  status: v.union(
    v.literal("pending"),
    v.literal("delivered"),         // Shown to user
    v.literal("answered"),
    v.literal("dismissed"),
    v.literal("expired")
  ),

  // Links
  activitySessionId: v.optional(v.id("activitySessions")),
  dailyPlanId: v.optional(v.id("dailyPlans")),

  // Metadata
  priority: v.number(),             // 1-5, higher = more important
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
})
  .index("by_session_status", ["sessionId", "status", "priority"])
  .index("by_type", ["sessionId", "type", "createdAt"]),
```

### Dialogue Types

#### 1. Morning Plan

```typescript
// convex/actions/dailyRituals.ts

export const startDay = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get yesterday's summary
    const yesterday = await ctx.runQuery(internal.dailyPlans.getYesterday, {
      sessionId: args.sessionId,
    });

    // Get incomplete goals
    const incompleteGoals = yesterday?.goals
      .filter(g => g.status !== "completed")
      .map(g => g.description) || [];

    // Generate morning message
    let message = "Good morning! ";

    if (yesterday) {
      message += `Yesterday you worked on: ${yesterday.eveningSummary || "various tasks"}. `;
    }

    if (incompleteGoals.length > 0) {
      message += `Carried over from yesterday: ${incompleteGoals.join(", ")}. `;
    }

    message += "What's the plan for today?";

    // Create dialogue
    await ctx.runMutation(internal.dialogues.create, {
      sessionId: args.sessionId,
      type: "morning_plan",
      context: "Start of day",
      message,
      status: "pending",
      priority: 5,
      createdAt: Date.now(),
    });

    // Create empty daily plan
    await ctx.runMutation(internal.dailyPlans.create, {
      sessionId: args.sessionId,
      date: new Date().toISOString().split("T")[0],
      goals: [],
      morningMessage: null,
    });
  },
});

export const handleMorningResponse = internalAction({
  args: {
    dialogueId: v.id("dialogues"),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const dialogue = await ctx.runQuery(internal.dialogues.get, {
      id: args.dialogueId,
    });

    // Parse goals from response
    const extraction = await generateText({
      model: claude("claude-sonnet-4"),
      prompt: `Extract goals from this morning plan statement:

"${args.response}"

Return JSON array of goals:
[
  { "description": "string", "priority": "high" | "medium" | "low" }
]`,
    });

    const goals = JSON.parse(extraction.text);

    // Update daily plan
    await ctx.runMutation(internal.dailyPlans.update, {
      sessionId: dialogue.sessionId,
      date: new Date().toISOString().split("T")[0],
      morningMessage: args.response,
      goals: goals.map(g => ({
        description: g.description,
        status: "planned",
        priority: g.priority,
      })),
    });

    // Mark dialogue as answered
    await ctx.runMutation(internal.dialogues.answer, {
      id: args.dialogueId,
      response: args.response,
    });

    // Send confirmation
    const goalList = goals.map(g => g.description).join(", ");
    return `Got it! Today's goals: ${goalList}. I'll keep an eye on things and learn as you work. Let me know if you need help!`;
  },
});
```

#### 2. Validation Dialogue

```typescript
// convex/actions/validation.ts

export const createValidationDialogue = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    activitySessionId: v.id("activitySessions"),
    guessedIntent: v.string(),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    // Generate natural validation question
    let message: string;

    if (args.confidence < 0.5) {
      // Low confidence - open question
      message = `I'm not quite sure what you're working on now. Can you tell me briefly?`;
    } else if (args.confidence < 0.8) {
      // Medium confidence - yes/no with guess
      message = `Looks like you're working on ${args.guessedIntent}. Is that right?`;
    } else {
      // High confidence - just checking on transitions
      message = `I see you've switched to ${args.guessedIntent}. Is the previous task done, or just pausing?`;
    }

    await ctx.db.insert("dialogues", {
      sessionId: args.sessionId,
      type: "validation",
      context: args.guessedIntent,
      message,
      status: "pending",
      priority: args.confidence < 0.5 ? 4 : 3,
      activitySessionId: args.activitySessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
    });
  },
});

export const handleValidationResponse = internalAction({
  args: {
    dialogueId: v.id("dialogues"),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const dialogue = await ctx.runQuery(internal.dialogues.get, {
      id: args.dialogueId,
    });

    // Interpret response
    const interpretation = await generateText({
      model: claude("claude-haiku-3"),  // Fast, cheap for simple task
      prompt: `The agent guessed: "${dialogue.context}"
User responded: "${args.response}"

Return JSON:
{
  "confirmed": boolean,  // Did user confirm the guess?
  "correctedIntent": string | null,  // If not confirmed, what's the correct intent?
  "additionalInfo": string | null  // Any extra context provided?
}`,
    });

    const result = JSON.parse(interpretation.text);

    // Update activity session
    if (dialogue.activitySessionId) {
      await ctx.runMutation(internal.activitySessions.validate, {
        id: dialogue.activitySessionId,
        validatedIntent: result.confirmed ? dialogue.context : result.correctedIntent,
        validatedAt: Date.now(),
      });
    }

    // Mark dialogue as answered
    await ctx.runMutation(internal.dialogues.answer, {
      id: args.dialogueId,
      response: args.response,
    });

    // If user provided additional info, store as memory
    if (result.additionalInfo) {
      await ctx.runMutation(internal.memories.create, {
        sessionId: dialogue.sessionId,
        type: "semantic",
        content: result.additionalInfo,
        metadata: {
          timestamp: Date.now(),
          confidence: 1.0,  // User stated directly
          tags: ["user_stated"],
          source: "user_stated",
          dialogueId: args.dialogueId,
        },
      });
    }

    // Acknowledge
    if (result.confirmed) {
      return "Got it, thanks!";
    } else {
      return `Ah, ${result.correctedIntent}. Got it, I'll remember that!`;
    }
  },
});
```

#### 3. Learning Dialogue

```typescript
// convex/actions/learning.ts

export const evaluateForLearning = internalAction({
  args: { activitySessionId: v.id("activitySessions") },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.activitySessions.get, {
      id: args.activitySessionId,
    });

    const activities = await ctx.runQuery(internal.activities.getByIds, {
      ids: session.activityIds,
    });

    const memories = await ctx.runAction(internal.mem0.search, {
      sessionId: session.sessionId,
      query: session.validatedIntent || session.guessedIntent,
      limit: 10,
    });

    // Ask LLM if there's something worth learning about
    const analysis = await generateText({
      model: claude("claude-sonnet-4"),
      system: LEARNING_ANALYSIS_PROMPT,
      prompt: `
## Activity Session
Intent: ${session.validatedIntent || session.guessedIntent}

## Activities
${activities.map(a => `- ${a.summary}`).join("\n")}

## What I Already Know
${memories.map(m => `- ${m.content}`).join("\n") || "Nothing relevant"}

Is there something here worth learning? Return JSON:
{
  "shouldAsk": boolean,
  "trigger": "first_occurrence" | "pattern_deviation" | "decision_point" | "error_recovery" | "implicit_knowledge" | null,
  "question": string | null,
  "context": string,
  "priority": 1-5
}`,
    });

    const result = JSON.parse(analysis.text);

    if (result.shouldAsk) {
      await ctx.runMutation(internal.dialogues.create, {
        sessionId: session.sessionId,
        type: "learning",
        context: result.context,
        message: result.question,
        status: "pending",
        priority: result.priority,
        activitySessionId: args.activitySessionId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      });
    }
  },
});

const LEARNING_ANALYSIS_PROMPT = `You are identifying learning opportunities from user activity.

Triggers for asking questions:
1. FIRST_OCCURRENCE: User did something you haven't seen before
2. PATTERN_DEVIATION: User did something differently than usual
3. DECISION_POINT: User chose one approach over alternatives - why?
4. ERROR_RECOVERY: User encountered an error and fixed it - what was the issue?
5. IMPLICIT_KNOWLEDGE: User seems to know something you don't

Guidelines:
- Only ask if the answer would genuinely help you assist better in the future
- Be specific - not "why did you do that?" but "why 24h expiration vs 1h?"
- Prioritize questions about recurring tasks, not one-off actions
- Don't ask about trivial choices (formatting, naming) unless pattern`;
```

#### 4. Evening Summary

```typescript
// convex/actions/dailyRituals.ts

export const endDay = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get today's activity sessions
    const activitySessions = await ctx.runQuery(
      internal.activitySessions.getToday,
      { sessionId: args.sessionId }
    );

    // Get today's goals
    const dailyPlan = await ctx.runQuery(internal.dailyPlans.getToday, {
      sessionId: args.sessionId,
    });

    // Generate summary
    const summary = await generateText({
      model: claude("claude-sonnet-4"),
      prompt: `
## Today's Goals
${dailyPlan?.goals.map(g => `- ${g.description} (${g.status})`).join("\n") || "No goals set"}

## Activity Sessions
${activitySessions.map(s => `
### ${s.validatedIntent || s.guessedIntent}
- Duration: ${formatDuration(s.endTime - s.startTime)}
- Status: ${s.status}
`).join("\n")}

Generate a friendly end-of-day summary. Include:
1. What was accomplished
2. What's still in progress
3. Any patterns you noticed

Keep it concise (3-5 bullet points).`,
    });

    // Create dialogue
    await ctx.runMutation(internal.dialogues.create, {
      sessionId: args.sessionId,
      type: "evening_summary",
      context: "End of day",
      message: `Here's what I observed today:\n\n${summary.text}\n\nAnything I got wrong or should remember?`,
      status: "pending",
      priority: 4,
      dailyPlanId: dailyPlan?._id,
      createdAt: Date.now(),
    });
  },
});

export const handleEveningResponse = internalAction({
  args: {
    dialogueId: v.id("dialogues"),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const dialogue = await ctx.runQuery(internal.dialogues.get, {
      id: args.dialogueId,
    });

    // Check if user provided corrections or additional info
    const analysis = await generateText({
      model: claude("claude-sonnet-4"),
      prompt: `Agent provided end-of-day summary. User responded:
"${args.response}"

Extract any:
1. Corrections to what the agent said
2. Additional information to remember
3. Feedback about the summary

Return JSON:
{
  "corrections": string[],
  "newInfo": string[],
  "feedback": string | null,
  "isConfirmation": boolean  // Just "looks good" / "that's right"
}`,
    });

    const result = JSON.parse(analysis.text);

    // Store corrections and new info as memories
    for (const correction of result.corrections) {
      await ctx.runMutation(internal.memories.create, {
        sessionId: dialogue.sessionId,
        type: "semantic",
        content: correction,
        metadata: {
          timestamp: Date.now(),
          confidence: 1.0,
          tags: ["correction", "user_stated"],
          source: "user_stated",
          dialogueId: args.dialogueId,
        },
      });
    }

    for (const info of result.newInfo) {
      await ctx.runMutation(internal.memories.create, {
        sessionId: dialogue.sessionId,
        type: "semantic",
        content: info,
        metadata: {
          timestamp: Date.now(),
          confidence: 1.0,
          tags: ["user_stated"],
          source: "user_stated",
          dialogueId: args.dialogueId,
        },
      });
    }

    // Update daily plan with evening feedback
    if (dialogue.dailyPlanId) {
      await ctx.runMutation(internal.dailyPlans.update, {
        id: dialogue.dailyPlanId,
        eveningFeedback: args.response,
      });
    }

    // Mark dialogue as answered
    await ctx.runMutation(internal.dialogues.answer, {
      id: args.dialogueId,
      response: args.response,
    });

    // Respond
    if (result.isConfirmation) {
      return "Great, see you tomorrow!";
    } else if (result.corrections.length > 0 || result.newInfo.length > 0) {
      return "Got it, I've updated my notes. Thanks for the corrections! See you tomorrow!";
    } else {
      return "Thanks for the feedback! See you tomorrow!";
    }
  },
});
```

### Dialogue Delivery

```typescript
// convex/dialogues.ts

export const getNextDialogue = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get pending dialogues, sorted by priority
    const dialogues = await ctx.db
      .query("dialogues")
      .withIndex("by_session_status", q =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .order("desc")  // Higher priority first
      .take(5);

    // Filter expired
    const now = Date.now();
    const valid = dialogues.filter(d => !d.expiresAt || d.expiresAt > now);

    // Return highest priority non-expired
    return valid[0] || null;
  },
});

// Rate limiting - don't ask too often
export const canAskDialogue = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const recentDialogues = await ctx.db
      .query("dialogues")
      .withIndex("by_session_status", q =>
        q.eq("sessionId", args.sessionId)
      )
      .filter(q => q.gte(q.field("createdAt"), Date.now() - 60 * 60 * 1000))
      .collect();

    // Max 5 dialogues per hour (excluding morning/evening rituals)
    const nonRitual = recentDialogues.filter(d =>
      d.type !== "morning_plan" && d.type !== "evening_summary"
    );

    return nonRitual.length < 5;
  },
});
```

### UI Integration

```typescript
// src/components/DialogueWidget.tsx

import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export function DialogueWidget({ sessionId }: { sessionId: Id<"sessions"> }) {
  const nextDialogue = useQuery(api.dialogues.getNextDialogue, { sessionId });
  const answerDialogue = useMutation(api.dialogues.answer);
  const [response, setResponse] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Show notification when new dialogue arrives
  useEffect(() => {
    if (nextDialogue && nextDialogue.status === "pending") {
      setIsOpen(true);
    }
  }, [nextDialogue?._id]);

  if (!nextDialogue) return null;

  return (
    <div className={`dialogue-widget ${isOpen ? 'open' : 'minimized'}`}>
      {isOpen ? (
        <div className="dialogue-content">
          <div className="dialogue-header">
            <span className="dialogue-type">{getTypeEmoji(nextDialogue.type)}</span>
            <button onClick={() => setIsOpen(false)}>Minimize</button>
          </div>

          <div className="dialogue-message">
            {nextDialogue.message}
          </div>

          <div className="dialogue-response">
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="Your response..."
            />
            <div className="dialogue-actions">
              <button
                onClick={async () => {
                  await answerDialogue({
                    dialogueId: nextDialogue._id,
                    response,
                  });
                  setResponse("");
                  setIsOpen(false);
                }}
              >
                Send
              </button>
              <button
                onClick={async () => {
                  await answerDialogue({
                    dialogueId: nextDialogue._id,
                    response: "[dismissed]",
                  });
                  setIsOpen(false);
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          className="dialogue-notification"
          onClick={() => setIsOpen(true)}
        >
          🤔 Galatea has a question
        </button>
      )}
    </div>
  );
}

function getTypeEmoji(type: string): string {
  switch (type) {
    case "morning_plan": return "☀️";
    case "validation": return "🤔";
    case "learning": return "💡";
    case "check_in": return "👋";
    case "proactive_offer": return "🤝";
    case "evening_summary": return "🌙";
    default: return "💬";
  }
}
```

---

## Layer 4: Memory Formation

### Purpose
Transform validated observations and dialogue responses into persistent memories.

### Memory Types

| Type | What It Stores | Example |
|------|---------------|---------|
| **Episodic** | What happened, when, context | "Feb 2: Fixed mobile auth bug, took 3 hours, was frustrating" |
| **Semantic** | Facts, knowledge, patterns | "JWT access tokens should be 24h, refresh tokens 7d" |
| **Procedural** | How to do things | "When debugging mobile auth: check Sentry, test in simulator" |

### Data Schema

```typescript
// convex/schema.ts

memories: defineTable({
  sessionId: v.id("sessions"),

  // Memory type
  type: v.union(
    v.literal("episodic"),
    v.literal("semantic"),
    v.literal("procedural")
  ),

  // Content
  content: v.string(),

  // Metadata
  metadata: v.object({
    timestamp: v.number(),
    confidence: v.number(),  // 0.0 - 1.0
    tags: v.array(v.string()),

    // How was this memory formed?
    source: v.union(
      v.literal("observation"),     // Inferred from activity
      v.literal("dialogue"),        // From Q&A
      v.literal("user_stated"),     // User explicitly said
      v.literal("daily_summary"),   // From end-of-day review
      v.literal("correction")       // User corrected something
    ),

    // Links to sources
    dialogueId: v.optional(v.id("dialogues")),
    activitySessionId: v.optional(v.id("activitySessions")),
    dailyPlanId: v.optional(v.id("dailyPlans")),

    // For procedural memories
    trigger: v.optional(v.string()),   // "When X happens..."
    action: v.optional(v.string()),    // "Do Y..."
    reason: v.optional(v.string()),    // "Because Z..."
  }),

  // Mem0 integration
  mem0Id: v.optional(v.string()),

  // Lifecycle
  createdAt: v.number(),
  lastAccessedAt: v.optional(v.number()),
  accessCount: v.number(),
})
  .index("by_session_type", ["sessionId", "type"])
  .index("by_tags", ["sessionId", "metadata.tags"])
  .searchIndex("search_content", { searchField: "content" }),
```

### Memory Formation Process

```typescript
// convex/actions/memoryFormation.ts

export const formMemoriesFromDialogue = internalAction({
  args: { dialogueId: v.id("dialogues") },
  handler: async (ctx, args) => {
    const dialogue = await ctx.runQuery(internal.dialogues.get, {
      id: args.dialogueId,
    });

    if (!dialogue.response) return;

    // Get activity context if available
    let activityContext = "";
    if (dialogue.activitySessionId) {
      const session = await ctx.runQuery(internal.activitySessions.get, {
        id: dialogue.activitySessionId,
      });
      activityContext = `Activity: ${session.validatedIntent || session.guessedIntent}`;
    }

    // Extract memories
    const extraction = await generateText({
      model: claude("claude-sonnet-4"),
      system: MEMORY_EXTRACTION_PROMPT,
      prompt: `
## Dialogue Type
${dialogue.type}

## Context
${dialogue.context}
${activityContext}

## Agent Asked
${dialogue.message}

## User Responded
${dialogue.response}

Extract memories from this exchange.`,
    });

    const memories = JSON.parse(extraction.text);

    // Store each memory
    for (const memory of memories) {
      const memoryId = await ctx.runMutation(internal.memories.create, {
        sessionId: dialogue.sessionId,
        type: memory.type,
        content: memory.content,
        metadata: {
          timestamp: Date.now(),
          confidence: memory.confidence,
          tags: memory.tags,
          source: "dialogue",
          dialogueId: args.dialogueId,
          activitySessionId: dialogue.activitySessionId,
          trigger: memory.trigger,
          action: memory.action,
          reason: memory.reason,
        },
        createdAt: Date.now(),
        accessCount: 0,
      });

      // Sync to Mem0
      await ctx.runAction(internal.mem0.add, {
        memoryId,
        content: memory.content,
        metadata: {
          type: memory.type,
          tags: memory.tags,
        },
      });
    }
  },
});

const MEMORY_EXTRACTION_PROMPT = `You extract memories from dialogue for a personal AI assistant.

Return JSON array of memories:
[
  {
    "type": "episodic" | "semantic" | "procedural",
    "content": "string",
    "confidence": 0.0-1.0,
    "tags": ["string"],
    // For procedural only:
    "trigger": "When X...",
    "action": "Do Y...",
    "reason": "Because Z..."
  }
]

Guidelines:
- EPISODIC: What happened (time, place, participants, outcome, emotions)
- SEMANTIC: Facts and knowledge (definitions, relationships, properties)
- PROCEDURAL: How to do things (if/when → then format)

- Be specific and actionable
- Include context that would help recall later
- Assign confidence based on how explicitly user stated it
- Tag with relevant topics for retrieval`;
```

### Memory Consolidation

```typescript
// convex/actions/memoryConsolidation.ts

// Run daily to consolidate memories
export const consolidateMemories = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Get recent episodic memories
    const recentEpisodic = await ctx.runQuery(internal.memories.getRecent, {
      sessionId: args.sessionId,
      type: "episodic",
      days: 7,
    });

    // Look for patterns to extract as procedural
    const patternAnalysis = await generateText({
      model: claude("claude-sonnet-4"),
      prompt: `
## Recent Episodes
${recentEpisodic.map(m => `- ${m.content}`).join("\n")}

Are there recurring patterns that should become procedural memories?
Look for:
- Repeated actions in similar situations
- Consistent preferences or approaches
- Learned solutions to recurring problems

Return JSON:
{
  "patterns": [
    {
      "trigger": "When X happens...",
      "action": "User does Y...",
      "reason": "Because Z...",
      "confidence": 0.0-1.0,
      "sourceEpisodeIds": ["id1", "id2"]
    }
  ]
}`,
    });

    const { patterns } = JSON.parse(patternAnalysis.text);

    // Create procedural memories from patterns
    for (const pattern of patterns) {
      if (pattern.confidence >= 0.7) {
        await ctx.runMutation(internal.memories.create, {
          sessionId: args.sessionId,
          type: "procedural",
          content: `${pattern.trigger} → ${pattern.action} (${pattern.reason})`,
          metadata: {
            timestamp: Date.now(),
            confidence: pattern.confidence,
            tags: ["auto_extracted", "pattern"],
            source: "observation",
            trigger: pattern.trigger,
            action: pattern.action,
            reason: pattern.reason,
          },
          createdAt: Date.now(),
          accessCount: 0,
        });
      }
    }
  },
});
```

---

## Daily Plan Schema

```typescript
// convex/schema.ts

dailyPlans: defineTable({
  sessionId: v.id("sessions"),

  // Date (YYYY-MM-DD)
  date: v.string(),

  // Goals
  goals: v.array(v.object({
    id: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("deferred"),
      v.literal("cancelled")
    ),
    priority: v.optional(v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    )),
    notes: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })),

  // Morning ritual
  morningMessage: v.optional(v.string()),  // Raw user input

  // Evening ritual
  eveningSummary: v.optional(v.string()),  // Generated summary
  eveningFeedback: v.optional(v.string()), // User corrections/additions

  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_session_date", ["sessionId", "date"]),
```

---

## Configuration

```typescript
// convex/schema.ts

observationConfig: defineTable({
  sessionId: v.id("sessions"),

  // Activity capture
  capture: v.object({
    browser: v.boolean(),
    terminal: v.boolean(),
    vscode: v.boolean(),
    activitywatch: v.boolean(),
  }),

  // Enrichment
  enrichment: v.object({
    autoGuessIntent: v.boolean(),
    confidenceThreshold: v.number(),  // Below this, always ask
  }),

  // Dialogue
  dialogue: v.object({
    enabled: v.boolean(),
    maxPerHour: v.number(),
    morningRitual: v.boolean(),
    eveningRitual: v.boolean(),
    validationQuestions: v.boolean(),
    learningQuestions: v.boolean(),
  }),

  // Privacy
  privacy: v.object({
    excludeDomains: v.array(v.string()),  // Don't track these
    excludePaths: v.array(v.string()),    // Don't track files in these paths
    retentionDays: v.number(),            // Delete raw activities after N days
  }),
}),
```

---

## Summary

The Observation Pipeline transforms raw user activity into rich, validated memories:

```
┌─────────────────────────────────────────────────────────────────┐
│  RAW ACTIVITY                                                   │
│  Browser tabs, terminal commands, file edits                    │
│  Volume: High, Noise: High                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ Filter + Normalize
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ACTIVITY SESSIONS                                              │
│  Grouped events with guessed intent                             │
│  Volume: Medium, Context: Added                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ Validate + Ask
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  VALIDATED KNOWLEDGE                                            │
│  User-confirmed intents and explanations                        │
│  Volume: Low, Quality: High                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ Extract + Store
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  MEMORIES                                                       │
│  Episodic (what happened)                                       │
│  Semantic (what we learned)                                     │
│  Procedural (how to do things)                                  │
│  Volume: Low, Value: High                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Key principles:**
1. **Ask, don't assume** - Validate guesses through natural dialogue
2. **Quality over quantity** - Store validated knowledge, not raw logs
3. **Natural interaction** - Morning plans, check-ins, evening summaries
4. **Incremental learning** - Build memories gradually through conversation

---

*Formalized: 2026-02-02*
*Updated: 2026-02-03 (added MQTT for Home Assistant/Frigate integration)*
*Status: Ready for implementation*
