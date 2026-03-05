#!/bin/bash
# Full extraction strategy evaluation — run from terminal (not sandbox)
# Tests heuristics + cloud pipeline (with CoD consolidation) for all 4 devs
#
# Usage: cd ~/w/galatea/.worktrees/evidence-based-memory && bash experiments/extraction/run-full-eval.sh
#
# Requirements: OPENROUTER_API_KEY in ~/.env or exported
# Cost estimate: ~$2-5 total (QP ~$0.50, UMKA ~$0.10, NEWUB ~$0.50, DEM ~$3-5)

set -euo pipefail

# Load API key
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  if [ -f ~/w/galatea/.env ]; then
    export OPENROUTER_API_KEY=$(grep OPENROUTER_API_KEY ~/w/galatea/.env | cut -d= -f2)
  fi
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "ERROR: OPENROUTER_API_KEY not set"
  exit 1
fi

RESULTS_DIR="experiments/extraction/results"
mkdir -p "$RESULTS_DIR"

echo "==================================================================="
echo "  Full Pipeline Eval (heuristics + cloud with CoD consolidation)"
echo "==================================================================="
echo ""

# --- QP ---
echo ">>> QP (215 sessions, 18 golden items)"
QP_FILES=$(find ~/w/galatea/data/otherdevs/qp -name "*.jsonl" -type f ! -name "history.jsonl" ! -path "*/subagents/*" | sort)

echo "  [1/2] QP heuristics-only pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts qp heuristics-only $QP_FILES 2>&1 | tee "$RESULTS_DIR/qp-pipeline-heuristics-v3.txt" | grep -E "Recall:|Entries|Time:"

echo "  [2/2] QP cloud pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts qp cloud $QP_FILES 2>&1 | tee "$RESULTS_DIR/qp-pipeline-cloud-v3.txt" | grep -E "Recall:|Entries|Time:"

echo ""

# --- UMKA ---
echo ">>> UMKA (28 sessions, 13 golden items)"
UMKA_FILES=$(find ~/.claude/projects/-home-newub-w-Umka -name "*.jsonl" -type f ! -name "history.jsonl" ! -path "*/subagents/*" | sort)

echo "  [1/2] UMKA heuristics-only pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts umka heuristics-only $UMKA_FILES 2>&1 | tee "$RESULTS_DIR/umka-pipeline-heuristics-v3.txt" | grep -E "Recall:|Entries|Time:"

echo "  [2/2] UMKA cloud pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts umka cloud $UMKA_FILES 2>&1 | tee "$RESULTS_DIR/umka-pipeline-cloud-v3.txt" | grep -E "Recall:|Entries|Time:"

echo ""

# --- NEWUB ---
echo ">>> NEWUB (82 sessions, 31 golden items)"
NEWUB_FILES=$(find ~/.claude/projects/-home-newub-w-telejobs ~/.claude/projects/-home-newub-w-Umka-game ~/.claude/projects/-home-newub-w-galatea -name "*.jsonl" -type f ! -name "history.jsonl" ! -path "*/subagents/*" | sort)

echo "  [1/2] NEWUB heuristics-only pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts newub heuristics-only $NEWUB_FILES 2>&1 | tee "$RESULTS_DIR/newub-pipeline-heuristics-v3.txt" | grep -E "Recall:|Entries|Time:"

echo "  [2/2] NEWUB cloud pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts newub cloud $NEWUB_FILES 2>&1 | tee "$RESULTS_DIR/newub-pipeline-cloud-v3.txt" | grep -E "Recall:|Entries|Time:"

echo ""

# --- DEM ---
echo ">>> DEM (1377 sessions, 36 golden items) — THIS WILL TAKE 10-15 MIN"
DEM_FILES=$(find ~/w/galatea/data/otherdevs/dem -name "*.jsonl" -type f ! -name "history.jsonl" ! -path "*/subagents/*" | sort)

echo "  [1/2] DEM heuristics-only pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts dem heuristics-only $DEM_FILES 2>&1 | tee "$RESULTS_DIR/dem-pipeline-heuristics-v3.txt" | grep -E "Recall:|Entries|Time:"

echo "  [2/2] DEM cloud pipeline..."
pnpm tsx experiments/extraction/run-strategy-eval.ts dem cloud $DEM_FILES 2>&1 | tee "$RESULTS_DIR/dem-pipeline-cloud-v3.txt" | grep -E "Recall:|Entries|Time:"

echo ""
echo "==================================================================="
echo "  DONE. Results in: $RESULTS_DIR/*-v3.txt"
echo "==================================================================="

# Print summary
echo ""
echo "--- SUMMARY ---"
for dev in qp umka newub dem; do
  echo ""
  echo "[$dev]"
  for strat in heuristics cloud; do
    f="$RESULTS_DIR/${dev}-pipeline-${strat}-v3.txt"
    if [ -f "$f" ]; then
      echo "  $strat: $(grep 'Recall:' "$f" | tail -1) | $(grep 'Entries extracted:' "$f" | tail -1)"
    fi
  done
done
