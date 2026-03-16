#!/usr/bin/env bash
# Setup agent-specific Claude Code config directory
#
# Creates ~/.claude-agents with credentials, settings, and agent skills.
# Agent specs reference this via `claude_config_dir` field.
# The tick pipeline sets CLAUDE_CONFIG_DIR before spawning adapters.
#
# Usage:
#   ./scripts/setup-agent-config.sh [config_dir]
#   Default: ~/.claude-agents
#
# Prerequisites:
#   - Claude Code installed and authenticated (~/.claude/.credentials.json)

set -euo pipefail

AGENTS_CONFIG_DIR="${1:-$HOME/.claude-agents}"
SOURCE_DIR="$HOME/.claude"

echo "Setting up agent Claude config at: $AGENTS_CONFIG_DIR"

# 1. Create directory structure
mkdir -p "$AGENTS_CONFIG_DIR/plugins"
mkdir -p "$AGENTS_CONFIG_DIR/skills/escalate"
echo "  Created directory structure"

# 2. Copy credentials from main Claude config
if [ -f "$SOURCE_DIR/.credentials.json" ]; then
  cp "$SOURCE_DIR/.credentials.json" "$AGENTS_CONFIG_DIR/.credentials.json"
  echo "  Copied credentials from $SOURCE_DIR"
else
  echo "  WARNING: $SOURCE_DIR/.credentials.json not found"
  echo "  Agents won't be able to authenticate. Run 'claude login' first."
fi

# 3. Create minimal settings
cat > "$AGENTS_CONFIG_DIR/settings.json" << 'SETTINGS'
{}
SETTINGS
echo "  Created settings.json"

# 4. Create the escalation skill
cat > "$AGENTS_CONFIG_DIR/skills/escalate/SKILL.md" << 'SKILL'
---
name: escalate
description: Signal that you need human help. Use when blocked, uncertain, lacking knowledge, or facing a safety-sensitive action you cannot authorize.
user-invokable: true
---

# Escalate

You are escalating because you need human help to proceed with your current task.

## When to Use

- You lack knowledge to proceed
- You are blocked by an external dependency
- You are uncertain about the right approach and need direction
- You detect a potentially harmful or irreversible action that needs human approval

## How to Escalate

1. Determine the escalation category:
   - `knowledge_gap` — You don't know enough to proceed
   - `blocked` — External blocker prevents progress
   - `uncertain` — You need direction on approach
   - `safety` — Action requires human authorization

2. Write a JSON file to `.escalations/{taskId}.json` in your working directory:

```json
{
  "taskId": "<your current task ID>",
  "agentId": "<your agent ID>",
  "reason": "<Clear, specific explanation of what you need help with>",
  "category": "<one of: knowledge_gap, blocked, uncertain, safety>",
  "timestamp": "<ISO 8601 timestamp>"
}
```

3. Create the `.escalations/` directory if it doesn't exist.

4. After writing the file, **stop working on the task** and report that you escalated.

## Important

- Be specific in your reason. Include what you've already tried.
- The tick loop will pick up this file and route your escalation to the right person.
SKILL
echo "  Created escalation skill"

echo ""
echo "Done. Agent config at: $AGENTS_CONFIG_DIR"
echo "Agent specs should have: claude_config_dir: \"$AGENTS_CONFIG_DIR\""
