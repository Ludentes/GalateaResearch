# JSONL Transcript Structure Analysis

**Date:** 2026-02-26
**Source:** DEM developer data (1377 sessions, Cline/Roo Code + Claude Code mix)

## Entry-Level Structure

Each line in a `.jsonl` file is one entry:

```json
{"type": "user|assistant|queue-operation|progress|file-history-snapshot|summary|system", "message": {...}, "isMeta": bool}
```

| Entry type | Count | Purpose | Extract from? |
|---|---|---|---|
| `assistant` | 2439 | Claude responses (code, analysis, tool calls) | **NO** |
| `user` | 2088 | User input (human text + tool results) | **YES** (selectively) |
| `queue-operation` | 1463 | Internal scheduling | NO |
| `progress` | 1178 | Streaming progress | NO |
| `file-history-snapshot` | 267 | File state tracking | NO |
| `summary` | 54 | Context compression summaries | NO |
| `system` | 2 | System prompts | NO |

## User Message Content Formats

The `message.content` field has two formats:

### Format A: Plain string (1356 messages)

```json
{"type": "user", "message": {"role": "user", "content": "string here"}}
```

String subtypes by prefix:

| Prefix | Count | What it is | Extract from? |
|---|---|---|---|
| `[{"role":...` (JSON array) | 1328 | **Serialized conversation history** (Cline format) | Parse → extract user text only |
| `<command-message>` | 13 | Skill/slash command invocation | NO (internal) |
| `<local-command-caveat>` | 4 | Local command output | NO |
| `<command-name>` | 3 | Command name tag | NO |
| `<local-command-stdout>` | 3 | Local command stdout | NO |
| `This session is being continued` | 2 | Context continuation summary | NO |
| Plain text | 3 | Actual human typing | **YES** |

### Format B: Content block array (732 messages)

```json
{"type": "user", "message": {"role": "user", "content": [{"type": "text|tool_result|tool_use", ...}]}}
```

| Block type | Count | What it is | Extract from? |
|---|---|---|---|
| `tool_result` | 654 | Output from Claude's tool calls | **NO** (except "User has answered") |
| `text` | 122 | Human-authored text (may contain XML wrappers) | **YES** (after stripping XML) |

## Serialized Conversation Arrays (Format A, JSON subtype)

1328/2088 user messages are JSON-serialized conversation histories. Structure:

```json
[
  {"role": "user", "content": [{"type": "text", "text": "<task>\n..."}]},
  {"role": "assistant", "content": [{"type": "text", "text": "..."}, {"type": "tool_use", ...}]},
  {"role": "user", "content": [{"type": "tool_result", ...}]},
  ...
]
```

These contain the **full conversation** including assistant responses with code. Must parse and extract only user text blocks.

## Tool Results

654 tool_result blocks. Their content by prefix:

| Prefix pattern | Count | What it is | Extract from? |
|---|---|---|---|
| `The file /home/... has been updated` | 131 | File write confirmation | NO |
| `Todos have been modified` | 74 | TodoWrite result | NO |
| `<tool_use_error>` | 89 | Error messages | NO |
| `File created successfully` | 36 | File creation | NO |
| `     1→import ...` (code) | ~63 | File read content (Read tool) | NO |
| `User has answered your questions:` | ~24 | **AskUserQuestion responses** | **YES** |
| `[array of blocks]` | 13 | Nested content blocks | Parse recursively |
| Other | ~100+ | Bash output, grep results, etc. | NO |

### AskUserQuestion Format

```
User has answered your questions: "Question text?"="User's answer". You can now continue...
```

The answer text between `="..."` contains actual developer decisions.

## XML Tags in Text Content

Tags found in `text` blocks, sorted by frequency:

### Cline/Roo Code Tool Tags (strip entirely)
| Tag | Count | Purpose |
|---|---|---|
| `<read_file>` | 595 | File read request |
| `<apply_diff>` | 515 | Diff application |
| `<write_to_file>` | 297 | File write |
| `<execute_command>` | 108 | Shell command |
| `<attempt_completion>` | 137 | Completion attempt |
| `<list_files>` | 60 | Directory listing |

