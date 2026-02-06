# Claude Code Activity Observation via OTEL

**Date**: 2026-02-06
**Source**: Claude Code interactions
**Priority**: High (how you code)
**Status**: Design

---

## Overview

Claude Code natively supports OpenTelemetry through hooks and the Anthropic SDK. We can observe:
- User prompts to Claude
- Files Claude reads/edits
- Tools Claude uses (Bash, Grep, Read, Write, etc.)
- User approval/rejection of actions
- Conversation context and flow

This reveals **how the user codes**: their workflow, problem-solving approach, tool preferences, and coding patterns.

---

## Claude Code OTEL Support

### Native Integration

Claude Code already uses OTEL internally via Langfuse integration:

```typescript
// From server/plugins/langfuse.ts (already in your codebase)
import { NodeSDK } from "@opentelemetry/sdk-node"
import { LangfuseSpanProcessor } from "@langfuse/otel"

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
})
sdk.start()
```

This tracks LLM calls. We need to extend it to track **user interactions**.

### Hooks System

Claude Code has hooks (see `~/.claude/hooks.json`) that can execute on events:
- `user-prompt-submit` - User sends a message
- `tool-use` - Claude uses a tool
- `tool-result` - Tool execution completes

We can create hooks that emit OTEL events.

---

## Implementation Strategy

### Option A: OTEL Exporter Hook (Recommended)

Create a hook that emits OTEL events directly to the Collector.

**Hook Setup** (`~/.claude/hooks.json`):
```json
{
  "user-prompt-submit": "~/.claude/hooks/otel-prompt-observer.sh",
  "tool-use": "~/.claude/hooks/otel-tool-observer.sh",
  "tool-result": "~/.claude/hooks/otel-tool-result-observer.sh"
}
```

**Hook Script** (`~/.claude/hooks/otel-prompt-observer.sh`):
```bash
#!/bin/bash
# Receives stdin: JSON with { prompt, context, timestamp }

# Parse input
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt')
CWD=$(echo "$INPUT" | jq -r '.context.cwd // "unknown"')
TIMESTAMP=$(date +%s%N)

# Emit OTEL log record to Collector
curl -s -X POST http://localhost:4318/v1/logs \
  -H "Content-Type: application/json" \
  -d @- <<EOF
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
        "timeUnixNano": "$TIMESTAMP",
        "severityText": "INFO",
        "body": { "stringValue": "$PROMPT" },
        "attributes": [
          { "key": "activity.type", "value": { "stringValue": "claude_code_prompt" }},
          { "key": "claude_code.working_directory", "value": { "stringValue": "$CWD" }},
          { "key": "claude_code.prompt_length", "value": { "intValue": ${#PROMPT} }},
          { "key": "session.id", "value": { "stringValue": "$GALATEA_SESSION_ID" }}
        ]
      }]
    }]
  }]
}
EOF
```

**Benefits**:
- Direct to OTEL Collector (no intermediate storage)
- Real-time observation
- No code changes to Claude Code

**Limitations**:
- Hook payload might not include all context we want
- Need to check what data hooks receive

### Option B: Custom OTEL Exporter Plugin

If Claude Code supports custom plugins (need to verify), create an OTEL exporter:

```typescript
// ~/.claude/plugins/otel-observer.ts
import { trace, context } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
})

const tracer = trace.getTracer('galatea-observer')

export function onUserPrompt(prompt: string, ctx: any) {
  const span = tracer.startSpan('claude_code.user_prompt')

  span.setAttributes({
    'activity.type': 'claude_code_prompt',
    'claude_code.prompt': prompt,
    'claude_code.working_directory': ctx.cwd,
    'claude_code.files_in_context': ctx.files?.length || 0,
    'session.id': process.env.GALATEA_SESSION_ID,
  })

  span.end()
}

export function onToolUse(tool: string, args: any) {
  const span = tracer.startSpan('claude_code.tool_use')

  span.setAttributes({
    'activity.type': 'claude_code_tool',
    'claude_code.tool_name': tool,
    'claude_code.tool_args': JSON.stringify(args),
    'session.id': process.env.GALATEA_SESSION_ID,
  })

  span.end()
}
```

**Benefits**:
- Full access to context
- Can track entire conversation flow
- Proper span/trace structure

