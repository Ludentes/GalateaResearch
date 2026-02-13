# Phase C Manual Testing Guide

**Date:** 2026-02-12
**Phase:** C — Auto-Extraction + OTEL Infrastructure + Homeostasis Integration
**Audience:** Engineers, PMs, QA

This guide provides step-by-step instructions to manually verify all Phase C features. Each section covers a different component with happy paths, edge cases, and round-trip scenarios.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Test 1: Extraction State Tracking](#test-1-extraction-state-tracking)
3. [Test 2: SessionEnd Auto-Extraction Hook](#test-2-sessionend-auto-extraction-hook)
4. [Test 3: Homeostasis Sensor Module](#test-3-homeostasis-sensor-module)
5. [Test 4: Homeostasis → Context Assembler Integration](#test-4-homeostasis--context-assembler-integration)
6. [Test 5: OTEL Collector Docker Setup](#test-5-otel-collector-docker-setup)
7. [Test 6: Observation Ingest API + Event Store](#test-6-observation-ingest-api--event-store)
8. [Test 7: Claude Code Real-Time OTEL Hooks](#test-7-claude-code-real-time-otel-hooks)
9. [End-to-End Integration Test](#end-to-end-integration-test)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services

1. **PostgreSQL** (for chat/session storage)
2. **OTEL Collector** (for observation pipeline)
3. **Galatea Dev Server** (for ingest API)

### Start Services

```bash
cd /home/newub/w/galatea/.worktrees/phase-c

# Start PostgreSQL + OTEL Collector
docker compose up postgres otel-collector -d

# Apply database schema
pnpm db:push

# Start dev server (in a separate terminal)
pnpm dev
```

### Verify Services Running

```bash
# Check PostgreSQL
docker exec phase-c-postgres-1 pg_isready -U galatea
# Expected: /var/run/postgresql:5432 - accepting connections

# Check OTEL Collector
docker logs phase-c-otel-collector-1 2>&1 | grep "Everything is ready"
# Expected: "Everything is ready. Begin running and processing data."

# Check dev server
curl http://localhost:3000/api/health 2>&1 | head -1
# Expected: HTTP 200 or HTML response
```

---

## Test 1: Extraction State Tracking

**What it does:** Tracks which Claude Code sessions have been extracted to prevent re-processing.

### Happy Path

```bash
# Run the extraction state tests
pnpm vitest run server/memory/__tests__/extraction-state.test.ts

# Expected output:
# ✓ server/memory/__tests__/extraction-state.test.ts (4 tests)
#   ✓ returns empty state when file doesn't exist
#   ✓ marks session as extracted
#   ✓ checks if session is extracted
#   ✓ handles multiple sessions
```

### Manual Verification

```bash
# Create test extraction state
mkdir -p data/memory
cat > /tmp/test-mark-extracted.ts << 'EOF'
import { markSessionExtracted, isSessionExtracted } from './server/memory/extraction-state'

const statePath = 'data/memory/extraction-state.json'
await markSessionExtracted('test-session-123', {
  entriesCount: 5,
  transcriptPath: '/path/to/transcript.jsonl',
  statePath
})

const extracted = await isSessionExtracted('test-session-123', statePath)
console.log('Session extracted:', extracted) // Should be true

const notExtracted = await isSessionExtracted('unknown-session', statePath)
console.log('Unknown session:', notExtracted) // Should be false
EOF

pnpm tsx /tmp/test-mark-extracted.ts

# Check state file was created
cat data/memory/extraction-state.json
# Expected: JSON with "test-session-123" entry
```

### Edge Cases

- ✅ Non-existent state file returns empty state
- ✅ Duplicate markSessionExtracted calls update timestamp
- ✅ Concurrent writes handled by file system

---

## Test 2: SessionEnd Auto-Extraction Hook

**What it does:** Automatically extracts knowledge from completed Claude Code sessions.

### Happy Path

```bash
# Check hook is registered
grep -A5 '"SessionEnd"' ~/.claude/settings.json | grep auto-extract
# Expected: "command": "pnpm tsx /home/newub/w/galatea/scripts/hooks/auto-extract.ts"

# Test hook with mock session
echo '{"session_id":"test-hook-456","transcript_path":"'$HOME'/.claude/projects/-home-newub-w-galatea/nonexistent.jsonl","cwd":"'$(pwd)'"}' | pnpm tsx scripts/hooks/auto-extract.ts

# Check hook log
cat ~/.claude/state/auto-extract.log
# Expected: Skip message for nonexistent transcript
```

### Manual Verification with Real Transcript

```bash
# Create a minimal test transcript
mkdir -p ~/.claude/projects/-home-newub-w-galatea
cat > ~/.claude/projects/-home-newub-w-galatea/test-transcript.jsonl << 'EOF'
{"role":"user","content":{"type":"text","text":"I prefer using pnpm for package management"}}
{"role":"assistant","content":{"type":"text","text":"I'll use pnpm for this project"}}
EOF

# Run hook with test transcript
echo '{"session_id":"test-real-session","transcript_path":"'$HOME'/.claude/projects/-home-newub-w-galatea/test-transcript.jsonl","cwd":"'$(pwd)'"}' | pnpm tsx scripts/hooks/auto-extract.ts

# Check extraction state
cat data/memory/extraction-state.json | jq '.sessions["test-real-session"]'
# Expected: Entry showing extraction completed

# Check knowledge store
tail -1 data/memory/entries.jsonl
# Expected: Knowledge entry about pnpm preference
```

### Edge Cases

- ✅ Nonexistent transcript → logs skip, returns success
- ✅ Already extracted session → logs skip, no re-processing
- ✅ Extraction failure → logs error, doesn't block session end

---

## Test 3: Homeostasis Sensor Module

**What it does:** Assesses 6 psychological dimensions of agent state and provides guidance for imbalances.

### Happy Path

```bash
# Run homeostasis engine tests
pnpm vitest run server/engine/__tests__/homeostasis-engine.test.ts

# Expected output:
# ✓ server/engine/__tests__/homeostasis-engine.test.ts (11 tests)
#   ✓ returns all 6 dimensions
#   ✓ defaults unmeasurable dimensions to HEALTHY
#   ✓ detects LOW knowledge_sufficiency when no relevant facts
#   ✓ detects HEALTHY knowledge_sufficiency with relevant facts
#   ✓ detects LOW productive_engagement when no task
#   ✓ detects HEALTHY communication_health for active session
#   ✓ detects LOW progress_momentum when stuck (repeated messages)
#   ✓ loads guidance YAML
#   ✓ returns empty string when all HEALTHY
#   ✓ returns guidance for imbalanced dimensions
#   ✓ prioritizes higher-priority guidance first
```

### Manual Verification

```bash
# Test dimension assessment programmatically
cat > /tmp/test-homeostasis.ts << 'EOF'
import { assessDimensions, getGuidance } from './server/engine/homeostasis-engine'
import type { AgentContext } from './server/engine/types'

// Scenario 1: LOW knowledge_sufficiency
const lowKnowledge: AgentContext = {
  sessionId: 'test',
  currentMessage: 'How do I implement OAuth2?',
  messageHistory: [],
  retrievedFacts: [] // No facts!
}

const state1 = assessDimensions(lowKnowledge)
console.log('LOW knowledge scenario:', state1.knowledge_sufficiency) // Should be "LOW"

const guidance1 = getGuidance(state1)
console.log('Guidance:', guidance1) // Should contain "Knowledge gap"

// Scenario 2: All HEALTHY
const healthy: AgentContext = {
  sessionId: 'test',
  currentMessage: 'Continue working on auth',
  messageHistory: [{ role: 'user', content: 'Help with auth' }],
  retrievedFacts: [
    { content: 'Use OAuth2 for third-party auth', confidence: 0.95 },
    { content: 'JWT tokens expire in 1h', confidence: 0.9 }
  ]
}

const state2 = assessDimensions(healthy)
console.log('Healthy scenario:', state2.knowledge_sufficiency) // Should be "HEALTHY"

const guidance2 = getGuidance(state2)
console.log('Guidance (should be empty):', guidance2) // Should be ""
EOF

pnpm tsx /tmp/test-homeostasis.ts
```

### Dimension Test Scenarios

| Dimension | Scenario | Expected State |
|-----------|----------|----------------|
| `knowledge_sufficiency` | No facts, long message | LOW |
| `knowledge_sufficiency` | 2+ relevant facts | HEALTHY |
| `knowledge_sufficiency` | 10+ facts | HIGH |
| `progress_momentum` | Repeated similar questions | LOW |
| `progress_momentum` | Varied conversation | HEALTHY |
| `communication_health` | Recent message (< 4h) | HEALTHY |
| `communication_health` | Stale session (> 4h) | LOW |
| `productive_engagement` | No task, empty history | LOW |
| `productive_engagement` | Active conversation | HEALTHY |
| `certainty_alignment` | Always defaults to | HEALTHY |
| `knowledge_application` | Always defaults to | HEALTHY |

### L0-L2 Multi-Level Thinking Architecture

Phase C implements a **three-level thinking architecture** for homeostasis assessment, providing different speeds and accuracies for different dimensions:

#### **L0: Cached/Reflexive (0ms)**
Returns last assessment if it's still fresh based on dimension-specific TTLs:

| Dimension | Cache TTL | Rationale |
|-----------|-----------|-----------|
| `knowledge_sufficiency` | 0ms | Changes every message |
| `progress_momentum` | 2 minutes | Patterns emerge over conversation |
| `communication_health` | 30 minutes | Time-based, slow changing |
| `productive_engagement` | 0ms | Changes every message |
| `certainty_alignment` | 1 minute | Will use expensive LLM (Phase D) |
| `knowledge_application` | 5 minutes | Will use expensive LLM (Phase D) |

**Test L0 caching:**
```bash
cat > /tmp/test-l0-cache.ts << 'EOF'
import { assessDimensions } from './server/engine/homeostasis-engine'

const ctx = {
  sessionId: 'cache-test',
  currentMessage: 'test',
  messageHistory: [],
  lastMessageTime: new Date()
}

// First assessment (computes)
const t1 = Date.now()
const state1 = assessDimensions(ctx)
const d1 = Date.now() - t1

// Second assessment within TTL (should use cache for some dimensions)
const t2 = Date.now()
const state2 = assessDimensions(ctx)
const d2 = Date.now() - t2

console.log('First assessment time:', d1, 'ms')
console.log('Second assessment time:', d2, 'ms')
console.log('Cache hit expected for communication_health (30min TTL)')
EOF

pnpm tsx /tmp/test-l0-cache.ts
```

#### **L1: Computed with Relevance Scoring (1-5ms)**

L1 improves over the baseline "just count facts" approach by:

1. **Relevance filtering** — Checks keyword overlap between user message and facts
2. **Confidence weighting** — Uses fact confidence scores
3. **Combined metric** — `score = relevant_facts_count × avg_confidence`

**Example improvement:**
```typescript
// User asks: "How do I implement OAuth2 authentication?"
// Agent has 3 facts:
//   - "Use NativeWind for styling" (UI design - irrelevant!)
//   - "Liquid Glass for iOS" (UI design - irrelevant!)
//   - "expo-blur on Android" (UI design - irrelevant!)

// Baseline (old): 3 facts → HEALTHY ❌ FALSE POSITIVE
// L1 (new): 0 relevant facts → LOW ✅ CORRECT
```

**Test relevance filtering:**
```bash
cat > /tmp/test-l1-relevance.ts << 'EOF'
import { assessDimensions } from './server/engine/homeostasis-engine'

// Scenario: OAuth question with irrelevant UI facts
const ctx = {
  sessionId: 'test',
  currentMessage: 'How do I implement OAuth2 authentication?',
  messageHistory: [],
  retrievedFacts: [
    { content: 'Use NativeWind for styling', confidence: 0.95 },
    { content: 'Liquid Glass for iOS UI', confidence: 0.90 },
    { content: 'expo-blur on Android', confidence: 0.85 }
  ]
}

const state = assessDimensions(ctx)
console.log('knowledge_sufficiency:', state.knowledge_sufficiency)
console.log('Expected: LOW (facts are irrelevant to auth question)')
EOF

pnpm tsx /tmp/test-l1-relevance.ts
```

#### **L2: LLM Semantic Understanding (2-5s) — Phase D**

L2 uses LLM for dimensions that require semantic understanding:
- `certainty_alignment` — Agent confidence matches situation needs?
- `knowledge_application` — Agent using available knowledge effectively?

Currently defaults to HEALTHY. Will be implemented in Phase D.

#### **Evaluation Results**

The L0-L2 implementation was tested against 17 automated scenarios from `docs/plans/2026-02-11-learning-scenarios.md`:

| Metric | Baseline (Simple Counting) | L0-L2 (Relevance + Caching) | Improvement |
|--------|----------------------------|------------------------------|-------------|
| **Failed Tests** | 6 | 4 | ✅ **-33%** (2 fewer failures) |
| **Passing Tests** | 9 | 11 | ✅ **+22%** (2 more passing) |
| **Todo (L2 LLM)** | 2 | 2 | ⏸️ Pending Phase D |

**Run evaluation suite:**
```bash
pnpm vitest run server/engine/__tests__/homeostasis-evaluation.test.ts

# Expected: 11 passing, 4 failing, 2 todo
# Key win: S1 "ignores irrelevant facts" test passes (was failing in baseline)
```

**Full evaluation details:** See `docs/plans/2026-02-12-homeostasis-l0-l2-evaluation-report.md` for:
- Test-by-test breakdown of all 17 scenarios
- Root cause analysis of 4 remaining failures
- L3/L4 future architecture design
- Recommendations for Phase D

---

## Test 4: Homeostasis → Context Assembler Integration

**What it does:** Injects homeostasis guidance into agent's system prompt when dimensions are imbalanced.

### Happy Path

```bash
# Run context assembler tests (includes homeostasis tests)
pnpm vitest run server/memory/__tests__/context-assembler.test.ts

# Expected output:
# ✓ server/memory/__tests__/context-assembler.test.ts (5 tests)
#   ✓ assembles prompt from preprompts when no knowledge exists
#   ✓ includes knowledge entries in prompt
#   ✓ puts rules in non-truncatable CONSTRAINTS section
#   ✓ includes homeostasis guidance when dimensions imbalanced
#   ✓ excludes homeostasis guidance when all dimensions healthy
```

### Manual Verification with Live Chat

```bash
# Start a chat session with LOW knowledge_sufficiency
# This will trigger homeostasis guidance

# Create a test script
cat > /tmp/test-chat-with-homeostasis.ts << 'EOF'
import { createSessionLogic, sendMessageLogic } from './server/functions/chat.logic'
import { createOllamaModel } from './server/providers/ollama'

// Create session
const session = await createSessionLogic('Homeostasis Test')
console.log('Created session:', session.id)

// Send message with no knowledge (triggers LOW knowledge_sufficiency)
const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')
const result = await sendMessageLogic(
  session.id,
  'How should I implement authentication for my mobile app?',
  model,
  'glm-4.7-flash'
)

console.log('Response:', result.text.slice(0, 200))

// Check if guidance was included by inspecting the system prompt
// (This requires modifying sendMessageLogic to log the system prompt, or checking via debugger)
EOF

# Note: To actually see the system prompt, you'd need to add logging in chat.logic.ts
# Or you can check the context assembler directly:

cat > /tmp/check-assembled-context.ts << 'EOF'
import { assembleContext } from './server/memory/context-assembler'

// LOW knowledge scenario
const contextLow = await assembleContext({
  agentContext: {
    sessionId: 'test',
    currentMessage: 'How to implement auth?',
    messageHistory: [],
    retrievedFacts: [] // No facts
  }
})

console.log('=== LOW KNOWLEDGE SCENARIO ===')
console.log('homeostasisGuidanceIncluded:', contextLow.metadata.homeostasisGuidanceIncluded)
console.log('\nSystem prompt includes guidance:', contextLow.systemPrompt.includes('Knowledge gap'))

// HEALTHY scenario
const contextHealthy = await assembleContext({
  agentContext: {
    sessionId: 'test',
    currentMessage: 'Continue with auth',
    messageHistory: [],
    retrievedFacts: [
      { content: 'Use Clerk for mobile auth', confidence: 0.95 },
      { content: 'JWT refresh tokens', confidence: 0.9 }
    ]
  }
})

console.log('\n=== HEALTHY SCENARIO ===')
console.log('homeostasisGuidanceIncluded:', contextHealthy.metadata.homeostasisGuidanceIncluded)
console.log('System prompt includes guidance:', contextHealthy.systemPrompt.includes('Knowledge gap'))
EOF

pnpm tsx /tmp/check-assembled-context.ts

# Expected output:
# LOW KNOWLEDGE SCENARIO
# homeostasisGuidanceIncluded: true
# System prompt includes guidance: true
#
# HEALTHY SCENARIO
# homeostasisGuidanceIncluded: false
# System prompt includes guidance: false
```

### Verify in System Prompt

Check that the guidance appears in the `SELF-REGULATION` section:

```bash
cat > /tmp/show-prompt-sections.ts << 'EOF'
import { assembleContext } from './server/memory/context-assembler'

const context = await assembleContext({
  agentContext: {
    sessionId: 'test',
    currentMessage: 'Need help with authentication',
    messageHistory: [],
    retrievedFacts: []
  }
})

console.log('=== SECTIONS ===')
for (const section of context.sections) {
  console.log(`\n## ${section.name} (priority: ${section.priority}, truncatable: ${section.truncatable})`)
  console.log(section.content.slice(0, 150) + '...')
}
EOF

pnpm tsx /tmp/show-prompt-sections.ts

# Expected to see:
# ## SELF-REGULATION (priority: -1, truncatable: false)
# Knowledge gap detected...
```

---

## Test 5: OTEL Collector Docker Setup

**What it does:** Receives OTLP events from hooks, processes them, and exports to Galatea API.

### Happy Path

```bash
# Check collector is running
docker ps | grep otel-collector
# Expected: phase-c-otel-collector-1 running

# Check collector logs
docker logs phase-c-otel-collector-1 2>&1 | grep "Everything is ready"
# Expected: "Everything is ready. Begin running and processing data."

# Send test event
curl -X POST http://localhost:4318/v1/logs \
  -H "Content-Type: application/json" \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "manual-test"}
        }]
      },
      "scopeLogs": [{
        "scope": {"name": "test"},
        "logRecords": [{
          "timeUnixNano": "1707737400000000000",
          "severityText": "INFO",
          "body": {"stringValue": "Manual test event"}
        }]
      }]
    }]
  }'

