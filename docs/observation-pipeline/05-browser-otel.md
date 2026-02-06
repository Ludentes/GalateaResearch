# Browser Activity Observation via OTEL

**Date**: 2026-02-06
**Source**: Browser activity (tabs, searches, sites visited)
**Priority**: High (research & context)
**Status**: Design

---

## Overview

Track browser activity to understand:
- Which sites you visit (documentation, Stack Overflow, GitHub)
- Search queries (what you're looking for)
- Time spent on pages
- Tab switching patterns

This reveals **what you're researching** and **what you're learning**.

---

## Implementation: Browser Extension

Build a browser extension (Chrome/Firefox) that emits OTEL events.

### Extension Structure

```
browser-galatea-observer/
├── manifest.json
├── background.js          # Service worker (Chrome) or background script (Firefox)
├── content-script.js      # Injected into pages (optional)
├── otel-exporter.js       # OTEL HTTP exporter
└── config.js              # Settings
```

---

## Core Extension Code

### manifest.json (Chrome Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "Galatea Activity Observer",
  "version": "0.1.0",
  "description": "Observes browser activity for Galatea AI assistant",
  "permissions": [
    "tabs",
    "webNavigation",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "options_page": "options.html"
}
```

### background.js

```javascript
import { OtelExporter } from './otel-exporter.js'

// Initialize
let exporter
let config = {}
let currentTabId = null
let tabStartTime = {}

// Load config
chrome.storage.sync.get(['collectorUrl', 'sessionId', 'enabled', 'excludeDomains'], (items) => {
  config = {
    collectorUrl: items.collectorUrl || 'http://localhost:4318',
    sessionId: items.sessionId || 'default',
    enabled: items.enabled !== false,
    excludeDomains: items.excludeDomains || ['chrome://', 'chrome-extension://', 'about:']
  }

  exporter = new OtelExporter(config.collectorUrl, config.sessionId)
})

// Helper: Should observe this URL?
function shouldObserve(url) {
  if (!config.enabled) return false
  if (!url) return false

  for (const exclude of config.excludeDomains) {
    if (url.startsWith(exclude)) return false
  }

  return true
}

// Helper: Extract domain
function getDomain(url) {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

// Helper: Detect search query
function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url)
    const params = ['q', 'query', 'search', 'p', 'text']

    for (const param of params) {
      const value = urlObj.searchParams.get(param)
      if (value) return value
    }
  } catch {}

  return null
}

// Tab activated (user switched to this tab)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTabId = activeInfo.tabId

  // Get tab info
  const tab = await chrome.tabs.get(activeInfo.tabId)
  if (!shouldObserve(tab.url)) return

  // Record tab start time
  tabStartTime[tab.id] = Date.now()

  await exporter.emitEvent(
    'browser_tab_active',
    `Viewing: ${tab.title}`,
    {
      domain: getDomain(tab.url),
      url: tab.url,
      title: tab.title,
      tab_id: tab.id
    }
  )
})

// Tab updated (page loaded, title changed)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!shouldObserve(tab.url)) return

  // Page load complete
  if (changeInfo.status === 'complete') {
    const searchQuery = extractSearchQuery(tab.url)

    if (searchQuery) {
      // Search detected
      await exporter.emitEvent(
        'browser_search',
        `Searched: ${searchQuery}`,
        {
          domain: getDomain(tab.url),
          search_query: searchQuery,
          search_engine: getDomain(tab.url),
          tab_id: tabId
        }
      )
    } else {
      // Regular page load
      await exporter.emitEvent(
        'browser_page_load',
        `Loaded: ${tab.title}`,
        {
          domain: getDomain(tab.url),
          url: tab.url,
          title: tab.title,
          tab_id: tabId
        }
      )
    }
  }
})

// Tab closed (calculate time spent)
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (!tabStartTime[tabId]) return

  const duration = Date.now() - tabStartTime[tabId]
  delete tabStartTime[tabId]

  // Only record if spent >3 seconds
  if (duration < 3000) return

  await exporter.emitEvent(
    'browser_tab_close',
    `Closed tab (${Math.round(duration / 1000)}s)`,
    {
      tab_id: tabId,
      duration_ms: duration
    }
  )
})

