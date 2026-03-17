# Linux System Activity Observation via OTEL

**Date**: 2026-02-06
**Source**: Linux system events (app launches, focus changes)
**Priority**: Medium (contextual awareness)
**Status**: Design

---

## Overview

Track Linux system activity to understand:
- When applications launch/close
- Which application has focus
- When user switches workspaces/desktops
- When system sleeps/wakes (user presence)

This provides **context** for other observations (coding, browsing).

---

## Implementation Approaches

### Option A: systemd Journal (Recommended)

Monitor systemd journal for application events.

**Advantages**:
- No polling required
- Built-in to most Linux distros
- Rich event data

**Implementation**:

```bash
#!/bin/bash
# galatea-systemd-observer.sh

# Read from systemd journal, follow new entries
journalctl -f -o json --user | while read -r line; do
  # Parse JSON log entry
  MESSAGE=$(echo "$line" | jq -r '.MESSAGE // ""')
  UNIT=$(echo "$line" | jq -r '.UNIT // ""')
  TIMESTAMP=$(echo "$line" | jq -r '._SOURCE_REALTIME_TIMESTAMP // ""')

  # Detect application starts
  if echo "$MESSAGE" | grep -q "Started.*\.service"; then
    APP=$(echo "$MESSAGE" | sed 's/Started \(.*\)\.service/\1/')

    # Emit OTEL event
    curl -s -X POST http://localhost:4318/v1/logs \
      -H "Content-Type: application/json" \
      -d "{
        \"resourceLogs\": [{
          \"resource\": {
            \"attributes\": [
              {\"key\": \"service.name\", \"value\": {\"stringValue\": \"galatea-observer\"}},
              {\"key\": \"source.type\", \"value\": {\"stringValue\": \"linux\"}}
            ]
          },
          \"scopeLogs\": [{
            \"logRecords\": [{
              \"timeUnixNano\": \"${TIMESTAMP}000\",
              \"body\": {\"stringValue\": \"Launched: $APP\"},
              \"attributes\": [
                {\"key\": \"activity.type\", \"value\": {\"stringValue\": \"linux_app_launch\"}},
                {\"key\": \"linux.app_name\", \"value\": {\"stringValue\": \"$APP\"}},
                {\"key\": \"linux.unit\", \"value\": {\"stringValue\": \"$UNIT\"}},
                {\"key\": \"session.id\", \"value\": {\"stringValue\": \"${GALATEA_SESSION_ID:-unknown}\"}}
              ]
            }]
          }]
        }]
      }"
  fi
done
```

**Run as systemd service**:

```ini
# ~/.config/systemd/user/galatea-observer.service
[Unit]
Description=Galatea System Observer
After=network.target

[Service]
ExecStart=/home/user/.local/bin/galatea-systemd-observer.sh
Restart=always
Environment=GALATEA_SESSION_ID=abc123

[Install]
WantedBy=default.target
```

### Option B: X11/Wayland Window Tracking

Track focused window (which app is active).

**X11 Implementation**:

```bash
#!/bin/bash
# galatea-window-observer.sh

LAST_WINDOW=""

while true; do
  # Get active window ID
  WINDOW_ID=$(xdotool getactivewindow 2>/dev/null)

  if [ -z "$WINDOW_ID" ]; then
    sleep 1
    continue
  fi

  # Get window info
  WINDOW_CLASS=$(xprop -id "$WINDOW_ID" WM_CLASS 2>/dev/null | cut -d'"' -f4)
  WINDOW_NAME=$(xprop -id "$WINDOW_ID" WM_NAME 2>/dev/null | cut -d'"' -f2)

  # Detect window change
  if [ "$WINDOW_ID" != "$LAST_WINDOW" ]; then
    LAST_WINDOW="$WINDOW_ID"

    # Emit OTEL event
    TIMESTAMP=$(date +%s%N)

    curl -s -X POST http://localhost:4318/v1/logs \
      -H "Content-Type: application/json" \
      -d "{
        \"resourceLogs\": [{
          \"resource\": {
            \"attributes\": [
              {\"key\": \"service.name\", \"value\": {\"stringValue\": \"galatea-observer\"}},
              {\"key\": \"source.type\", \"value\": {\"stringValue\": \"linux\"}}
            ]
          },
          \"scopeLogs\": [{
            \"logRecords\": [{
              \"timeUnixNano\": \"$TIMESTAMP\",
              \"body\": {\"stringValue\": \"Focused: $WINDOW_CLASS - $WINDOW_NAME\"},
              \"attributes\": [
                {\"key\": \"activity.type\", \"value\": {\"stringValue\": \"linux_window_focus\"}},
                {\"key\": \"linux.window_class\", \"value\": {\"stringValue\": \"$WINDOW_CLASS\"}},
                {\"key\": \"linux.window_name\", \"value\": {\"stringValue\": \"$WINDOW_NAME\"}},
                {\"key\": \"session.id\", \"value\": {\"stringValue\": \"${GALATEA_SESSION_ID:-unknown}\"}}
              ]
            }]
          }]
        }]
      }"
  fi

  sleep 1
done
```

