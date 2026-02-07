# Benchmark Running Scripts

## Quick Start

**Run single configuration:**
```bash
pnpm benchmark:graphiti --config=granite4-tiny-h-comprehensive
```

**Run all configurations (44 total):**
```bash
pnpm benchmark:all              # ~6-7 hours
pnpm benchmark:all:clean        # with database cleanup
```

**Run specific subsets:**
```bash
pnpm benchmark:comprehensive    # 4 configs, ~40 minutes
pnpm benchmark:granite4         # 13 configs, ~2 hours
pnpm benchmark:nemotron         # 9 configs, ~1.5 hours
pnpm benchmark:gpt-oss          # 9 configs, ~1.5 hours
```

## Script Details

### run-all-benchmarks.sh

**Features:**
- ✅ Automatically extracts all config names from YAML
- ✅ Progress tracking with counters
- ✅ Timing for each run
- ✅ Error handling (continues on failure)
- ✅ Summary report saved to `results/`
- ✅ Subset filtering
- ✅ Optional database cleanup

**Usage:**
```bash
# Direct script usage
./scripts/run-all-benchmarks.sh
./scripts/run-all-benchmarks.sh --clean
./scripts/run-all-benchmarks.sh --subset=comprehensive
./scripts/run-all-benchmarks.sh --clean --subset=granite4

# Via npm scripts (recommended)
pnpm benchmark:all
pnpm benchmark:comprehensive
```

**Available subsets:**
- `comprehensive` - Runs all configs with "comprehensive" in the name
- `granite4` - Runs all Granite 4 configs
- `nemotron` - Runs all Nemotron configs
- `gpt-oss` - Runs all GPT-OSS configs

## Output

**Results saved to:**
- `results/benchmark-{model}-temp{temp}-{timestamp}.json` - Individual run results
- `results/benchmark-run-{timestamp}.txt` - Summary of all runs
- Langfuse dashboard: http://localhost:3000

**Summary file includes:**
- Start/end timestamps
- Success/failure for each config
- Duration for each run
- Total counts

## Example Output

```
=== Graphiti Benchmark Runner ===

📋 Found 4 configurations to run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1/4] Running: granite4-tiny-h-comprehensive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

=== Graphiti LLM Benchmark ===
...

✅ SUCCESS: granite4-tiny-h-comprehensive (8m 23s)

Progress: 1 succeeded, 0 failed, 3 remaining

⏳ Waiting 5 seconds before next run...
```

## Tips

1. **Start small**: Test with `benchmark:comprehensive` first (4 configs)
2. **Use --clean**: Add `--clean` flag to prevent data accumulation
3. **Monitor Langfuse**: View results at http://localhost:3000 during runs
4. **Check results/**: Summary files help compare runs
5. **Background running**: Use `nohup pnpm benchmark:all > benchmark.log 2>&1 &` for long runs

## Troubleshooting

**Script exits early:**
- Check Graphiti is running: `docker ps | grep graphiti`
- Check Ollama models exist: `ollama list`

**Model not found:**
- Pull missing model: `ollama pull {model-name}`

**Out of memory:**
- Reduce concurrent runs
- Use smaller models first
- Add swap space

**Database getting full:**
- Use `--clean` flag
- Manually clean: `pnpm benchmark:graphiti --clean` (without config)
