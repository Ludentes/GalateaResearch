#!/usr/bin/env python3
"""
Extract human-readable conversation transcripts from Claude Code JSONL session files.
Usage: python3 extract_transcript.py <input_jsonl> <output_txt>
"""

import json
import sys

TOOL_INPUT_MAX = 200
TOOL_RESULT_MAX = 100


def summarize(text, max_len):
    if max_len is None or len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def extract_content_blocks(content_blocks, role):
    parts = []
    if isinstance(content_blocks, str):
        text = content_blocks.strip()
        if text:
            parts.append(text)
        return parts

    if not isinstance(content_blocks, list):
        return parts

    for block in content_blocks:
        if isinstance(block, str):
            if block.strip():
                parts.append(block.strip())
            continue
        if not isinstance(block, dict):
            continue
        btype = block.get("type")

        if btype == "text":
            text = block.get("text", "").strip()
            if text:
                parts.append(text)

        elif btype == "tool_use":
            tool_name = block.get("name", "unknown")
            tool_input = block.get("input", {})
            input_summary = json.dumps(tool_input, ensure_ascii=False)
            input_summary = summarize(input_summary, TOOL_INPUT_MAX)
            parts.append(f"[TOOL USE: {tool_name} - {input_summary}]")

        elif btype == "tool_result":
            content = block.get("content", "")
            if isinstance(content, list):
                snippets = []
                for sub in content:
                    if isinstance(sub, dict) and sub.get("type") == "text":
                        snippets.append(sub.get("text", ""))
                    elif isinstance(sub, str):
                        snippets.append(sub)
                content = " ".join(snippets)
            elif not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False)
            content = summarize(content.strip(), TOOL_RESULT_MAX)
            if content:
                is_error = block.get("is_error", False)
                prefix = "TOOL ERROR" if is_error else "TOOL RESULT"
                parts.append(f"[{prefix}: {content}]")

        elif btype == "thinking":
            thinking_text = block.get("thinking", "")
            if thinking_text:
                parts.append(f"[THINKING: {summarize(thinking_text, 300)}]")

    return parts


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.jsonl> <output.txt>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    lines_read = 0
    entries_written = 0
    skipped_types = {}
    seen_message_contents = {}
    output_parts = []

    with open(input_file, "r", encoding="utf-8") as f:
        for raw_line in f:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            lines_read += 1

            try:
                entry = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            entry_type = entry.get("type")

            if entry_type not in ("user", "assistant"):
                skipped_types[entry_type] = skipped_types.get(entry_type, 0) + 1
                continue

            message = entry.get("message")
            if not message:
                continue

            role = message.get("role", entry_type)
            content = message.get("content")
            if not content:
                continue

            # Deduplicate streaming assistant messages
            msg_id = message.get("id", "")
            if role == "assistant" and msg_id:
                content_key = "|".join(
                    f"{b.get('type','?')}:{str(b.get('text', b.get('name', b.get('thinking',''))))[:60]}"
                    for b in content
                    if isinstance(b, dict)
                ) if isinstance(content, list) else str(content)[:100]
                dedup_key = (msg_id, content_key)
                if dedup_key in seen_message_contents:
                    continue
                seen_message_contents[dedup_key] = True

            is_meta = entry.get("isMeta", False)
            parts = extract_content_blocks(content, role)

            if not parts:
                continue

            if role == "user":
                header = "--- SYSTEM/META ---" if is_meta else "--- USER ---"
            else:
                header = "--- ASSISTANT ---"

            block_text = "\n".join(parts)
            output_parts.append(f"{header}\n{block_text}\n")
            entries_written += 1

    full_output = "\n".join(output_parts)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(full_output)

    print(f"Done. Read {lines_read} JSONL lines.")
    print(f"Wrote {entries_written} conversation entries to {output_file}")
    print(f"Skipped entry types: {skipped_types}")
    print(f"Output size: {len(full_output)} chars")


if __name__ == "__main__":
    main()