**Limitations**:
- Need to verify if Claude Code supports custom plugins
- Might require modifying Claude Code

### Option C: Wrapper Script

Wrap `claude` command with a script that observes stdin/stdout:

```bash
#!/bin/bash
# ~/.local/bin/claude-observed

# Start OTEL span for session
SESSION_ID=$(uuidgen)
export GALATEA_SESSION_ID=$SESSION_ID

# Log session start
curl -X POST http://localhost:4318/v1/logs -d "{...session start...}"

# Run actual Claude Code, tee output to observer
claude "$@" 2>&1 | tee >(~/.claude/observers/parse-and-emit.sh)

# Log session end
curl -X POST http://localhost:4318/v1/logs -d "{...session end...}"
```

**Benefits**:
- No modifications to Claude Code
- Can observe entire session

**Limitations**:
- Parsing stdout is fragile
- Might miss internal events

---

## Recommended Approach: Hook-Based (Option A)

Start with hooks because:
1. Claude Code has native hook support
2. No code modifications required
3. Can extend later if needed

---

## Event Schema

### User Prompt Event

**Event Type**: `claude_code_prompt`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "claude_code_prompt" | `claude_code_prompt` |
| `claude_code.prompt` | string | User's message | `Add JWT auth to API` |
| `claude_code.prompt_length` | int | Character count | `234` |
| `claude_code.working_directory` | string | CWD where Claude was invoked | `/home/user/project` |
| `claude_code.files_in_context` | int | Files mentioned/selected | `3` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: Full prompt text

**Example**:
```json
{
  "timeUnixNano": "1675700000000000000",
  "body": { "stringValue": "Add JWT authentication to the API endpoints" },
  "attributes": [
    { "key": "activity.type", "value": { "stringValue": "claude_code_prompt" }},
    { "key": "claude_code.working_directory", "value": { "stringValue": "/home/user/api-project" }},
    { "key": "claude_code.prompt_length", "value": { "intValue": "43" }},
    { "key": "session.id", "value": { "stringValue": "abc123" }}
  ]
}
```

### Tool Use Event

**Event Type**: `claude_code_tool`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "claude_code_tool" | `claude_code_tool` |
| `claude_code.tool_name` | string | Tool used | `Read`, `Edit`, `Bash` |
| `claude_code.tool_args` | string | JSON args | `{"file_path": "..."}` |
| `claude_code.user_approved` | bool | Did user approve? | `true` |
| `session.id` | string | Galatea session ID | `abc123` |

**Span Duration**: Time from tool invocation to result

**Example**:
```json
{
  "name": "claude_code.tool_use",
  "startTimeUnixNano": "1675700000000000000",
  "endTimeUnixNano": "1675700001234000000",
  "attributes": [
    { "key": "activity.type", "value": { "stringValue": "claude_code_tool" }},
    { "key": "claude_code.tool_name", "value": { "stringValue": "Read" }},
    { "key": "claude_code.tool_args", "value": { "stringValue": "{\"file_path\":\"/home/user/api-project/auth.ts\"}" }},
    { "key": "claude_code.user_approved", "value": { "boolValue": true }},
    { "key": "session.id", "value": { "stringValue": "abc123" }}
  ]
}
```

### File Context Event

**Event Type**: `claude_code_file_context`

Emitted when files are added to context (via selection or Claude reading).

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "claude_code_file_context" | `claude_code_file_context` |
| `claude_code.file_path` | string | File path | `/home/user/project/auth.ts` |
| `claude_code.file_size` | int | Size in bytes | `2048` |
| `claude_code.language` | string | Programming language | `typescript` |
| `claude_code.context_source` | string | How added | `user_selected`, `claude_read` |
| `session.id` | string | Galatea session ID | `abc123` |

---

## Implementation Steps

### 1. Install OTEL Collector

```bash
# docker-compose.yml
otel-collector:
  image: otel/opentelemetry-collector-contrib:latest
  ports:
    - "4318:4318"  # OTLP HTTP
  volumes:
    - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
  command: ["--config=/etc/otel-collector-config.yaml"]
```

### 2. Create Hook Scripts

