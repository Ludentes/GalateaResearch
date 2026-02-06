#!/bin/bash
set -e

# Run all benchmark configurations from YAML file
# Usage: ./scripts/run-all-benchmarks.sh [--clean] [--subset=comprehensive]

echo "=== Graphiti Benchmark Runner ==="
echo ""

# Parse command line arguments
CLEAN_FLAG=""
SUBSET=""

for arg in "$@"; do
  case $arg in
    --clean)
      CLEAN_FLAG="--clean"
      echo "🧹 Will clean database before each run"
      ;;
    --subset=*)
      SUBSET="${arg#*=}"
      echo "📊 Running subset: $SUBSET"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--clean] [--subset=comprehensive|granite4|nemotron|gpt-oss]"
      exit 1
      ;;
  esac
done

# Extract all config names from YAML
ALL_CONFIGS=$(cat tests/configs/graphiti-benchmark-configs.yaml | grep "^\s*- name:" | sed 's/.*name: //')

# Filter configs based on subset
if [ -n "$SUBSET" ]; then
  case $SUBSET in
    comprehensive)
      CONFIGS=$(echo "$ALL_CONFIGS" | grep "comprehensive")
      ;;
    granite4)
      CONFIGS=$(echo "$ALL_CONFIGS" | grep "granite4")
      ;;
    nemotron)
      CONFIGS=$(echo "$ALL_CONFIGS" | grep "nemotron")
      ;;
    gpt-oss)
      CONFIGS=$(echo "$ALL_CONFIGS" | grep "gpt-oss")
      ;;
    *)
      echo "Unknown subset: $SUBSET"
      echo "Available subsets: comprehensive, granite4, nemotron, gpt-oss"
      exit 1
      ;;
  esac
else
  CONFIGS="$ALL_CONFIGS"
fi

# Count total configs
TOTAL=$(echo "$CONFIGS" | wc -l)
CURRENT=0
FAILED=0
SUCCEEDED=0

echo ""
echo "📋 Found $TOTAL configurations to run"
echo ""

# Create results summary file
SUMMARY_FILE="results/benchmark-run-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p results
echo "Benchmark Run Summary" > "$SUMMARY_FILE"
echo "Started: $(date)" >> "$SUMMARY_FILE"
echo "Clean flag: $CLEAN_FLAG" >> "$SUMMARY_FILE"
echo "Subset: ${SUBSET:-all}" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# Run each config
while IFS= read -r config; do
  CURRENT=$((CURRENT + 1))

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$CURRENT/$TOTAL] Running: $config"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  START_TIME=$(date +%s)

  # Run benchmark and capture exit code
  if pnpm benchmark:graphiti --config="$config" $CLEAN_FLAG; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))

    echo ""
    echo "✅ SUCCESS: $config (${MINUTES}m ${SECONDS}s)"
    echo "✅ $config (${MINUTES}m ${SECONDS}s)" >> "$SUMMARY_FILE"
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))

    echo ""
    echo "❌ FAILED: $config (${MINUTES}m ${SECONDS}s)"
    echo "❌ $config (${MINUTES}m ${SECONDS}s)" >> "$SUMMARY_FILE"
    FAILED=$((FAILED + 1))
  fi

  echo ""
  echo "Progress: $SUCCEEDED succeeded, $FAILED failed, $((TOTAL - CURRENT)) remaining"
  echo ""

  # Optional: Add delay between runs to avoid overloading
  if [ $CURRENT -lt $TOTAL ]; then
    echo "⏳ Waiting 5 seconds before next run..."
    sleep 5
  fi
done <<< "$CONFIGS"

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 All benchmarks complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Summary:"
echo "   Total:     $TOTAL"
echo "   Succeeded: $SUCCEEDED"
echo "   Failed:    $FAILED"
echo ""
echo "📁 Results saved to: $SUMMARY_FILE"
echo "🔍 View detailed results in Langfuse: http://localhost:3000"
echo ""

# Append final summary to file
echo "" >> "$SUMMARY_FILE"
echo "Completed: $(date)" >> "$SUMMARY_FILE"
echo "Total: $TOTAL, Succeeded: $SUCCEEDED, Failed: $FAILED" >> "$SUMMARY_FILE"

# Exit with error if any failed
if [ $FAILED -gt 0 ]; then
  exit 1
fi