# Expected response:
# {"partialSuccess":{}}

# Check collector processed it
docker logs phase-c-otel-collector-1 2>&1 | grep "Manual test event"
# Expected: Log showing the event body
```

### Verify Collector Configuration

```bash
# Check OTLP receivers are active
docker logs phase-c-otel-collector-1 2>&1 | grep "Starting.*server"
# Expected:
# Starting GRPC server ... endpoint: "0.0.0.0:4317"
# Starting HTTP server ... endpoint: "0.0.0.0:4318"

# Verify collector config
cat config/otel-collector-config.yaml

# Key points to verify:
# - receivers.otlp.protocols.http.endpoint: 0.0.0.0:4318 ✓
# - receivers.otlp.protocols.grpc.endpoint: 0.0.0.0:4317 ✓
# - exporters.otlphttp/galatea.endpoint: http://host.docker.internal:3000 ✓
# - processors.batch.timeout: 10s ✓
# - processors.filter/noise configured ✓
```

### Test Batch Processing

```bash
# Send multiple events rapidly
for i in {1..5}; do
  curl -X POST http://localhost:4318/v1/logs \
    -H "Content-Type: application/json" \
    -d '{
      "resourceLogs": [{
        "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "batch-test"}}]},
        "scopeLogs": [{
          "scope": {"name": "test"},
          "logRecords": [{
            "timeUnixNano": "1707737400000000000",
            "severityText": "INFO",
            "body": {"stringValue": "Batch event '$i'"}
          }]
        }]
      }]
    }' &
