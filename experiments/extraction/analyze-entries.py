#!/usr/bin/env python3
"""
Analyze extracted entries for noise patterns and quality.
Usage: python3 experiments/extraction/analyze-entries.py <entries.jsonl>
"""
import json, re, sys
from collections import Counter

def load_entries(path):
    return [json.loads(l) for l in open(path) if l.strip()]

def classify_noise(e):
    """Classify an entry into noise categories. Returns list of reasons or empty."""
    c = e["content"]
    reasons = []

    # 1. Too short
    if len(c.strip()) < 30:
        reasons.append("too-short")

    # 2. Session-specific references
    SESSION_REF = re.compile(
        r"\b(don't touch|this file|that function|full content|full file|"
        r"COMPLETE file|exact content|see below|report back|self-review)\b", re.I)
    if SESSION_REF.search(c):
        reasons.append("session-ref")

    # 3. Path-heavy
    paths = re.findall(r"(?:/[\w.-]+){2,}", c)
    bticks = re.findall(r"`[^`]*\.[a-z]{1,4}`", c)
    path_chars = sum(len(p) for p in paths) + sum(len(b) for b in bticks)
    if path_chars > 0 and path_chars / max(len(c), 1) > 0.3:
        reasons.append("path-heavy")

    # 4. URL-heavy
    if len(re.findall(r"https?://", c)) >= 2:
        reasons.append("url-heavy")

    # 5. Session-specific procedure (create/commit/push steps)
    if e["type"] == "procedure":
        SESSION_PROC = re.compile(
            r"\b(create|commit|push|self-review|report back|check out|"
            r"open|modify|replace|full content|full file|exact content)\b", re.I)
        lines = c.split("\n")
        lines = [l for l in lines if l.strip()]
        if lines:
            session_lines = sum(1 for l in lines if SESSION_PROC.search(l) or
                              re.search(r"(?:/[\w.-]+){2,}", l) or
                              re.search(r"https?://", l) or
                              re.search(r"`[^`]*\.[a-z]{1,4}`", l))
            if session_lines / len(lines) > 0.5:
                reasons.append("session-procedure")

    # 6. Overly specific / one-time UI details
    UI_SPECIFIC = re.compile(
        r"\b(\d+px|\d+×\d+|border-radius|padding|font-size|margin|"
        r"background-color|flex-|grid-|z-index|opacity)\b", re.I)
    ui_matches = UI_SPECIFIC.findall(c)
    if len(ui_matches) >= 3:
        reasons.append("ui-pixel-spec")

    # 7. Deployment/infra specifics (IP addresses, domains, ports with hostnames)
    INFRA_SPECIFIC = re.compile(
        r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|"
        r"\b[a-z0-9-]+\.(ru|com|org|net|io)\b", re.I)
    if INFRA_SPECIFIC.search(c) and e["type"] == "fact":
        # Only flag if the fact is purely about deployment details
        words = c.split()
        infra_words = sum(1 for w in words if re.search(
            r"(nginx|docker|volume|mount|deploy|server|container|cdn|ssl|dns|cname|bucket)", w, re.I))
        if infra_words / max(len(words), 1) > 0.15:
            reasons.append("infra-detail")

    return reasons


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-entries.py <entries.jsonl>")
        sys.exit(1)

    entries = load_entries(sys.argv[1])
    print(f"=== Entry Analysis: {len(entries)} entries ===\n")

    # Basic stats
    type_counts = Counter(e["type"] for e in entries)
    print("Type distribution:")
    for t, c in type_counts.most_common():
        print(f"  {t}: {c}")

    origin_counts = Counter(e.get("origin", "unknown") for e in entries)
    print("\nOrigin distribution:")
    for o, c in origin_counts.most_common():
        print(f"  {o}: {c}")

    # Noise analysis
    noise_entries = []
    clean_entries = []
    noise_reasons = Counter()

    for e in entries:
        reasons = classify_noise(e)
        if reasons:
            noise_entries.append((e, reasons))
            for r in reasons:
                noise_reasons[r] += 1
        else:
            clean_entries.append(e)

    print(f"\n--- Noise Analysis ---")
    print(f"  Clean: {len(clean_entries)}")
    print(f"  Flagged: {len(noise_entries)}")
    print(f"  Noise rate: {len(noise_entries)/len(entries)*100:.1f}%")
    print(f"\nNoise reasons:")
    for r, c in noise_reasons.most_common():
        print(f"  {r}: {c}")

    # Show flagged entries
    print(f"\n--- Flagged Entries ({len(noise_entries)}) ---")
    for e, reasons in noise_entries:
        content = e["content"][:120].replace("\n", "\\n")
        print(f"  [{','.join(reasons)}] [{e['type']}] {content}")

    # Show clean entries sample
    print(f"\n--- Clean Entries ({len(clean_entries)}) ---")
    by_type = {}
    for e in clean_entries:
        by_type.setdefault(e["type"], []).append(e)

    for t in ["rule", "fact", "decision", "procedure", "preference", "correction"]:
        items = by_type.get(t, [])
        if not items:
            continue
        print(f"\n  {t.upper()} ({len(items)}):")
        for e in items[:5]:
            content = e["content"][:120].replace("\n", "\\n")
            print(f"    [{e['confidence']:.2f}] {content}")
        if len(items) > 5:
            print(f"    ... and {len(items)-5} more")


if __name__ == "__main__":
    main()
