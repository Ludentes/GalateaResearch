# Discord Activity Observation via OTEL

**Date**: 2026-02-06
**Source**: Discord messages and activity
**Priority**: Low (social context)
**Status**: Design

---

## Overview

Track Discord activity to understand:
- When you send messages (and to whom)
- Which channels/servers you're active in
- Voice chat participation
- Social context around work

This provides **social context** and **collaboration patterns**.

---

## Implementation: Discord Bot

Build a self-bot or bot that observes your activity.

> **Warning**: Discord Self-Bots violate ToS. Use a regular bot with proper permissions instead, or use Discord's official API webhooks.

### Option A: Discord Bot (Recommended)

Create a bot that logs your messages in servers where it has permission.

**Bot Setup**:

```bash
# Install discord.js
npm install discord.js @opentelemetry/api
```

**Bot Code**:

```javascript
// galatea-discord-observer.js
const { Client, GatewayIntentBits } = require('discord.js')
const fetch = require('node-fetch')

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN
const COLLECTOR_URL = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318'
const SESSION_ID = process.env.GALATEA_SESSION_ID || 'default'
const USER_ID = process.env.DISCORD_USER_ID // Your Discord user ID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
})

async function emitOtelEvent(activityType, body, attributes) {
  const now = Date.now() * 1_000_000 // nanoseconds

  const otelAttributes = [
    { key: 'activity.type', value: { stringValue: activityType } },
    { key: 'session.id', value: { stringValue: SESSION_ID } }
  ]

  for (const [key, value] of Object.entries(attributes)) {
    const otelKey = `discord.${key}`

    if (typeof value === 'string') {
      otelAttributes.push({ key: otelKey, value: { stringValue: value } })
    } else if (typeof value === 'number') {
      otelAttributes.push({ key: otelKey, value: { intValue: value } })
    } else if (typeof value === 'boolean') {
      otelAttributes.push({ key: otelKey, value: { boolValue: value } })
    }
  }

  const payload = {
    resourceLogs: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'galatea-observer' } },
          { key: 'source.type', value: { stringValue: 'discord' } }
        ]
      },
      scopeLogs: [{
        logRecords: [{
          timeUnixNano: now.toString(),
          body: { stringValue: body },
          attributes: otelAttributes
        }]
      }]
    }]
  }

  try {
    await fetch(`${COLLECTOR_URL}/v1/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.error('Failed to emit OTEL event:', error)
  }
}

// Message sent (by you)
client.on('messageCreate', async (message) => {
  // Only observe your own messages
  if (message.author.id !== USER_ID) return

  const guild = message.guild
  const channel = message.channel

  await emitOtelEvent(
    'discord_message_sent',
    `Sent message in #${channel.name}`,
    {
      server_name: guild?.name || 'DM',
      server_id: guild?.id || 'dm',
      channel_name: channel.name,
      channel_id: channel.id,
      message_length: message.content.length,
      has_attachments: message.attachments.size > 0,
      is_dm: !guild
    }
  )
})

// Voice state change (joined/left voice channel)
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.member.id !== USER_ID) return

  // Joined voice channel
  if (!oldState.channel && newState.channel) {
    await emitOtelEvent(
      'discord_voice_join',
      `Joined voice: ${newState.channel.name}`,
      {
        server_name: newState.guild.name,
        server_id: newState.guild.id,
        channel_name: newState.channel.name,
        channel_id: newState.channel.id,
        is_muted: newState.selfMute,
        is_deafened: newState.selfDeaf
      }
    )
  }

  // Left voice channel
  if (oldState.channel && !newState.channel) {
    await emitOtelEvent(
      'discord_voice_leave',
      `Left voice: ${oldState.channel.name}`,
      {
        server_name: oldState.guild.name,
        server_id: oldState.guild.id,
        channel_name: oldState.channel.name,
        channel_id: oldState.channel.id
      }
    )
  }
})

client.login(DISCORD_TOKEN)
```

### Option B: Discord Webhook (Passive)

If you don't want a bot, use webhooks to log specific events manually.

**Webhook Integration**:

```javascript
// Add to your Discord client/app
const webhookUrl = 'https://your-galatea-api.com/api/discord-webhook'

// On message send
fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: 'message_sent',
    server: message.guild.name,
    channel: message.channel.name,
    timestamp: Date.now()
  })
})
```

Your API endpoint converts to OTEL and forwards to Collector.

---

## Event Schema

### Message Sent Event

**Event Type**: `discord_message_sent`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "discord_message_sent" | `discord_message_sent` |
| `discord.server_name` | string | Server name | `TypeScript Community` |
| `discord.server_id` | string | Server ID | `123456789` |
| `discord.channel_name` | string | Channel name | `general` |
| `discord.channel_id` | string | Channel ID | `987654321` |
| `discord.message_length` | int | Character count | `142` |
| `discord.has_attachments` | bool | Has files | `false` |
| `discord.is_dm` | bool | Is direct message | `false` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Sent message in #general"`

### Voice Join Event