```bash
mkdir -p ~/.claude/hooks

cat > ~/.claude/hooks/otel-prompt-observer.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .text // .')
TIMESTAMP=$(date +%s%N)
CWD=$(pwd)

curl -s -X POST http://localhost:4318/v1/logs \
  -H "Content-Type: application/json" \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "galatea-observer"}},
          {"key": "source.type", "value": {"stringValue": "claude_code"}}
        ]
      },
      "scopeLogs": [{
        "logRecords": [{
          "timeUnixNano": "'"$TIMESTAMP"'",
          "body": {"stringValue": "'"$(echo "$PROMPT" | sed 's/"/\\"/g')"'"},
          "attributes": [
            {"key": "activity.type", "value": {"stringValue": "claude_code_prompt"}},
            {"key": "claude_code.working_directory", "value": {"stringValue": "'"$CWD"'"}},
            {"key": "session.id", "value": {"stringValue": "'"${GALATEA_SESSION_ID:-unknown}"'"}}
          ]
        }]
      }]
    }]
  }'
EOF

chmod +x ~/.claude/hooks/otel-prompt-observer.sh
```

### 3. Configure Hooks

```bash
cat > ~/.claude/hooks.json <<'EOF'
{
  "user-prompt-submit": "~/.claude/hooks/otel-prompt-observer.sh"
}
EOF
```

### 4. Set Session ID

```bash
# In your shell profile (~/.bashrc or ~/.zshrc)
export GALATEA_SESSION_ID=$(cat ~/.galatea/current-session 2>/dev/null || echo "default")
```

### 5. Test

```bash
# Start Collector
docker-compose up otel-collector

# Use Claude Code
claude "test prompt"

# Verify event received at Collector
```

---

## Privacy & Filtering

### Sensitive Data Handling

**Problem**: Prompts might contain secrets, passwords, API keys.

**Solution**: Filter at Collector level:

```yaml
# otel-collector-config.yaml
processors:
  filter/sensitive:
    logs:
      exclude:
        match_type: regexp
        body:
          - ".*password.*"
          - ".*api[_-]?key.*"
          - ".*secret.*"
          - ".*token.*"
```

Or redact in hook:
```bash
# Redact patterns before sending
PROMPT=$(echo "$PROMPT" | sed 's/\(password\|api.key\|secret\)=[^ ]*/\1=REDACTED/gi')
```

### User Control

Environment variable to disable observation:
```bash
export GALATEA_OBSERVE=false
```

Update hook to check:
```bash
if [ "$GALATEA_OBSERVE" = "false" ]; then
  exit 0  # Skip observation
fi
```

---

## What We Learn

From Claude Code observation, we can infer:

**Workflow Patterns**:
- "User always starts with 'Read' before 'Edit'" → Cautious coder
- "User often uses 'Grep' to search first" → Exploratory approach
- "User frequently asks for tests" → Test-driven

**Domain Knowledge**:
- "User works on authentication code" → Knows auth
- "User asks about JWT best practices" → Learning JWT

**Tool Preferences**:
- "User prefers Bash over built-in tools" → CLI power user
- "User rarely uses Write, prefers Edit" → Works with existing codebases

**Problem-Solving**:
- "User iterates on same file 3+ times" → Struggling with this task
- "User asks 'why did this fail?'" → Debugging session

This feeds into Galatea's understanding of how you code, enabling better assistance.

---

## Future Enhancements

### Correlation with VSCode

Link Claude Code prompts to VSCode file edits:
```
User: "Fix auth bug" (Claude Code)
  → Claude reads auth.ts (Claude Code)
  → User opens auth.ts (VSCode)
  → User edits auth.ts (VSCode)
  → User runs tests (Claude Code)
```

Creates a complete picture of the coding session.

### Conversation Flow Tracking

Track multi-turn conversations as OTEL traces:
```
Trace: "Add JWT auth feature"
├─ Span: User prompt "Add JWT auth"
├─ Span: Claude reads existing code
├─ Span: User approves changes
├─ Span: User prompt "Also add refresh tokens"
└─ Span: User prompt "Run the tests"
```

### Success Metrics

Track task completion:
- Did tests pass?
- Was code committed?
- How long did it take?

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [02-vscode-otel.md](./02-vscode-otel.md) - Correlate with file edits
- [06-mqtt-to-otel-bridge.md](./06-mqtt-to-otel-bridge.md) - MQTT integration pattern

---

**Status**: Ready for implementation
**Next Step**: Create hook scripts and test with OTEL Collector