done
wait

# Check batch processing in collector logs
docker logs phase-c-otel-collector-1 2>&1 | grep -c "Batch event"
# Expected: 5 events logged
```

---

## Test 6: Observation Ingest API + Event Store

**What it does:** Receives OTLP events from OTEL Collector, parses them, and stores to JSONL.

### Happy Path

```bash
# Ensure dev server is running
# (In separate terminal: pnpm dev)

# Send event to ingest API directly
curl -X POST http://localhost:3000/api/observation/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "direct-api-test"}
        }]
      },
      "scopeLogs": [{
        "scope": {"name": "test-scope"},
        "logRecords": [{
          "timeUnixNano": "1707737400000000000",
          "severityText": "INFO",
          "body": {"stringValue": "Direct API test event"},
          "attributes": [{
            "key": "test_attr",
            "value": {"stringValue": "test_value"}
          }]
        }]
      }]
    }]
  }'

# Expected response:
# {"success":true,"eventsReceived":1}

# Check event was stored
cat data/observation/events.jsonl | tail -1 | jq
# Expected: JSON object with:
# - type: "log"
# - source: "direct-api-test"
# - body: "Direct API test event"
# - attributes.test_attr: "test_value"
```

### Test Event Store

```bash
# Run event store tests
pnpm vitest run server/observation/__tests__/event-store.test.ts

