#!/usr/bin/env bash
# Setup agent-specific Claude Code config directory
# This installs the "agents" branch of superpowers for agent use
set -euo pipefail

AGENTS_CONFIG_DIR="${1:-$HOME/.claude-agents}"

echo "Setting up agent Claude config at: $AGENTS_CONFIG_DIR"

mkdir -p "$AGENTS_CONFIG_DIR/plugins/marketplaces"
mkdir -p "$AGENTS_CONFIG_DIR/plugins/cache"
mkdir -p "$AGENTS_CONFIG_DIR/skills"

# Create settings.json with agent plugins enabled
cat > "$AGENTS_CONFIG_DIR/settings.json" << 'SETTINGS'
{
  "enabledPlugins": {
    "superpowers@superpowers-agents": true
  }
}
SETTINGS

# Register the agents branch as a marketplace
cat > "$AGENTS_CONFIG_DIR/plugins/known_marketplaces.json" << 'MARKETPLACES'
{
  "superpowers-agents": {
    "source": "github:opcheese/superpowers#agents"
  }
}
MARKETPLACES

# Initialize empty installed plugins (claude will install on first run)
cat > "$AGENTS_CONFIG_DIR/plugins/installed_plugins.json" << 'INSTALLED'
{}
INSTALLED

echo "Done. Agent config dir created at $AGENTS_CONFIG_DIR"
echo ""
echo "Next steps:"
echo "  1. Run 'claude plugins install superpowers@superpowers-agents' with CLAUDE_CONFIG_DIR=$AGENTS_CONFIG_DIR"
echo "  2. Or manually clone the agents branch into the cache dir"