**Wayland Alternative** (compositor-specific):

Wayland is more restricted. Options:
- GNOME: Use D-Bus to monitor `org.gnome.Shell` window changes
- KDE: Monitor KWin via D-Bus
- Sway: Use `swaymsg -t subscribe -m '["window"]'`

**Sway Example**:

```bash
swaymsg -t subscribe -m '["window"]' | while read -r event; do
  # Parse event JSON
  CHANGE=$(echo "$event" | jq -r '.change')
  APP_ID=$(echo "$event" | jq -r '.container.app_id')
  WINDOW_NAME=$(echo "$event" | jq -r '.container.name')

  if [ "$CHANGE" = "focus" ]; then
    # Emit OTEL event for focus change
    # ... (similar to X11 example)
  fi
done
```

### Option C: D-Bus Monitoring (App Launches)

Monitor D-Bus for application lifecycle events.

```bash
#!/bin/bash
# Monitor D-Bus for application launches

dbus-monitor --session "interface='org.freedesktop.Application'" | \
  while read -r line; do
    if echo "$line" | grep -q "Activate"; then
      APP=$(echo "$line" | grep -oP 'path=/.*' | cut -d'/' -f4)

      # Emit OTEL event
      # ... (similar structure)
    fi
  done
```

---

## Event Schema

### App Launch Event

**Event Type**: `linux_app_launch`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "linux_app_launch" | `linux_app_launch` |
| `linux.app_name` | string | Application name | `firefox`, `slack`, `discord` |
| `linux.unit` | string | systemd unit (if available) | `firefox.service` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Launched: firefox"`

### Window Focus Event

**Event Type**: `linux_window_focus`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "linux_window_focus" | `linux_window_focus` |
| `linux.window_class` | string | Window class | `Google-chrome`, `Code` |
| `linux.window_name` | string | Window title | `JWT tutorial - Chrome` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Focused: Google-chrome - JWT tutorial - Chrome"`

### System Sleep/Wake Event

**Event Type**: `linux_system_sleep` / `linux_system_wake`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | "linux_system_sleep" or "linux_system_wake" | `linux_system_wake` |
| `linux.suspend_type` | string | "suspend", "hibernate" | `suspend` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"System woke from suspend"`

---

## Systemd Integration

### Observer Service

```ini
# ~/.config/systemd/user/galatea-system-observer.service
[Unit]
Description=Galatea System Activity Observer
After=network.target

[Service]
Type=simple
ExecStart=/home/user/.local/bin/galatea-system-observer.sh
Restart=always
Environment=GALATEA_SESSION_ID=%h/.galatea/current-session

[Install]
WantedBy=default.target
```

### Enable & Start

```bash
systemctl --user enable galatea-system-observer.service
systemctl --user start galatea-system-observer.service
```

---

## What We Learn

From Linux activity observation:

**Work Patterns**:
- "User launches Slack at 9am" → Work start time
- "User closes Discord when coding" → Minimizes distractions
- "User switches to terminal frequently" → CLI-focused

**Context Awareness**:
- "User opened Spotify" → Probably focusing on deep work
- "User launched multiple browsers" → Comparing/researching
- "System went to sleep at 11pm" → End of work day

**Application Usage**:
- "User uses VS Code 80% of the time" → Primary editor
- "User rarely uses IDEs" → Text editor preference
- "User has Slack always open" → Collaborative work

---

## Privacy & Filtering

### Exclude Personal Apps

```bash
# Exclude list
EXCLUDE_APPS=("netflix" "spotify" "steam" "games")