# Expected output:
# ✓ server/observation/__tests__/event-store.test.ts (4 tests)
#   ✓ returns empty array when store doesn't exist
#   ✓ appends events to new store
#   ✓ appends events to existing store
#   ✓ handles multiple events in single append
```

### Manual Verification of JSONL Storage

```bash
# Check events file structure
wc -l data/observation/events.jsonl
# Count total events

# Parse and analyze events
cat data/observation/events.jsonl | jq -r '.type' | sort | uniq -c
# Show event type distribution

cat data/observation/events.jsonl | jq -r '.source' | sort | uniq -c
# Show event sources

# Check latest events
cat data/observation/events.jsonl | tail -5 | jq
```

### Test Traces Format

```bash
# Send OTLP traces
curl -X POST http://localhost:3000/api/observation/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "trace-test"}
        }]
      },
      "scopeSpans": [{
        "scope": {"name": "test-scope"},
        "spans": [{
          "traceId": "abc123def456",
          "spanId": "span789",
          "name": "test_operation",
          "startTimeUnixNano": "1707737400000000000",
          "attributes": [{
            "key": "operation",
            "value": {"stringValue": "test"}
          }]
        }]
      }]
    }]
  }'

# Verify trace stored
cat data/observation/events.jsonl | tail -1 | jq
# Expected:
# - type: "trace"
# - traceId: "abc123def456"
# - spanId: "span789"
```

---

## Test 7: Claude Code Real-Time OTEL Hooks

**What it does:** Emits OTEL events for user prompts and tool executions in real-time.

### Happy Path

```bash
# Verify hooks are registered
grep -A3 '"UserPromptSubmit"' ~/.claude/settings.json
grep -A3 '"PostToolUse"' ~/.claude/settings.json

