# VSCode Activity Observation via OTEL

**Date**: 2026-02-06
**Source**: VSCode editor activity
**Priority**: High (what files you work on)
**Status**: Design

---

## Overview

Track VSCode activity to understand:
- Which files you open/edit/save
- When you start/stop debugging
- Which extensions you use
- Navigation patterns (jump to definition, find references)
- Git operations within VSCode

This reveals **what you work on** and **how you navigate code**.

---

## Implementation: VSCode Extension

Build a lightweight VSCode extension that emits OTEL events to the Collector.

### Extension Structure

```
vscode-galatea-observer/
├── package.json
├── src/
│   ├── extension.ts         # Main extension entry
│   ├── otel-exporter.ts     # OTEL HTTP exporter
│   ├── listeners/
│   │   ├── file-events.ts   # File open/save/close
│   │   ├── debug-events.ts  # Debug sessions
│   │   ├── git-events.ts    # Git operations
│   │   └── navigation.ts    # Jump to def, etc.
│   └── config.ts            # Settings
└── tsconfig.json
```

---

## Core Extension Code

### extension.ts

```typescript
import * as vscode from 'vscode'
import { OtelExporter } from './otel-exporter'
import { registerFileListeners } from './listeners/file-events'
import { registerDebugListeners } from './listeners/debug-events'
import { registerGitListeners } from './listeners/git-events'

let exporter: OtelExporter

export function activate(context: vscode.ExtensionContext) {
  // Initialize OTEL exporter
  const config = vscode.workspace.getConfiguration('galatea')
  const collectorUrl = config.get<string>('collectorUrl') || 'http://localhost:4318'
  const sessionId = config.get<string>('sessionId') || 'default'

  exporter = new OtelExporter(collectorUrl, sessionId)

  // Register all event listeners
  registerFileListeners(context, exporter)
  registerDebugListeners(context, exporter)
  registerGitListeners(context, exporter)

  console.log('Galatea Observer extension activated')
}

export function deactivate() {
  exporter?.flush()
}
```

### otel-exporter.ts

```typescript
import fetch from 'node-fetch'

interface OtelLogRecord {
  timeUnixNano: string
  body: { stringValue: string }
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: number; boolValue?: boolean } }>
}

export class OtelExporter {
  private collectorUrl: string
  private sessionId: string

  constructor(collectorUrl: string, sessionId: string) {
    this.collectorUrl = `${collectorUrl}/v1/logs`
    this.sessionId = sessionId
  }

  async emitEvent(activityType: string, body: string, attributes: Record<string, string | number | boolean>) {
    const now = Date.now() * 1_000_000 // Convert to nanoseconds

    const payload = {
      resourceLogs: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'galatea-observer' } },
            { key: 'source.type', value: { stringValue: 'vscode' } }
          ]
        },
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: now.toString(),
            body: { stringValue: body },
            attributes: [
              { key: 'activity.type', value: { stringValue: activityType } },
              { key: 'session.id', value: { stringValue: this.sessionId } },
              ...Object.entries(attributes).map(([key, value]) => ({
                key: `vscode.${key}`,
                value: typeof value === 'string' ? { stringValue: value } :
                       typeof value === 'number' ? { intValue: value } :
                       { boolValue: value }
              }))
            ]
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

  async flush() {
    // Placeholder for batching in future
  }
}
```

### listeners/file-events.ts

```typescript
import * as vscode from 'vscode'
import { OtelExporter } from '../otel-exporter'

export function registerFileListeners(context: vscode.ExtensionContext, exporter: OtelExporter) {
  // File opened
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return

      const doc = editor.document
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
      const relativePath = workspaceFolder
        ? vscode.workspace.asRelativePath(doc.uri)
        : doc.uri.fsPath

      await exporter.emitEvent(
        'vscode_file_open',
        `Opened: ${relativePath}`,
        {
          file_path: doc.uri.fsPath,
          relative_path: relativePath,
          language: doc.languageId,
          line_count: doc.lineCount,
          is_untitled: doc.isUntitled,
          workspace: workspaceFolder?.name || 'none'
        }
      )
    })
  )

  // File saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
      const relativePath = workspaceFolder
        ? vscode.workspace.asRelativePath(doc.uri)
        : doc.uri.fsPath

      // Try to get diff stats (lines changed)
      // Note: This requires git extension API
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports
      let linesChanged = 0

      if (gitExtension) {
        const git = gitExtension.getAPI(1)
        const repo = git.repositories.find((r: any) =>
          doc.uri.fsPath.startsWith(r.rootUri.fsPath)
        )

        if (repo) {
          // Get diff for this file
          const diff = await repo.diffWithHEAD(doc.uri.fsPath)
          // Parse diff to count changed lines (simplified)
          linesChanged = diff?.split('\n').filter((line: string) =>
            line.startsWith('+') || line.startsWith('-')
          ).length || 0
        }
      }

      await exporter.emitEvent(
        'vscode_file_save',
        `Saved: ${relativePath}`,
        {
          file_path: doc.uri.fsPath,
          relative_path: relativePath,
          language: doc.languageId,
          line_count: doc.lineCount,
          lines_changed: linesChanged,
          workspace: workspaceFolder?.name || 'none'
        }
      )
    })
  )

  // File closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(async (doc) => {
      const relativePath = vscode.workspace.asRelativePath(doc.uri)

      await exporter.emitEvent(
        'vscode_file_close',
        `Closed: ${relativePath}`,
        {
          file_path: doc.uri.fsPath,
          relative_path: relativePath,
          language: doc.languageId
        }
      )
    })
  )
}
```