for app in "${EXCLUDE_APPS[@]}"; do
  if echo "$APP_NAME" | grep -iq "$app"; then
    exit 0  # Skip observation
  fi
done
```

### Redact Window Titles

Some window titles contain sensitive info:

```bash
# Redact patterns
WINDOW_NAME=$(echo "$WINDOW_NAME" | sed 's/\(password\|secret\|key\)/REDACTED/gi')
```

---

## Correlation with Other Sources

### With VSCode

1. 10:00:00 - User launches `code` (Linux)
2. 10:00:05 - VSCode opens `auth.ts` (VSCode)
3. 10:05:00 - User switches to browser (Linux)
4. 10:05:05 - Browser loads JWT docs (Browser)

Complete picture of user switching between tools.

### With Claude Code

1. 10:00:00 - User launches terminal (Linux)
2. 10:00:02 - User runs `claude` (Linux/systemd)
3. 10:00:05 - Claude Code prompt (Claude Code)

Context: User is coding via CLI assistant.

---

## Minimal MVP Implementation

**Simple bash script** that combines window tracking + OTEL export:

```bash
#!/bin/bash
# /home/user/.local/bin/galatea-linux-observer

COLLECTOR_URL="http://localhost:4318/v1/logs"
SESSION_ID=$(cat ~/.galatea/current-session 2>/dev/null || echo "default")
LAST_WINDOW=""

emit_otel_event() {
  local activity_type=$1
  local body=$2
  local app_name=$3
  local window_class=$4
  local timestamp=$(date +%s%N)

  curl -s -X POST "$COLLECTOR_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"resourceLogs\": [{
        \"resource\": {
          \"attributes\": [
            {\"key\": \"service.name\", \"value\": {\"stringValue\": \"galatea-observer\"}},
            {\"key\": \"source.type\", \"value\": {\"stringValue\": \"linux\"}}
          ]
        },
        \"scopeLogs\": [{
          \"logRecords\": [{
            \"timeUnixNano\": \"$timestamp\",
            \"body\": {\"stringValue\": \"$body\"},
            \"attributes\": [
              {\"key\": \"activity.type\", \"value\": {\"stringValue\": \"$activity_type\"}},
              {\"key\": \"linux.window_class\", \"value\": {\"stringValue\": \"$window_class\"}},
              {\"key\": \"session.id\", \"value\": {\"stringValue\": \"$SESSION_ID\"}}
            ]
          }]
        }]
      }]
    }"
}

# Main loop
while true; do
  WINDOW_ID=$(xdotool getactivewindow 2>/dev/null)

  if [ -n "$WINDOW_ID" ] && [ "$WINDOW_ID" != "$LAST_WINDOW" ]; then
    WINDOW_CLASS=$(xprop -id "$WINDOW_ID" WM_CLASS 2>/dev/null | cut -d'"' -f4)
    WINDOW_NAME=$(xprop -id "$WINDOW_ID" WM_NAME 2>/dev/null | cut -d'"' -f2)

    emit_otel_event \
      "linux_window_focus" \
      "Focused: $WINDOW_CLASS - $WINDOW_NAME" \
      "$WINDOW_CLASS" \
      "$WINDOW_CLASS"

    LAST_WINDOW="$WINDOW_ID"
  fi

  sleep 2
done
```

**Install & Run**:

```bash
chmod +x ~/.local/bin/galatea-linux-observer

# Add to autostart
echo "~/.local/bin/galatea-linux-observer &" >> ~/.bashrc
```

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [01-claude-code-otel.md](./01-claude-code-otel.md) - Correlate coding context
- [02-vscode-otel.md](./02-vscode-otel.md) - Correlate file editing

---

**Status**: Ready for implementation (start with X11 window tracking)
**Next Step**: Create bash script observer and test