// Navigation (within same tab)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return // Ignore iframes

  const tab = await chrome.tabs.get(details.tabId)
  if (!shouldObserve(tab.url)) return

  await exporter.emitEvent(
    'browser_navigation',
    `Navigated: ${tab.title}`,
    {
      domain: getDomain(tab.url),
      url: tab.url,
      title: tab.title,
      tab_id: details.tabId
    }
  )
})
```

### otel-exporter.js

```javascript
export class OtelExporter {
  constructor(collectorUrl, sessionId) {
    this.collectorUrl = `${collectorUrl}/v1/logs`
    this.sessionId = sessionId
  }

  async emitEvent(activityType, body, attributes) {
    const now = Date.now() * 1_000_000 // Convert to nanoseconds

    // Convert attributes to OTEL format
    const otelAttributes = [
      { key: 'activity.type', value: { stringValue: activityType } },
      { key: 'session.id', value: { stringValue: this.sessionId } }
    ]

    for (const [key, value] of Object.entries(attributes)) {
      const otelKey = `browser.${key}`

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
            { key: 'source.type', value: { stringValue: 'browser' } }
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
      await fetch(this.collectorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (error) {
      console.error('Failed to emit OTEL event:', error)
    }
  }
}
```

---

## Event Schema

### Tab Active Event

**Event Type**: `browser_tab_active`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "browser_tab_active" | `browser_tab_active` |
| `browser.domain` | string | Domain of page | `stackoverflow.com` |
| `browser.url` | string | Full URL | `https://stackoverflow.com/questions/...` |
| `browser.title` | string | Page title | `JWT best practices - Stack Overflow` |
| `browser.tab_id` | int | Chrome tab ID | `12345` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Viewing: JWT best practices - Stack Overflow"`

### Search Event

**Event Type**: `browser_search`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "browser_search" | `browser_search` |
| `browser.search_query` | string | Search text | `jwt best practices node` |
| `browser.search_engine` | string | Engine domain | `google.com` |
| `browser.domain` | string | Domain | `google.com` |
| `browser.tab_id` | int | Chrome tab ID | `12345` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Searched: jwt best practices node"`

### Page Load Event

**Event Type**: `browser_page_load`

**Attributes**: Same as `browser_tab_active`

**Body**: `"Loaded: Express.js Documentation"`

### Tab Close Event

**Event Type**: `browser_tab_close`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "browser_tab_close" | `browser_tab_close` |
| `browser.tab_id` | int | Chrome tab ID | `12345` |
| `browser.duration_ms` | int | Time spent (ms) | `45000` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Closed tab (45s)"`

---

## Options Page (Settings UI)

### options.html

```html
<!DOCTYPE html>
<html>
<head>
  <title>Galatea Observer Settings</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    label { display: block; margin: 10px 0 5px; }
    input[type="text"] { width: 400px; padding: 5px; }
    button { margin-top: 20px; padding: 8px 16px; }
  </style>
</head>
<body>
  <h1>Galatea Observer Settings</h1>

  <label>
    <input type="checkbox" id="enabled" />
    Enable observation
  </label>

  <label for="collectorUrl">OpenTelemetry Collector URL:</label>
  <input type="text" id="collectorUrl" placeholder="http://localhost:4318" />

  <label for="sessionId">Galatea Session ID:</label>
  <input type="text" id="sessionId" placeholder="default" />

  <label for="excludeDomains">Exclude domains (comma-separated):</label>
  <input type="text" id="excludeDomains" placeholder="chrome://,about:" />

  <button id="save">Save Settings</button>
  <div id="status"></div>

  <script src="options.js"></script>
</body>
</html>
```

### options.js

```javascript
// Load settings
chrome.storage.sync.get(['collectorUrl', 'sessionId', 'enabled', 'excludeDomains'], (items) => {
  document.getElementById('collectorUrl').value = items.collectorUrl || 'http://localhost:4318'
  document.getElementById('sessionId').value = items.sessionId || 'default'
  document.getElementById('enabled').checked = items.enabled !== false
  document.getElementById('excludeDomains').value = items.excludeDomains?.join(', ') || 'chrome://, about:'
})

// Save settings
document.getElementById('save').addEventListener('click', () => {
  const config = {
    collectorUrl: document.getElementById('collectorUrl').value,
    sessionId: document.getElementById('sessionId').value,
    enabled: document.getElementById('enabled').checked,
    excludeDomains: document.getElementById('excludeDomains').value.split(',').map(d => d.trim())
  }

  chrome.storage.sync.set(config, () => {
    const status = document.getElementById('status')
    status.textContent = 'Settings saved!'
    setTimeout(() => status.textContent = '', 2000)
  })
})
```

---

## Privacy & Filtering

### Sensitive Domains

Exclude banking, medical, private sites:

```javascript
const SENSITIVE_PATTERNS = [
  /bank/, /banking/, /paypal/, /venmo/,
  /health/, /medical/, /patient/,
  /private/, /personal/
]

function isSensitive(url) {
  const lower = url.toLowerCase()
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(lower))
}

// Skip observation
if (isSensitive(tab.url)) return
```

### URL Redaction

Don't send full URL if it contains sensitive info:

```javascript
function redactUrl(url) {
  try {
    const urlObj = new URL(url)

    // Remove query parameters that might be sensitive
    const sensitiveParams = ['token', 'key', 'password', 'auth', 'session']

    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, 'REDACTED')
      }
    }

    return urlObj.toString()
  } catch {
    return url
  }
}
```

### Incognito Mode

Don't observe incognito/private browsing:

```javascript
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId)

  // Skip incognito
  if (tab.incognito) return

  // ... rest of logic
})
```

---

## Correlation with Other Sources

### With Claude Code

User workflow:
1. 10:00:00 - User prompts Claude: "How do I use JWT in Express?" (Claude Code)
2. 10:00:05 - User searches: "jwt express best practices" (Browser)
3. 10:00:10 - User views Stack Overflow (Browser)
4. 10:00:45 - User returns to Claude: "Add JWT middleware" (Claude Code)

Galatea learns: "User researches before implementing"

### With VSCode

1. 10:00:00 - User views `auth.ts` (VSCode)
2. 10:00:05 - User searches "passport jwt strategy" (Browser)
3. 10:00:30 - User views Passport docs (Browser)
4. 10:01:00 - User edits `auth.ts` (VSCode)

Galatea learns: "User references docs while coding"

---

## What We Learn

From browser observation:

**Research Patterns**:
- "User frequently searches Stack Overflow" → Problem-solving style
- "User reads docs thoroughly (5+ min per page)" → Careful learner
- "User quickly skims pages (<30s)" → Knows what to look for

**Knowledge Gaps**:
- "User searched 'async await javascript'" → Needs async help
- "User views JWT docs multiple times" → JWT is unfamiliar

**Domain Expertise**:
- "User rarely searches basic concepts" → Experienced developer
- "User searches advanced patterns" → Looking for best practices

**Tool Discovery**:
- "User visits npm package pages" → Exploring libraries
- "User compares multiple solutions" → Evaluating options

---

## Installation & Deployment

### Local Development

```bash
cd browser-galatea-observer

# Chrome
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select extension directory
```

### Packaging for Distribution

```bash
# Chrome Web Store
zip -r galatea-observer.zip manifest.json background.js otel-exporter.js options.html options.js

# Submit to Chrome Web Store
```

### Firefox Compatibility

Modify manifest.json for Firefox:

```json
{
  "manifest_version": 2,
  "background": {
    "scripts": ["background.js"]
  }
  // ... rest
}
```

---

## Advanced Features

### Content Analysis (Optional)

Inject content script to analyze page content:

```javascript
// content-script.js
// Analyze visible text, code blocks, etc.
const codeBlocks = document.querySelectorAll('pre, code')
if (codeBlocks.length > 5) {
  // User is viewing code-heavy page (docs, tutorials)
  chrome.runtime.sendMessage({
    type: 'page_analysis',
    hasCode: true,
    codeLanguages: detectLanguages(codeBlocks)
  })
}
```

### Scroll Depth

Track how much of page user reads:

```javascript
let maxScrollDepth = 0

window.addEventListener('scroll', () => {
  const scrolled = (window.scrollY / document.body.scrollHeight) * 100
  maxScrollDepth = Math.max(maxScrollDepth, scrolled)
})

window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({
    type: 'scroll_depth',
    depth: maxScrollDepth
  })
})
```

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [01-claude-code-otel.md](./01-claude-code-otel.md) - Correlate with coding
- [02-vscode-otel.md](./02-vscode-otel.md) - Correlate with file edits

---

**Status**: Ready for implementation
**Next Step**: Build Chrome extension prototype
