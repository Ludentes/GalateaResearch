#!/usr/bin/env python3
"""
Create Sprint 12 issues in GitLab from docs/plans/2026-03-14-sprint-12-gitlab-tasks.md

Usage:
    export GITLAB_TOKEN=your_token
    export GITLAB_PROJECT_ID=12
    python3 scripts/create-sprint12-issues.py

Or use default values:
    python3 scripts/create-sprint12-issues.py
"""

import os
import sys
import json
import re
from typing import Optional

try:
    import requests
except ImportError:
    print("❌ requests library required. Install: pip install requests")
    sys.exit(1)

# Configuration
GITLAB_URL = os.getenv("GITLAB_URL", "https://gitlab.maugry.ru:2224")
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN", "")
PROJECT_ID = os.getenv("GITLAB_PROJECT_ID", "12")

# Issue definitions extracted from the plan
SPRINT_12_ISSUES = [
    {
        "group": "Epic",
        "title": "Sprint 12: Agent Runtime Foundation (Phase F Part 1)",
        "description": """Foundation layer for Phase F: multi-step work execution with ReAct agent loop,
operational memory persistence, and enhanced retrieval.

Duration: 1 week (Mon 2026-03-14 — Fri 2026-03-21)
Total Capacity: 130 story points

Key Deliverables:
- F.1: Channel Message Abstraction (16 pts)
- F.2: Agent Loop v2 with Tool Scaffolding (24 pts)
- F.3: Operational Memory (20 pts)
- F.4: Homeostasis Wiring to Operational Memory (13 pts)
- F.5: Embedding-Based Retrieval with Qdrant (19 pts)
- F.6: Confabulation Guard (13 pts)
- F.7: Token Budget Upgrade (11 pts)
- F.8: Safety Model Design (14 pts)

Success Criteria:
✅ All F.1-F.8 deliverables code-complete
✅ Phase E tests still green (163 tests passing)
✅ Integration test: Round-trip message routing works
✅ Heartbeat tick continues in-progress work without inbound messages
✅ Operational memory persists across server restarts
✅ Safety model design document reviewed and approved

Detailed plan: docs/plans/2026-03-14-sprint-12-agent-runtime-foundation.md
Task checklist: docs/plans/2026-03-14-sprint-12-task-checklist.md""",
        "labels": ["sprint::12", "phase::f", "runtime", "type::epic"],
        "points": 130
    },
    # F.1 - Channel Message Abstraction
    {
        "group": "F.1",
        "title": "F.1.1: Define ChannelMessage type (2 pts)",
        "description": "Define the ChannelMessage type that normalizes all inbound/outbound messages.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::task"],
        "points": 2
    },
    {
        "group": "F.1",
        "title": "F.1.2: Implement Discord adapter (inbound) (3 pts)",
        "description": "Convert Discord webhook messages to ChannelMessage format.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::task"],
        "points": 3
    },
    {
        "group": "F.1",
        "title": "F.1.3: Implement Discord adapter (outbound) (3 pts)",
        "description": "Convert ChannelMessage to Discord webhooks/API calls.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::task"],
        "points": 3
    },
    {
        "group": "F.1",
        "title": "F.1.4: Implement Dashboard adapter (2 pts)",
        "description": "Connect Chat UI to agent tick via ChannelMessage.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::task"],
        "points": 2
    },
    {
        "group": "F.1",
        "title": "F.1.5: Create channel dispatcher (2 pts)",
        "description": "Route outbound ChannelMessage to correct adapter based on channel type.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::task"],
        "points": 2
    },
    {
        "group": "F.1",
        "title": "F.1.6: Integration test: Round-trip routing (3 pts)",
        "description": "Verify end-to-end message flow through adapters.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::test"],
        "points": 3
    },
    {
        "group": "F.1",
        "title": "F.1.7: Migration guide for legacy PendingMessage (1 pt)",
        "description": "Document how to migrate existing code from PendingMessage to ChannelMessage.",
        "labels": ["sprint::12", "phase::f", "f.1", "type::docs"],
        "points": 1
    },
    # F.2 - Agent Loop v2
    {
        "group": "F.2",
        "title": "F.2.1: Define ReAct agent loop interface (2 pts)",
        "description": "Design the contract for the agent loop: input, output, execution model.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 2
    },
    {
        "group": "F.2",
        "title": "F.2.2: Implement inner loop (LLM + tool handling) (5 pts)",
        "description": "Implement the core agent loop: LLM call → tool detection → safety pre-check → execution.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 5
    },
    {
        "group": "F.2",
        "title": "F.2.3: Implement tool registration system (3 pts)",
        "description": "Allow tools to register themselves with the agent loop.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 3
    },
    {
        "group": "F.2",
        "title": "F.2.4: Tool safety pre-check scaffold (2 pts)",
        "description": "Create placeholder for safety checks (always allows for now, ready for Phase G).",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 2
    },
    {
        "group": "F.2",
        "title": "F.2.5: Conversation history in context (3 pts)",
        "description": "Include last N exchanges from operational memory in LLM system prompt.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 3
    },
    {
        "group": "F.2",
        "title": "F.2.6: Budget accounting (2 pts)",
        "description": "Track token usage per section for debugging and optimization.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::task"],
        "points": 2
    },
    {
        "group": "F.2",
        "title": "F.2.7: Inner loop tests (unit) (4 pts)",
        "description": "Unit tests for agent loop core logic.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::test"],
        "points": 4
    },
    {
        "group": "F.2",
        "title": "F.2.8: Integration test: Agent loop with stub tools (3 pts)",
        "description": "End-to-end test of agent loop with stub tools.",
        "labels": ["sprint::12", "phase::f", "f.2", "type::test"],
        "points": 3
    },
    # F.3 - Operational Memory
    {
        "group": "F.3",
        "title": "F.3.1: Define OperationalContext and TaskState types (2 pts)",
        "description": "Define the operational memory data structures.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 2
    },
    {
        "group": "F.3",
        "title": "F.3.2: Implement operational memory store (JSONL) (3 pts)",
        "description": "Load/save operational context to persistent JSONL storage.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 3
    },
    {
        "group": "F.3",
        "title": "F.3.3: Task assignment from ChannelMessage (2 pts)",
        "description": "Convert inbound task_assignment message to TaskState.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 2
    },
    {
        "group": "F.3",
        "title": "F.3.4: Task phase progression (2 pts)",
        "description": "Update task phase and track phase entry timestamp.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 2
    },
    {
        "group": "F.3",
        "title": "F.3.5: Heartbeat tick handler (3 pts)",
        "description": "Detect and continue in-progress work when no new inbound message arrives.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 3
    },
    {
        "group": "F.3",
        "title": "F.3.6: Carryover for cross-session continuity (2 pts)",
        "description": "When task completes, save summary for next session.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::task"],
        "points": 2
    },
    {
        "group": "F.3",
        "title": "F.3.7: Operational memory load/save tests (3 pts)",
        "description": "Test persistence and retrieval of operational context.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::test"],
        "points": 3
    },
    {
        "group": "F.3",
        "title": "F.3.8: Heartbeat integration test (3 pts)",
        "description": "Verify heartbeat continues in-progress work.",
        "labels": ["sprint::12", "phase::f", "f.3", "type::test"],
        "points": 3
    },
    # F.4 - Homeostasis Wiring
    {
        "group": "F.4",
        "title": "F.4.1: Connect communication_health to lastOutboundAt (2 pts)",
        "description": "Dimension state reacts to message sending pattern.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 2
    },
    {
        "group": "F.4",
        "title": "F.4.2: Connect progress_momentum to phase duration (2 pts)",
        "description": "Detect stuck state when phase doesn't change.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 2
    },
    {
        "group": "F.4",
        "title": "F.4.3: Connect productive_engagement to task list (2 pts)",
        "description": "Dimension state reacts to task availability.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 2
    },
    {
        "group": "F.4",
        "title": "F.4.4: Connect knowledge_sufficiency to task context (2 pts)",
        "description": "Retrieval driven by task description, scored against results.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 2
    },
    {
        "group": "F.4",
        "title": "F.4.5: Connect certainty_alignment to task phase (1 pt)",
        "description": "Lower certainty threshold for later phases.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 1
    },
    {
        "group": "F.4",
        "title": "F.4.6: Connect knowledge_application to phase duration (1 pt)",
        "description": "Detect analysis paralysis (exploring too long).",
        "labels": ["sprint::12", "phase::f", "f.4", "type::task"],
        "points": 1
    },
    {
        "group": "F.4",
        "title": "F.4.7: Integration test: Homeostasis reads operational memory (3 pts)",
        "description": "Verify all dimension assessments use operational context correctly.",
        "labels": ["sprint::12", "phase::f", "f.4", "type::test"],
        "points": 3
    },
    # F.5 - Qdrant Retrieval
    {
        "group": "F.5",
        "title": "F.5.1: Verify Qdrant running at localhost:6333 (1 pt)",
        "description": "Ensure Qdrant is operational before implementation.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 1
    },
    {
        "group": "F.5",
        "title": "F.5.2: Implement hybrid retrieval (vector + payload filter) (4 pts)",
        "description": "Query Qdrant with vector similarity + payload filtering.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 4
    },
    {
        "group": "F.5",
        "title": "F.5.3: Composite re-ranking score (3 pts)",
        "description": "Rank results by combined formula.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 3
    },
    {
        "group": "F.5",
        "title": "F.5.4: Migrate entries to Qdrant (2 pts)",
        "description": "Load existing JSONL entries into Qdrant index.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 2
    },
    {
        "group": "F.5",
        "title": "F.5.5: Hard rules budget reservation (2 pts)",
        "description": "Ensure critical rules never dropped from context.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 2
    },
    {
        "group": "F.5",
        "title": "F.5.6: Qdrant fallback + logging (2 pts)",
        "description": "Degrade gracefully if Qdrant unavailable.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::task"],
        "points": 2
    },
    {
        "group": "F.5",
        "title": "F.5.7: Retrieval tests (unit + integration) (3 pts)",
        "description": "Test vector retrieval, filtering, and ranking.",
        "labels": ["sprint::12", "phase::f", "f.5", "type::test"],
        "points": 3
    },
    # F.6 - Confabulation Guard
    {
        "group": "F.6",
        "title": "F.6.1: Implement entity validation heuristics (2 pts)",
        "description": "Verify entities appear in source text or are known aliases.",
        "labels": ["sprint::12", "phase::f", "f.6", "type::task"],
        "points": 2
    },
    {
        "group": "F.6",
        "title": "F.6.2: Implement about.entity validation (2 pts)",
        "description": "Verify about.entity references known person or 'unknown'.",
        "labels": ["sprint::12", "phase::f", "f.6", "type::task"],
        "points": 2
    },
    {
        "group": "F.6",
        "title": "F.6.3: Implement confidence distribution check (2 pts)",
        "description": "Flag uniform 1.0 confidence (sign of overconfidence).",
        "labels": ["sprint::12", "phase::f", "f.6", "type::task"],
        "points": 2
    },
    {
        "group": "F.6",
        "title": "F.6.4: Implement type distribution check (1 pt)",
        "description": "Warn if all extracted entries are same type.",
        "labels": ["sprint::12", "phase::f", "f.6", "type::task"],
        "points": 1
    },
    {
        "group": "F.6",
        "title": "F.6.5: Integrate into extraction pipeline (2 pts)",
        "description": "Guard runs after Knowledge Extractor, before Dedup.",
        "labels": ["sprint::12", "phase::f", "f.6", "type::task"],
        "points": 2
    },
    {
        "group": "F.6",
        "title": "F.6.6: Guard unit tests (2 pts)",
        "description": "Test each validation function independently.",
        "labels": ["sprint::12", "phase::f", "f.6", "type::test"],
        "points": 2
    },
    # F.7 - Token Budget
    {
        "group": "F.7",
        "title": "F.7.1: Upgrade token budget to 12K (1 pt)",
        "description": "Update config and context assembler for new budget.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::task"],
        "points": 1
    },
    {
        "group": "F.7",
        "title": "F.7.2: Implement per-section token accounting (3 pts)",
        "description": "Track tokens used by each section.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::task"],
        "points": 3
    },
    {
        "group": "F.7",
        "title": "F.7.3: Truncation priority (non-truncatable sections) (2 pts)",
        "description": "Protect essential sections from truncation.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::task"],
        "points": 2
    },
    {
        "group": "F.7",
        "title": "F.7.4: Budget overage logging (2 pts)",
        "description": "Warn when approaching or exceeding budget.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::task"],
        "points": 2
    },
    {
        "group": "F.7",
        "title": "F.7.5: Context assembler tests (budgets) (2 pts)",
        "description": "Test budget enforcement and truncation logic.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::test"],
        "points": 2
    },
    {
        "group": "F.7",
        "title": "F.7.6: Manual verification: Prompt size tracking (1 pt)",
        "description": "Verify actual token usage in live system.",
        "labels": ["sprint::12", "phase::f", "f.7", "type::manual"],
        "points": 1
    },
    # F.8 - Safety Model Design
    {
        "group": "F.8",
        "title": "F.8.1: Document Layer 0 (LLM built-in guardrails) (2 pts)",
        "description": "Explain leverage of Claude's native safety.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.2: Document Layer 0.5 (Local guardrail model) (2 pts)",
        "description": "Design specialized safety classifier on Ollama.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.3: Document Layer 1 (Homeostasis self_preservation) (2 pts)",
        "description": "Explain 7th dimension as soft safety barrier.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.4: Document Layer 2 (Hard guardrails) (2 pts)",
        "description": "Define deterministic, unjailbreakable constraints.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.5: Define trust matrix (2 pts)",
        "description": "Channel × Identity grid for permission checking.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.6: Define tool risk metadata schema (1 pt)",
        "description": "Every tool declares its risk profile.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 1
    },
    {
        "group": "F.8",
        "title": "F.8.7: Document hook integration for Phase G (2 pts)",
        "description": "How Phase G implements safety checks.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::docs"],
        "points": 2
    },
    {
        "group": "F.8",
        "title": "F.8.8: Review + approval of safety design (1 pt)",
        "description": "PM/team signs off on 4-layer model before Phase G starts.",
        "labels": ["sprint::12", "phase::f", "f.8", "type::approval"],
        "points": 1
    },
]