# Expected: Both should reference otel-observer.ts

# Test UserPromptSubmit hook
echo '{"event_type":"UserPromptSubmit","user_prompt":"Test prompt for OTEL","session_id":"test-session-789"}' | \
  pnpm tsx scripts/hooks/otel-observer.ts

# Expected output:
# {"continue":true}

# Check collector received it
docker logs phase-c-otel-collector-1 2>&1 | grep -A10 "User prompt: Test prompt for OTEL"
# Expected: OTLP log record with event details
```

### Test PostToolUse Hook

```bash
# Test PostToolUse event
echo '{"event_type":"PostToolUse","tool_name":"Read","tool_input":"{\"file_path\":\"/test\"}","session_id":"test-session-789"}' | \
  pnpm tsx scripts/hooks/otel-observer.ts

# Expected output:
# {"continue":true}

# Check collector received it
docker logs phase-c-otel-collector-1 2>&1 | grep -A10 "Tool executed: Read"
# Expected: OTLP log record showing tool name and attributes
```

### Verify Async Execution

```bash
# Check timeout settings
grep -A5 'otel-observer.ts' ~/.claude/settings.json

# Expected:
# "timeout": 10
# "async": true

# This means hooks won't block Claude Code operations
```

### Integration Test with Real Claude Code Session

**Note:** This requires starting a NEW Claude Code session after hooks are registered.

```bash
# In a NEW Claude Code session (not this one):
# 1. Send a message: "Hello, testing OTEL hooks"
# 2. Check collector logs:

docker logs -f phase-c-otel-collector-1 | grep "claude-code"

# Expected to see:
# - UserPromptSubmit event with your message
# - PostToolUse events for tools used by Claude
```

---

## End-to-End Integration Test

**Scenario:** Complete round-trip from user interaction → knowledge extraction → homeostasis assessment → OTEL observation

### Setup

```bash
# Ensure all services running:
docker compose up postgres otel-collector -d
pnpm dev  # In separate terminal

# Clean state
rm -f data/memory/entries.jsonl
rm -f data/memory/extraction-state.json
rm -f data/observation/events.jsonl
```

### Step 1: Generate Session with Knowledge

Start a Claude Code session (NEW session) and have a conversation:

```
User: I prefer using pnpm instead of npm for all my projects.
Assistant: [Response acknowledging pnpm preference]
User: Also, I always use shadcn/ui for React component libraries.
Assistant: [Response about shadcn/ui]
```

End the session (exit Claude Code).

### Step 2: Verify Auto-Extraction

```bash
# Check auto-extract hook ran
cat ~/.claude/state/auto-extract.log | tail -5

# Expected: Log showing extraction for recent session

# Check knowledge was extracted
cat data/memory/entries.jsonl | jq 'select(.type == "preference")'

# Expected: Entries about pnpm and shadcn/ui preferences
```

### Step 3: Verify Homeostasis Integration

```bash
# Start new chat and ask question WITHOUT relevant knowledge
cat > /tmp/test-e2e-homeostasis.ts << 'EOF'
import { createSessionLogic, sendMessageLogic } from './server/functions/chat.logic'
import { createOllamaModel } from './server/providers/ollama'