### listeners/debug-events.ts

```typescript
import * as vscode from 'vscode'
import { OtelExporter } from '../otel-exporter'

export function registerDebugListeners(context: vscode.ExtensionContext, exporter: OtelExporter) {
  // Debug session started
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      await exporter.emitEvent(
        'vscode_debug_start',
        `Started debugging: ${session.name}`,
        {
          session_name: session.name,
          debug_type: session.type,
          workspace_folder: session.workspaceFolder?.name || 'none',
          configuration: session.configuration.name || 'unknown'
        }
      )
    })
  )

  // Debug session terminated
  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(async (session) => {
      await exporter.emitEvent(
        'vscode_debug_end',
        `Stopped debugging: ${session.name}`,
        {
          session_name: session.name,
          debug_type: session.type
        }
      )
    })
  )

  // Breakpoint hit (if we can detect it)
  context.subscriptions.push(
    vscode.debug.onDidChangeBreakpoints(async (event) => {
      for (const bp of event.added) {
        if (bp instanceof vscode.SourceBreakpoint) {
          await exporter.emitEvent(
            'vscode_breakpoint_added',
            `Added breakpoint: ${bp.location.uri.fsPath}:${bp.location.range.start.line}`,
            {
              file_path: bp.location.uri.fsPath,
              line: bp.location.range.start.line,
              enabled: bp.enabled
            }
          )
        }
      }
    })
  )
}
```

### listeners/git-events.ts

```typescript
import * as vscode from 'vscode'
import { OtelExporter } from '../otel-exporter'

export function registerGitListeners(context: vscode.ExtensionContext, exporter: OtelExporter) {
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports
  if (!gitExtension) return

  const git = gitExtension.getAPI(1)

  // Monitor git operations
  for (const repo of git.repositories) {
    // Branch change
    const onDidChangeState = repo.state.onDidChange(async () => {
      const branch = repo.state.HEAD?.name || 'unknown'

      await exporter.emitEvent(
        'vscode_git_branch_change',
        `Switched to branch: ${branch}`,
        {
          repository: repo.rootUri.fsPath,
          branch: branch,
          commit: repo.state.HEAD?.commit || 'unknown',
          has_changes: repo.state.workingTreeChanges.length > 0
        }
      )
    })

    context.subscriptions.push(onDidChangeState)
  }

  // Note: Git commands (commit, push, pull) are harder to observe directly
  // VSCode doesn't expose these events well
  // Alternative: Watch for .git/refs changes using FileSystemWatcher
}
```

---

## Event Schema

### File Open Event

**Event Type**: `vscode_file_open`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "vscode_file_open" | `vscode_file_open` |
| `vscode.file_path` | string | Absolute path | `/home/user/project/auth.ts` |
| `vscode.relative_path` | string | Relative to workspace | `src/auth.ts` |
| `vscode.language` | string | Language ID | `typescript` |
| `vscode.line_count` | int | Lines in file | `234` |
| `vscode.workspace` | string | Workspace folder name | `my-project` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Opened: src/auth.ts"`

### File Save Event

**Event Type**: `vscode_file_save`

**Attributes**: Same as file_open, plus:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `vscode.lines_changed` | int | Diff lines (approx) | `12` |

**Body**: `"Saved: src/auth.ts"`

### Debug Start Event

**Event Type**: `vscode_debug_start`

**Attributes**:
| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `activity.type` | string | Always "vscode_debug_start" | `vscode_debug_start` |
| `vscode.session_name` | string | Debug session name | `Launch Program` |
| `vscode.debug_type` | string | Debugger type | `node`, `python` |
| `vscode.configuration` | string | Config name | `Debug Tests` |
| `session.id` | string | Galatea session ID | `abc123` |