### Cline/Roo Code State Tags (strip entirely)
| Tag | Count | Purpose |
|---|---|---|
| `<update_todo_list>` | 419 | Todo state |
| `<todos>` | 419 | Todo list |
| `<suggest>` | 154 | Suggestions |
| `<result>` | 139 | Operation results |

### Content Embedding Tags (strip — contains code)
| Tag | Count | Purpose |
|---|---|---|
| `<file_content>` | 1332 | Inline file content with line numbers |
| `<diff>` | 516 | Code diffs |
| `<content>` | 297 | Write content |

### IDE Context Tags (strip tag, keep surrounding human text)
| Tag | Count | Purpose |
|---|---|---|
| `<ide_opened_file>` | 56 | File open notification |
| `<ide_selection>` | ~20 | Code selection |

### User Intent Tags (extract inner content)
| Tag | Count | Purpose |
|---|---|---|
| `<task>` | 2653 | User's task description (but also contains `<file_content>` children) |
| `<feedback>` | ~10 | User feedback |

### JSX/HTML Component Tags (NOT XML markup — part of code)
| Tag | Count | Purpose |
|---|---|---|
| `<div>`, `<p>`, `<span>` | 677+ | React/HTML in code |
| `<Button>`, `<Card>`, `<TableHead>`, etc. | 500+ | UI components in code |

## Extraction Decision Tree

```
Entry type == "user"?
├─ NO → skip
└─ YES → check content format
    ├─ string starting with '[{"role":' → parse as conversation array
    │   └─ for each message with role=="user":
    │       ├─ text blocks → stripIdeWrappers → extract
    │       └─ tool_result → check "User has answered" → extract answer
    ├─ string starting with '<command-' or '<local-command-' → skip (internal)
    ├─ string starting with 'This session is being continued' → skip
    ├─ other string → stripIdeWrappers → extract
    └─ array of blocks:
        ├─ type=="text" → stripIdeWrappers → extract
        ├─ type=="tool_result" → check "User has answered" → extract answer only
        └─ type=="tool_use" → skip (Claude's tool calls)
```

## stripIdeWrappers Tag Removal

Tags to strip **entirely** (content and tags):
- `<ide_opened_file>`, `<ide_selection>` — IDE notifications
- `<file_content>` — embedded code with line numbers
- `<environment_details>`, `<todos>`, `<update_todo_list>` — Cline state
- `<attempt_completion>`, `<result>` — Cline completion
- `<suggest>`, `<question>`, `<follow_up>` — Cline UI
- `<read_file>`, `<apply_diff>`, `<write_to_file>`, `<execute_command>`, `<list_files>` — Cline tools
- `<diff>`, `<content>` (within write_to_file), `<args>` — Cline tool args
- `<actual_tool_name>` — Cline tool name
- `<error_details>`, `<notice>` — Cline errors
- `<tool_use_error>` — tool errors
- `<file_write_result>` — write results

Tags to **unwrap** (remove tags, keep inner text):
- `<task>` — user's task description (but strip nested `<file_content>`)
- `<feedback>` — user feedback
- `<command-message>`, `<command-name>`, `<command-args>` — strip entirely

## Impact on Signal Classification

With ALL tags properly stripped, the signal classifier should only see:
- Actual human-authored task descriptions (from `<task>` after stripping `<file_content>`)
- Developer answers to questions (from "User has answered" tool_results)
- Direct human messages (plain text)
- IDE context text after tag stripping ("Documentation is fine, let's develop")

This eliminates:
- Code line numbers matching `constraint` pattern (`min(1)`, `max(100)`)
- Code comments matching `policy` pattern (`// we must validate`)
- JSX attributes matching `option_selection` pattern (`A) div className=`)
- Documentation matching `imperative_rule` pattern (`must`, `never` in docs)