const session = await createSessionLogic('E2E Homeostasis Test')
const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')

// Question unrelated to extracted knowledge (pnpm, shadcn)
const result = await sendMessageLogic(
  session.id,
  'How do I implement OAuth2 authentication?',
  model,
  'glm-4.7-flash'
)

console.log('Response received (length):', result.text.length)
// Note: To verify homeostasis guidance was included, check logs or modify
// chat.logic.ts to log the system prompt
EOF

pnpm tsx /tmp/test-e2e-homeostasis.ts
```

### Step 4: Verify OTEL Events Captured

```bash
# Check observation events file
cat data/observation/events.jsonl | jq -r '.source' | sort | uniq -c

# Expected sources:
# - claude-code (from hooks)
# - direct-api-test (from manual tests)
# - etc.

# Filter to claude-code events
cat data/observation/events.jsonl | jq 'select(.source == "claude-code")'

# Expected: Events from your Claude Code interactions
```

### Step 5: Round-Trip Verification

```bash
# Now ask a question that SHOULD use extracted knowledge
cat > /tmp/test-e2e-knowledge.ts << 'EOF'
import { createSessionLogic, sendMessageLogic } from './server/functions/chat.logic'
import { createOllamaModel } from './server/providers/ollama'

const session = await createSessionLogic('E2E Knowledge Test')
const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')

// Question related to extracted preferences
const result = await sendMessageLogic(
  session.id,
  'Which package manager should I use for my new React project?',
  model,
  'glm-4.7-flash'
)

console.log('Response:', result.text)
// Expected: Should mention pnpm based on extracted preference
EOF

pnpm tsx /tmp/test-e2e-knowledge.ts

# The response should reference pnpm preference
```

---

## Troubleshooting

### PostgreSQL Connection Issues

**Problem:** `ECONNREFUSED 127.0.0.1:15432`

**Solution:**
```bash
# Check if postgres is running
docker ps | grep postgres

# If not running, start it
docker compose up postgres -d

# Wait for it to be ready
docker exec phase-c-postgres-1 pg_isready -U galatea

# Re-run database migrations
pnpm db:push
```

### OTEL Collector Not Receiving Events

**Problem:** Events not appearing in collector logs

**Solution:**
```bash
# Check collector is running
docker ps | grep otel