**Event Type**: `discord_voice_join`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "discord_voice_join" | `discord_voice_join` |
| `discord.server_name` | string | Server name | `Dev Team` |
| `discord.channel_name` | string | Voice channel | `Engineering Voice` |
| `discord.is_muted` | bool | Self-muted | `false` |
| `discord.is_deafened` | bool | Self-deafened | `false` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Joined voice: Engineering Voice"`

### Voice Leave Event

**Event Type**: `discord_voice_leave`

**Attributes**: Similar to voice_join

**Body**: `"Left voice: Engineering Voice"`

---

## Privacy Considerations

### Message Content

**DO NOT log message content** (privacy + ToS violation).

Only log metadata:
- That a message was sent
- Where (server, channel)
- When
- Length (optional)

### Sensitive Channels

Exclude certain servers/channels:

```javascript
const EXCLUDE_SERVERS = ['Personal Server', 'Private']
const EXCLUDE_CHANNELS = ['private-chat', 'venting']

if (EXCLUDE_SERVERS.includes(guild?.name)) return
if (EXCLUDE_CHANNELS.includes(channel.name)) return
```

### User Consent

Since this observes social activity, ensure:
- User explicitly enables Discord observation
- Clear about what's logged (metadata only, no content)
- Easy to disable

---

## Deployment

### As systemd Service

```ini
# ~/.config/systemd/user/galatea-discord-observer.service
[Unit]
Description=Galatea Discord Observer Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/user/galatea-discord-observer
ExecStart=/usr/bin/node galatea-discord-observer.js
Restart=always
Environment=DISCORD_BOT_TOKEN=your_token_here
Environment=DISCORD_USER_ID=your_user_id
Environment=GALATEA_SESSION_ID=abc123
Environment=OTEL_COLLECTOR_URL=http://localhost:4318

[Install]
WantedBy=default.target
```

### Docker Container

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "galatea-discord-observer.js"]
```

```yaml
# docker-compose.yml
discord-observer:
  build: ./discord-observer
  environment:
    - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
    - DISCORD_USER_ID=${DISCORD_USER_ID}
    - GALATEA_SESSION_ID=abc123
    - OTEL_COLLECTOR_URL=http://otel-collector:4318
  restart: unless-stopped
```

---

## What We Learn

From Discord observation:

**Communication Patterns**:
- "User sends messages during work hours" → Active collaborator
- "User mostly in technical channels" → Technical focus
- "User frequently in voice" → Synchronous collaboration

**Work Context**:
- "User active in #support channel" → Helping others
- "User messages spike before releases" → Coordinating launches
- "User joins voice during incidents" → On-call/debugging

**Social Graph**:
- "User active in TypeScript community" → Learning TS
- "User in multiple dev servers" → Broad interests
- "User rarely DMs" → Public collaboration style

---

## Correlation with Other Sources

### With VSCode

1. 10:00:00 - User sends "Working on auth refactor" (Discord)
2. 10:00:30 - User opens `auth.ts` (VSCode)
3. 10:15:00 - User sends "Done, pushed PR" (Discord)

Context: User announced work, completed it, notified team.

### With Claude Code

1. 10:00:00 - User asks "How to implement OAuth?" (Discord)
2. 10:01:00 - User prompts Claude "Add OAuth to API" (Claude Code)
3. 10:15:00 - User replies "Got it working!" (Discord)

Context: User asked team, used AI assistant, shared success.

---

## Alternatives to Bot

If you don't want to run a bot:

### BetterDiscord Plugin

Create a BetterDiscord plugin that hooks message sending:

```javascript
// galatea-observer-plugin.js
module.exports = (() => {
  return {
    start() {
      // Hook into Discord's message dispatcher
      const MessageDispatcher = BdApi.findModuleByProps('sendMessage')
      BdApi.Patcher.before('GalateaObserver', MessageDispatcher, 'sendMessage', (_, args) => {
        const [channelId, message] = args

        // Emit OTEL event
        fetch('http://localhost:4318/v1/logs', {
          method: 'POST',
          body: JSON.stringify({/* OTEL payload */})
        })
      })
    },
    stop() {
      BdApi.Patcher.unpatchAll('GalateaObserver')
    }
  }
})()
```

> **Note**: BetterDiscord modifications may violate ToS. Use at own risk.

---

## Future Enhancements

### Reaction Tracking

Track reactions to understand engagement:

```javascript
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.id !== USER_ID) return

  await emitOtelEvent(
    'discord_reaction_added',
    `Reacted with ${reaction.emoji.name}`,
    {
      emoji: reaction.emoji.name,
      message_id: reaction.message.id,
      channel_id: reaction.message.channel.id
    }
  )
})
```

### Mention Detection

Track when you're mentioned:

```javascript
if (message.mentions.users.has(USER_ID)) {
  await emitOtelEvent(
    'discord_mentioned',
    `Mentioned in #${message.channel.name}`,
    {
      server_name: message.guild?.name,
      channel_name: message.channel.name,
      author: message.author.username
    }
  )
}
```

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [01-claude-code-otel.md](./01-claude-code-otel.md) - Correlate with coding
- [05-browser-otel.md](./05-browser-otel.md) - Correlate with research

---

**Status**: Design (low priority)
**Next Step**: Implement only if social context is needed
**Recommendation**: Start with higher priority sources (Claude Code, VSCode, Browser) first