def create_issues() -> None:
    """Create all Sprint 12 issues in GitLab."""
    if not GITLAB_TOKEN:
        print("⚠️  GITLAB_TOKEN not set. Using read-only mode (will print issues without creating).")
        dry_run = True
    else:
        dry_run = False

    headers = {
        "PRIVATE-TOKEN": GITLAB_TOKEN,
        "Content-Type": "application/json"
    }

    created = 0
    skipped = 0

    print(f"\n🚀 Sprint 12: Creating {len(SPRINT_12_ISSUES)} issues")
    print(f"   GitLab: {GITLAB_URL}")
    print(f"   Project: {PROJECT_ID}")
    print(f"   Mode: {'DRY RUN' if dry_run else 'CREATE'}\n")

    for issue in SPRINT_12_ISSUES:
        payload = {
            "title": issue["title"],
            "description": issue["description"],
            "labels": ",".join(issue["labels"]),
            "milestone_title": "Sprint 12",
            "weight": issue["points"],  # GitLab calls it 'weight'
        }

        if dry_run:
            print(f"  [{issue['group']:4}] {issue['title']}")
        else:
            url = f"{GITLAB_URL}/api/v4/projects/{PROJECT_ID}/issues"
            try:
                response = requests.post(url, json=payload, headers=headers, timeout=10)
                if response.status_code in [201, 200]:
                    iid = response.json().get("iid")
                    print(f"✅ #{iid} {issue['title']}")
                    created += 1
                else:
                    print(f"❌ {issue['title']} — {response.status_code}")
                    print(f"   {response.text[:100]}")
                    skipped += 1
            except Exception as e:
                print(f"❌ {issue['title']} — {str(e)[:100]}")
                skipped += 1

    print(f"\n📊 Summary:")
    print(f"   Created: {created}")
    print(f"   Skipped: {skipped}")
    print(f"   Total:   {len(SPRINT_12_ISSUES)}")

    if dry_run:
        print(f"\n💡 To create these issues, set GITLAB_TOKEN:")
        print(f"   export GITLAB_TOKEN=your_personal_access_token")
        print(f"   python3 scripts/create-sprint12-issues.py")


if __name__ == "__main__":
    create_issues()