# Check collector logs for errors
docker logs phase-c-otel-collector-1 2>&1 | grep -i error

# Restart collector
docker compose restart otel-collector

# Test with direct curl
curl -X POST http://localhost:4318/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[{"scopeLogs":[{"logRecords":[{"body":{"stringValue":"test"}}]}]}]}'
```

### Hooks Not Firing

**Problem:** Hook events not appearing in logs

**Solution:**
```bash
# Verify hooks are registered
cat ~/.claude/settings.json | jq '.hooks'

# Check hook script is executable
ls -la scripts/hooks/otel-observer.ts
# Should show: -rwxr-xr-x

# Make executable if needed
chmod +x scripts/hooks/otel-observer.ts

# Test hook manually
echo '{"event_type":"UserPromptSubmit","user_prompt":"test","session_id":"test"}' | \
  pnpm tsx scripts/hooks/otel-observer.ts

# Important: Hooks only fire in NEW sessions after settings update
# Exit current Claude Code session and start a new one
```

### Knowledge Not Extracting

**Problem:** No entries in `data/memory/entries.jsonl`

**Solution:**
```bash
# Check auto-extract log for errors
cat ~/.claude/state/auto-extract.log

# Test extraction manually
pnpm tsx -e "
import { runExtraction } from './server/memory/extraction-pipeline'
import { createOllamaModel } from './server/providers/ollama'

const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')
const result = await runExtraction({
  transcriptPath: process.env.HOME + '/.claude/projects/-home-newub-w-galatea/[SESSION_ID].jsonl',
  model,
  storePath: 'data/memory/entries.jsonl'
})
console.log('Extracted:', result.entries.length, 'entries')
"

# Ensure Ollama is running
curl http://localhost:11434/api/tags
```

### Homeostasis Guidance Not Appearing

**Problem:** SELF-REGULATION section missing from system prompt

**Solution:**
```bash
# Verify dimension assessment works
cat > /tmp/debug-homeostasis.ts << 'EOF'
import { assessDimensions, getGuidance } from './server/engine/homeostasis-engine'

const state = assessDimensions({
  sessionId: 'test',
  currentMessage: 'Long question about authentication',
  messageHistory: [],
  retrievedFacts: [] // Force LOW
})

console.log('Dimensions:', state)
console.log('Guidance:', getGuidance(state))
EOF

pnpm tsx /tmp/debug-homeostasis.ts

# Check guidance.yaml exists
ls -la server/engine/guidance.yaml

# Verify AgentContext is passed in chat.logic.ts
grep -A10 'assembleContext' server/functions/chat.logic.ts | grep agentContext
```

### Dev Server 404 for `/api/observation/ingest`

**Problem:** Collector shows "HTTP Status Code 404"

**Solution:**
```bash
# Verify dev server is running
curl http://localhost:3000/

# Check route file exists
ls -la server/routes/api/observation/ingest.post.ts

# Restart dev server to pick up new routes
# (Kill existing dev server and restart)
pnpm dev

# Test ingest endpoint directly
curl -X POST http://localhost:3000/api/observation/ingest \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[]}'

# Expected: {"success":true,"eventsReceived":0}
```

---

## Success Criteria

Phase C is fully operational when:

- ✅ All 80+ tests pass: `pnpm vitest run`
- ✅ Type checking clean: `pnpm tsc --noEmit`
- ✅ Auto-extraction hook runs on SessionEnd
- ✅ Knowledge stored in `data/memory/entries.jsonl`
- ✅ Homeostasis guidance appears when dimensions imbalanced
- ✅ OTEL Collector receives events from hooks
- ✅ Events stored in `data/observation/events.jsonl`
- ✅ End-to-end flow: user interaction → extraction → homeostasis → observation

---

## Next Steps

After Phase C validation:

1. **Phase D:** LLM-based homeostasis assessment (certainty_alignment, knowledge_application)
2. **Phase E:** Fact retrieval integration (replace empty retrievedFacts arrays)
3. **Phase F:** Event store analytics and visualization
4. **Production:** Deploy OTEL Collector + ingest API to production environment