**Body**: `"Started debugging: Launch Program"`

---

## Extension Configuration

### settings.json

```json
{
  "galatea.enabled": true,
  "galatea.collectorUrl": "http://localhost:4318",
  "galatea.sessionId": "abc123",
  "galatea.excludePatterns": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/.next/**"
  ]
}
```

### package.json

```json
{
  "name": "galatea-observer",
  "displayName": "Galatea Activity Observer",
  "description": "Observes VSCode activity for Galatea AI assistant",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "configuration": {
      "title": "Galatea Observer",
      "properties": {
        "galatea.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable Galatea activity observation"
        },
        "galatea.collectorUrl": {
          "type": "string",
          "default": "http://localhost:4318",
          "description": "OpenTelemetry Collector URL"
        },
        "galatea.sessionId": {
          "type": "string",
          "default": "default",
          "description": "Galatea session ID"
        },
        "galatea.excludePatterns": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["**/node_modules/**", "**/.git/**"],
          "description": "File patterns to exclude from observation"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0"
  },
  "dependencies": {
    "node-fetch": "^3.3.0"
  }
}
```

---

## Privacy & Filtering

### Exclude Patterns

Filter at extension level before sending:

```typescript
function shouldObserve(filePath: string): boolean {
  const config = vscode.workspace.getConfiguration('galatea')
  const excludePatterns = config.get<string[]>('excludePatterns') || []

  for (const pattern of excludePatterns) {
    if (minimatch(filePath, pattern)) {
      return false
    }
  }

  return true
}

// Use in listeners
if (!shouldObserve(doc.uri.fsPath)) return
```

### Disable Observation

```typescript
const enabled = vscode.workspace.getConfiguration('galatea').get<boolean>('enabled')
if (!enabled) return
```

---

## Correlation with Claude Code

Link VSCode events to Claude Code prompts by timestamp and file:

**Scenario**:
1. 10:00:00 - User prompts Claude: "Add JWT auth" (Claude Code)
2. 10:00:05 - Claude reads `auth.ts` (Claude Code)
3. 10:00:10 - User opens `auth.ts` (VSCode) ← **Same file!**
4. 10:00:15 - User edits `auth.ts` (VSCode)
5. 10:00:20 - User saves `auth.ts` (VSCode)

Galatea enrichment layer can correlate:
```typescript
// Find VSCode events within 30s of Claude Code prompt
const relatedVscodeEvents = vscodeEvents.filter(e =>
  Math.abs(e.timestamp - claudeCodePrompt.timestamp) < 30_000 &&
  e.attributes['vscode.file_path'].includes('auth.ts')
)
```

This reveals: "User implemented Claude's suggestion manually"

---

## What We Learn

From VSCode observation:

**Coding Patterns**:
- "User opens test file before implementation" → TDD
- "User frequently uses debugger" → Debug-driven development
- "User switches between many files" → Exploratory work

**Domain Knowledge**:
- "User works in `src/auth/` often" → Auth expert
- "User rarely touches frontend code" → Backend focused

**Workflow**:
- "User saves frequently" → Cautious
- "User has long edit sessions without saving" → Confident/risky

**Tool Usage**:
- "User rarely uses built-in terminal" → External terminal user
- "User frequently uses git panel" → Git-focused workflow

---

## Installation & Deployment

### Local Development

```bash
cd vscode-galatea-observer
npm install
npm run compile
```

Press F5 in VSCode to launch Extension Development Host.

### Packaging

```bash
npm install -g @vscode/vsce
vsce package
# Creates galatea-observer-0.1.0.vsix
```

### Installation

```bash
code --install-extension galatea-observer-0.1.0.vsix
```

Or publish to marketplace for easier distribution.

---

## Future Enhancements

### Terminal Commands

Observe integrated terminal:
```typescript
vscode.window.onDidChangeActiveTerminal
vscode.window.terminals.forEach(term => {
  // Terminal API is limited, might need to hook stdout
})
```

### Task Execution

Track tasks (npm scripts, build commands):
```typescript
vscode.tasks.onDidStartTask
vscode.tasks.onDidEndTask
```

### Extension Usage

Track which extensions user activates:
```typescript
vscode.extensions.all.filter(ext => ext.isActive)
```

---

## Related Docs

- [00-architecture-overview.md](./00-architecture-overview.md) - Overall OTEL architecture
- [01-claude-code-otel.md](./01-claude-code-otel.md) - Correlate with prompts
- [03-linux-activity-otel.md](./03-linux-activity-otel.md) - System-level context

---

**Status**: Ready for implementation
**Next Step**: Build extension prototype and test with OTEL Collector
