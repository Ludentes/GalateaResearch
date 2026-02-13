# Structured Output / Constrained Decoding for LLMs in TypeScript

**Date:** 2026-02-13
**Status:** Research summary

---

## Table of Contents

1. [Vercel AI SDK (v5/v6)](#1-vercel-ai-sdk-v5v6)
2. [Ollama Structured Output](#2-ollama-structured-output)
3. [Outlines / llama.cpp Grammars](#3-outlines--llamacpp-grammars)
4. [Instructor-JS](#4-instructor-js)
5. [TypeChat (Microsoft)](#5-typechat-microsoft)
6. [Other Approaches](#6-other-approaches)
7. [Key Questions Answered](#7-key-questions-answered)
8. [Recommendations](#8-recommendations)

---

## 1. Vercel AI SDK (v5/v6)

### Version History

- **AI SDK 5** (July 2025): Major rewrite with typed protocol, agentic loops, SSE streaming, speech APIs, dynamic tools, global providers.
- **AI SDK 6** (late 2025 / early 2026): Unifies `generateObject` and `generateText`. Introduces the `Agent` abstraction, per-tool strict mode, and `Output.object()`.

### Structured Output API (Current — v6)

`generateObject` and `streamObject` are **deprecated** in v6. The new approach:

```typescript
import { generateText } from 'ai';
import { Output } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Extract the receipt data',
  output: Output.object({
    schema: z.object({
      items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        price: z.number(),
      })),
      total: z.number(),
    }),
  }),
});
```

Key advantages of the v6 approach:
- Structured output generation can be **combined with tool calling** in the same request
- Multi-step agentic loops can produce structured output at the end
- The `enableToolsWithStructuredOutput` option enables both simultaneously

### Schema Support

- **Zod schemas** (primary, most common)
- **Valibot schemas** (alternative)
- **Raw JSON Schema** via `jsonSchema()` helper
- **Zod 4** natively supports `z.toJSONSchema()`, making the previously-needed `zod-to-json-schema` library obsolete

### Provider-Native Structured Output

When available, AI SDK uses **native strict mode** from the provider, which guarantees outputs match the schema exactly. This is supported by:

| Provider | Native Structured Output | Notes |
|----------|------------------------|-------|
| **OpenAI** | Yes (strict mode) | `response_format: { type: "json_schema" }`. 100% reliability on evals. |
| **Anthropic** | Yes (beta, Nov 2025) | `anthropic-beta: structured-outputs-2025-11-13`. Claude Sonnet 4.5+, Opus 4.1+. |
| **Google Generative AI** | Yes | Gemini models support JSON schema response format. |
| **Ollama** | Via community provider | Uses Ollama's native `format` parameter with JSON schema. |

### Strict Mode Behavior in v6

AI SDK 6 makes strict mode **opt-in per tool**. If a tool's schema uses features incompatible with a provider's strict mode (e.g., unsupported JSON Schema keywords), the entire request fails in strict mode. v6 lets you mix strict and regular tools in the same call.

### Retry and Repair Mechanisms

1. **`maxRetries`**: Default is 2 retries. Set to 0 to disable. Retries the entire LLM call on failure.
2. **`experimental_repairText`**: A function that receives the malformed output and the parse/validation error, and can attempt to fix the JSON before re-parsing. Returns repaired text or `null` if unfixable.
3. **`NoObjectGeneratedError`**: When structured output fails completely, this error provides access to the raw model output for debugging.
4. **Tool call repair** (experimental): When tool calls fail validation, failed calls are sent back to the LLM in the next step to give it an opportunity to self-correct.

### Ollama via AI SDK

Two community providers exist:

1. **`ai-sdk-ollama`** (by jagreehal) — Built on the official `ollama` npm package. v3+ requires AI SDK v6. Features:
   - Automatic detection of structured output capability
   - Built-in JSON repair (fixes trailing commas, comments, Python constants, etc.)
   - `enableToolsWithStructuredOutput` option
   - `structuredOutputs: true` must be set explicitly for JSON output with `generateText`/`streamText`

2. **`ollama-ai-provider`** (by sgomez) — OpenAI-compatible approach. Older, less feature-rich.

**Known Ollama limitations via AI SDK:**
- Some models (llama3, phi3) can be slow or error on JSON generation
- openhermes and mistral models work more reliably
- The provider includes JSON repair, but deep/recursive schemas may still fail

---

## 2. Ollama Structured Output

### Current State (as of Ollama v0.5+)

Ollama supports two modes for structured output:

1. **JSON mode** (`format: "json"`): Forces the model to wrap output in a JSON object. No schema enforcement — just guarantees valid JSON syntax.

2. **JSON Schema mode** (`format: { type: "object", properties: {...} }`): Converts the JSON schema to an EBNF grammar internally, which is passed to llama.cpp for constrained decoding. Output is guaranteed to match the schema structurally.

### How It Works Internally

Ollama replaced llama.cpp's `schema_to_grammar` with its own grammar package (PR #8124) that converts JSON schemas to EBNF. Improvements over llama.cpp's version:
- Maintains order of object keys in the schema
- Better handling of edge cases

The EBNF grammar is fed to llama.cpp's sampler, which masks tokens that would violate the grammar at each decoding step.

### OpenAI API Compatibility

There is a **known compatibility gap**: Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`) does **not** properly support OpenAI's `response_format: { type: "json_schema", json_schema: {...} }` syntax. You must use Ollama's native `format` parameter instead. This is tracked as [issue #10001](https://github.com/ollama/ollama/issues/10001).

### Known Limitations

1. **Incomplete JSON Schema support**: Arrays and complex data types may not work as expected ([issue #8462](https://github.com/ollama/ollama/issues/8462))
2. **No output validation**: Ollama does not validate the complete response against the schema. If the model stops generating mid-JSON (e.g., missing closing braces), the output may be syntactically invalid despite grammar constraints
3. **Deep/recursive schemas**: Very deep or recursive schemas can confuse models or cause generation failures
4. **Model quality varies**: Smaller models produce worse structured output even with grammar constraints
5. **No direct EBNF grammar API**: Unlike llama.cpp's server which accepts raw GBNF grammars, Ollama only accepts JSON schema in the `format` field. You cannot pass custom EBNF/GBNF grammars directly through Ollama's API

### Improvement Since 2024

Significant improvement since 2024. The February 2025 blog post noted that JSON schema mode gives "a huge improvement in the reliability of structured outputs" and "most models almost always return outputs that match the schema." Before v0.5, Ollama only had basic `format: "json"` mode with no schema enforcement.

---

## 3. Outlines / llama.cpp Grammars

### llama.cpp GBNF (GGML BNF)

GBNF is the grammar format used by llama.cpp for constrained decoding. It's a variant of BNF (Backus-Naur Form) that defines what tokens are allowed at each generation step.

**How it works:**
- At each decoding step, the grammar filters the token probability distribution
- Only tokens that maintain grammar compliance are allowed
- This guarantees syntactic correctness (100% compliance)
- Works with any grammar expressible in GBNF, not just JSON

**Can it be used via Ollama?**
- **Indirectly**: Ollama converts JSON schemas to EBNF internally and passes them to llama.cpp
- **Not directly**: Ollama does not expose a raw grammar parameter. You cannot send custom GBNF grammars through Ollama's API
- **llama.cpp server directly**: If you run llama.cpp's own HTTP server (instead of Ollama), you can pass raw GBNF grammars via the `grammar` parameter

**Performance impact:**
- Grammar-constrained decoding can **increase** per-token latency for complex grammars (due to token filtering overhead)
- However, total generation time may **decrease** because the model generates fewer tokens (no "thinking" about format, no extra whitespace/explanation)
- A February 2025 arxiv paper ("Lost in Space: Optimizing Tokens for Grammar-Constrained Decoding") explores optimizations for reducing overhead

### Outlines

Outlines is a **Python library** by dottxt-ai for structured generation. Key points:

- **No TypeScript support yet**: The team plans to explore JS/TS bindings in the future via `outlines-core` (a Rust port), but current focus is Python only
- **outlines-core**: A Rust port of Outlines' core algorithms, developed with Hugging Face. Could enable future TS/JS bindings via wasm or native bindings
- **Capabilities**: Supports JSON Schema, regex patterns, and context-free grammars
- **Works with**: OpenAI, Ollama, vLLM, and local models
- **"Coalescence" optimization**: Makes LLM inference up to 5x faster by optimizing structured generation

**Bottom line for TypeScript projects**: Outlines is not usable directly. The constrained decoding approach is only available via llama.cpp (through Ollama's JSON schema mode) or by running llama.cpp server directly.

---

## 4. Instructor-JS

### Current State: Deprecated / Low Activity

**Critical finding: `@instructor-ai/instructor` on npm is marked as deprecated.** The last version (1.7.0) was published over a year ago. The package health analysis shows it receives low attention from maintainers and could be considered discontinued.

### How It Worked

- Built on top of the OpenAI SDK
- Used Zod for schema validation with static type inference
- Leveraged OpenAI function calling API to enforce structure
- Supported retries with automatic self-correction (re-sends failed output to LLM with error context)
- Used `llm-polyglot` library for non-OpenAI providers (Anthropic, Azure, Cohere)

### Comparison to Vercel AI SDK

| Feature | Instructor-JS | Vercel AI SDK v6 |
|---------|--------------|-----------------|
| **Maintained** | No (deprecated) | Yes (active, 20M+ monthly downloads) |
| **Schema** | Zod | Zod, Valibot, JSON Schema |
| **Retry/repair** | Auto self-correction | `maxRetries` + `experimental_repairText` |
| **Provider support** | OpenAI + llm-polyglot | 15+ official providers |
| **Tool integration** | No | Yes (tools + structured output combined) |
| **Streaming** | Limited | Full streaming support |
| **Agent support** | No | Yes (Agent abstraction in v6) |

**Verdict**: Instructor-JS is effectively dead. Vercel AI SDK has absorbed all its use cases and far surpassed them. Do not use Instructor-JS for new projects.

---

## 5. TypeChat (Microsoft)

### What It Does

TypeChat uses **TypeScript types** as the specification language for LLM responses. Instead of prompt engineering, you do "schema engineering":

1. Define TypeScript interfaces for the desired output shape
2. TypeChat constructs a prompt including the type definitions
3. The LLM generates JSON conforming to those types
4. TypeChat validates using the **TypeScript compiler API** (not just JSON Schema)
5. If validation fails, it sends the error back to the LLM for repair

### Current State

- **GitHub**: 8.6k stars, 368 commits, 57 open issues, 30 PRs
- **Last significant activity**: April 2025 (PR to add `getJsonSchema()` to TypeChatJsonValidator)
- **Maintenance**: Receives dependency updates (dependabot), but feature development is slow
- **.NET version** (TypeChat.NET) appears more actively developed
- **Not deprecated**, but development pace is glacial

### Key Differences from Vercel AI SDK

- TypeChat uses the **TypeScript compiler** for validation (can validate more complex type constraints than JSON Schema)
- No constrained decoding — purely prompt-based with validation + retry
- No streaming support
- No tool calling integration
- Limited provider support (OpenAI-focused)

**Verdict**: TypeChat is a clever approach (using TS compiler for validation is powerful), but it's niche, slow-moving, and lacks the ecosystem support of Vercel AI SDK. Not recommended for new projects unless you specifically need TypeScript-compiler-level type validation.

---

## 6. Other Approaches

### OpenAI Structured Outputs (Native API)

Released August 2024. The gold standard for structured output:

- **`response_format: { type: "json_schema", json_schema: { strict: true, schema: {...} } }`**
- Uses constrained decoding internally (via Guidance/grammar)
- 100% schema compliance on benchmarks with gpt-4o
- Supports `strict: true` on tool/function definitions
- Also available via the newer **Responses API** (replacement for Chat Completions)
- SDK support via Zod: `zodResponseFormat(schema)` converts Zod to the required format

**Limitations of strict mode:**
- Only supports a subset of JSON Schema (no `oneOf`, limited `$ref`, no custom formats)
- All fields must be `required` (optional fields must use `"type": ["string", "null"]`)
- Recursive schemas have depth limits

### Anthropic Structured Outputs (Beta)

Launched November 14, 2025 in public beta:

- Available for Claude Sonnet 4.5 and Opus 4.1+
- Two modes: **JSON output mode** (`output_format` parameter) and **strict tool use** (`strict: true`)
- Uses constrained decoding (compiles JSON schema to grammar)
- First request with a new schema has 100-300ms overhead (grammar compilation), then cached 24h
- Requires beta header: `anthropic-beta: structured-outputs-2025-11-13`
- Integrated into `@ai-sdk/anthropic` via `structuredOutputMode` option

### Zod Ecosystem

- **Zod 4**: Natively supports `z.toJSONSchema()`, making `zod-to-json-schema` obsolete
- **`zod-to-json-schema`**: No longer receiving updates since Zod 4 includes this functionality
- **`zodResponseFormat()`**: OpenAI SDK helper to convert Zod schemas for structured outputs

### BAML (BoundaryML)

A notable alternative approach — uses **parsing instead of constrained decoding**:

- Domain-specific language (`.baml` files) for defining LLM function signatures with types
- Generates type-safe clients for Python, TypeScript, Ruby, etc.
- Uses **Schema-Aligned Parsing (SAP)** instead of constrained decoding:
  - Lets the LLM generate free-form output
  - Parses JSON flexibly from unstructured text
  - Coerces values to match schema requirements
  - Allows chain-of-thought reasoning before the structured answer
- Claims 93.63% accuracy on BFCL benchmark vs 91.37% for constrained decoding (gpt-4o)

### LM Studio

Supports structured responses via Zod schemas in its TypeScript SDK, using llama.cpp's grammar system under the hood.

---

## 7. Key Questions Answered

### Does Vercel AI SDK automatically use provider-native structured output when available?

**Yes, conditionally.** When a provider supports native structured output (like OpenAI's strict JSON schema mode or Anthropic's structured outputs), the SDK will use it. However:

- In v6, strict mode is **opt-in per tool** to avoid schema compatibility failures
- The Anthropic provider has a `structuredOutputMode` option to control this
- For Ollama, the community provider (`ai-sdk-ollama`) needs `structuredOutputs: true` set explicitly
- The SDK does not have a global "auto-detect and use native structured output" mode that transparently falls back — the provider implementation determines behavior

### What happens when a provider (like Ollama) doesn't fully support JSON schema?

Several things can happen:

1. **Partial schema support**: Ollama supports basic JSON schemas but struggles with arrays of complex types, deep nesting, and recursive schemas. The model will still attempt to conform, but may produce invalid output.
2. **Community provider JSON repair**: The `ai-sdk-ollama` provider includes built-in JSON repair that fixes common issues (trailing commas, comments, etc.)
3. **`experimental_repairText`**: You can provide a custom repair function that receives malformed output and tries to fix it
4. **`maxRetries`**: The SDK retries the entire call up to 2 times by default
5. **`NoObjectGeneratedError`**: If all retries fail, you get access to the raw output for manual handling

### Is there a retry/repair mechanism in Vercel AI SDK for malformed outputs?

**Yes, multiple layers:**

1. **Automatic retries** (`maxRetries: 2` by default) — retries the full LLM call
2. **`experimental_repairText`** — custom function to patch malformed JSON before re-parsing
3. **Tool call repair** (experimental) — sends failed tool call back to LLM for self-correction in multi-step flows
4. **`NoObjectGeneratedError`** — provides raw output for manual fallback logic

### What's the quality impact of constrained decoding vs prompt-only approaches?

This is a nuanced topic with active debate:

**Arguments AGAINST constrained decoding (BAML/BoundaryML research):**
- Forces models to prioritize format compliance over response quality
- Degrades chain-of-thought reasoning (reasoning must fit inside JSON fields)
- Can produce **silently wrong** values (e.g., rounding 0.46 to 1 when schema expects integer)
- Creates "false confidence" — valid schema compliance masks content errors
- On BFCL benchmark: parsing approach (93.63%) outperformed constrained decoding (91.37%)

**Arguments FOR constrained decoding:**
- 100% structural compliance (no parse errors ever)
- Simpler pipeline (no repair/retry logic needed)
- Essential for production systems that cannot tolerate format errors
- Reduced total tokens (no format explanation in output)

**Best practice (emerging consensus from 2025 research):**
- **Always describe the expected format in the prompt**, even when using constrained decoding. This narrows the gap between constrained and unconstrained token distributions and improves content quality.
- Use constrained decoding for **structural correctness**, but add prompt-level instructions for **content quality**
- For tasks requiring deep reasoning, consider allowing free-form output with a `reasoning` field before the structured answer
- Research paper: "Lost in Space" (Feb 2025) shows constraints can reduce reasoning ability and should be applied selectively

### Are there any hybrid approaches (prompt engineering + validation + retry)?

**Yes, this is the recommended approach in 2025-2026:**

1. **BAML's SAP approach**: Free-form LLM output + schema-aligned parsing + type coercion
2. **Vercel AI SDK's layered approach**: Provider-native structured output + `repairText` + `maxRetries`
3. **TypeChat's approach**: Prompt with type definitions + TypeScript compiler validation + LLM self-correction loop
4. **Instructor's approach** (historical): OpenAI function calling + Zod validation + automatic retry with error context
5. **Manual hybrid**: Use `format: "json"` (loose JSON mode) + Zod `.safeParse()` + custom retry logic with the validation error fed back to the LLM

The most robust pattern for production:

```typescript
// Pseudo-pattern combining multiple strategies
const result = await generateText({
  model: provider('model'),
  // 1. Prompt engineering: describe format in system/prompt
  system: 'You extract structured data. Always include all fields. Use exact values from the source.',
  prompt: userInput,
  // 2. Schema-enforced output (uses provider native when available)
  output: Output.object({ schema: myZodSchema }),
  // 3. Repair malformed output
  experimental_repairText: async ({ text, error }) => {
    // Try JSON repair first
    const repaired = tryJsonRepair(text);
    if (repaired) return repaired;
    // Or send back to LLM for self-correction
    return null;
  },
  // 4. Retry on failure
  maxRetries: 3,
});
```

---

## 8. Recommendations

### For a TypeScript Project Using Ollama + Cloud Providers

1. **Use Vercel AI SDK v6** as the primary framework. It's the clear winner in the TypeScript LLM ecosystem (20M+ monthly downloads, active development, broadest provider support).

2. **For Ollama**: Use `ai-sdk-ollama` (v3+) community provider. Enable `structuredOutputs: true`. Expect good results with mainstream models (mistral, llama3.1+, qwen3). Keep schemas simple (flat objects, basic arrays). The built-in JSON repair handles most edge cases.

3. **For cloud providers (OpenAI, Anthropic)**: Use official AI SDK providers. These support native structured outputs with constrained decoding for near-100% reliability.

4. **Schema design**: Use Zod 4 with `z.toJSONSchema()`. Prefer flat schemas over deeply nested ones. Add descriptions to Zod fields (`.describe('...')`) — these get included in prompts and improve output quality.

5. **Always combine prompt engineering with schema enforcement**. Don't rely on constrained decoding alone for content correctness.

6. **For complex extraction tasks**: Consider adding a `reasoning` or `thinking` field to your schema to allow chain-of-thought before the structured answer. This mitigates the quality degradation from constrained decoding.

7. **Skip**: Instructor-JS (deprecated), TypeChat (niche/slow), Outlines (Python only). Consider BAML only if you need the DSL and parsing approach specifically.

---

## Sources

- [AI SDK 6 - Vercel Blog](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Core: Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [AI SDK Core: generateObject Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object)
- [Ollama Structured Outputs Blog](https://ollama.com/blog/structured-outputs)
- [Ollama Structured Outputs Docs](https://docs.ollama.com/capabilities/structured-outputs)
- [How Does Ollama's Structured Outputs Work?](https://blog.danielclayton.co.uk/posts/ollama-structured-outputs/)
- [Ollama Issue #10001 - OpenAI Compatibility](https://github.com/ollama/ollama/issues/10001)
- [Ollama Issue #8462 - Arrays and Complex Types](https://github.com/ollama/ollama/issues/8462)
- [llama.cpp Grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)
- [Outlines - dottxt-ai](https://github.com/dottxt-ai/outlines)
- [outlines-core - Hugging Face Blog](https://huggingface.co/blog/outlines-core)
- [Instructor-JS GitHub](https://github.com/567-labs/instructor-js)
- [@instructor-ai/instructor npm](https://www.npmjs.com/package/@instructor-ai/instructor)
- [TypeChat - Microsoft GitHub](https://github.com/microsoft/TypeChat)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Anthropic Structured Outputs - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic Structured Outputs Announcement](https://techbytes.app/posts/claude-structured-outputs-json-schema-api/)
- [Structured Outputs Create False Confidence - BAML Blog](https://boundaryml.com/blog/structured-outputs-create-false-confidence)
- [BAML GitHub](https://github.com/BoundaryML/baml)
- [A Guide to Structured Outputs Using Constrained Decoding](https://www.aidancooper.co.uk/constrained-decoding/)
- [Generating Structured Outputs from Language Models: Benchmark and Studies (arxiv 2025)](https://arxiv.org/html/2501.10868v1)
- [Lost in Space: Optimizing Tokens for Grammar-Constrained Decoding (arxiv Feb 2025)](https://arxiv.org/html/2502.14969v1)
- [ai-sdk-ollama npm](https://www.npmjs.com/package/ai-sdk-ollama)
- [ai-sdk-ollama GitHub](https://github.com/jagreehal/ai-sdk-ollama)
- [ollama-ai-provider GitHub](https://github.com/sgomez/ollama-ai-provider)
- [Zod JSON Schema (Zod 4)](https://zod.dev/json-schema)
- [Constraining LLMs with Structured Output: Ollama, Qwen3](https://www.glukhov.org/post/2025/09/llm-structured-output-with-ollama-in-python-and-go/)
- [AI SDK Providers: Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [AI SDK Community Providers: Ollama](https://ai-sdk.dev/providers/community-providers/ollama)
