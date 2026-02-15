# Cheap/Fast OpenRouter Models for Extraction Tasks

**Date:** 2026-02-15
**Context:** Fallback models for when Ollama circuit breaker trips. Need structured output support (JSON schema) for knowledge extraction.

---

## Free Models with Structured Output Support

| Model ID | Name | Context | Notes |
|----------|------|---------|-------|
| `google/gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | large | Fastest free option. Optimized for speed. |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | large | Strong all-round. Ranked highly across domains. |
| `z-ai/glm-4.7-flash` | GLM 4.7 Flash | 202k | Same model we use locally. $0.06/$0.40 per M tokens (near-free). |
| `stepfun/step-3.5-flash:free` | Step 3.5 Flash | 256k | Free reasoning model with MoE. |
| `nvidia/nemotron-3-nano-30b-a3b:free` | Nemotron 3 Nano 30B | 256k | MoE efficiency model. |
| `arcee-ai/trinity-mini:free` | Trinity Mini | 131k | 26B sparse MoE, 3B active. Lightweight. |
| `deepseek/deepseek-v3.2-20251201` | DeepSeek V3.2 | large | Strong general-purpose. Free tier. |

## Ultra-Cheap Paid Models

| Model ID | Input $/M | Output $/M | Context | Notes |
|----------|-----------|------------|---------|-------|
| `mistralai/ministral-3b-2512` | $0.10 | $0.10 | 131k | Tiny, fast. Vision-capable. |
| `z-ai/glm-4.7-flash` | $0.06 | $0.40 | 202k | Our primary model on OpenRouter. |

## Recommendation

**Primary fallback: `google/gemini-2.5-flash-lite`**
- Free
- Fast (optimized for speed)
- Google's structured output is excellent (native JSON schema support)
- Large context window

**Secondary fallback: `z-ai/glm-4.5-air:free`** (current config)
- Free tier of GLM family
- Same model family as our local Ollama model

**Budget concern:** All free-tier models have rate limits. For sustained fallback during Ollama outage, `z-ai/glm-4.7-flash` at $0.06/$0.40 per M tokens is extremely cheap (~$0.001 per extraction call with our 472-char prompts).

## Sources

- [OpenRouter Free Models](https://openrouter.ai/collections/free-models)
- [OpenRouter Pricing](https://openrouter.ai/pricing)
- [OpenRouter Models API](https://openrouter.ai/api/v1/models)
- [OpenRouter Models Ranked (2026)](https://www.teamday.ai/blog/top-ai-models-openrouter-2026)
