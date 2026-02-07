# Graphiti Integration Report

## Executive Summary

Graphiti (by Zep) is a Python framework for temporally-aware knowledge graphs.
We use it as a sidecar service for Galatea's memory system. The official Docker
image only supports Neo4j; we need FalkorDB. This required building a custom
Docker image that replaces 2 of 11 server Python files, plus a subclass of the
FalkorDB driver from `graphiti-core` itself to work around three distinct bugs.

The integration is working end-to-end: ingestion, entity extraction (via
llama3.2), vector+fulltext search, and context assembly. But the path here was
rough, and there are foreseeable future problems.

---

## 1. The Bugs We Hit

### Bug 1: FalkorDB Relationship Index Crash (Critical)

**What happens:** `FalkorDriver.__init__()` fires
`build_indices_and_constraints()` as a background `asyncio.create_task()`.
This method generates 13 Cypher index-creation queries. Six of them target
*relationships* (edges). FalkorDB does not support range or fulltext indices
on relationships — it drops the TCP connection when it receives one.

```
[SKIP] CREATE INDEX FOR ()-[e:RELATES_TO]-() ON (e.uuid, e.group_id, ...)
[SKIP] CREATE INDEX FOR ()-[e:MENTIONS]-() ON (e.uuid, e.group_id)
[SKIP] CREATE INDEX FOR ()-[e:HAS_MEMBER]-() ON (e.uuid)
[SKIP] CREATE INDEX FOR ()-[e:HAS_EPISODE]-() ON (e.uuid, e.group_id)
[SKIP] CREATE INDEX FOR ()-[e:NEXT_EPISODE]-() ON (e.uuid, e.group_id)
[SKIP] CREATE FULLTEXT INDEX FOR ()-[e:RELATES_TO]-() ON (e.name, e.fact, e.group_id)
```

Because `FalkorDriver.__init__` fires this as a *background task*, the main
code continues using the now-corrupted connection. Writes silently fail. We
observed `add_episode` returning SUCCESS with zero nodes written to the graph.

**Our fix:** `SafeFalkorDriver` overrides `build_indices_and_constraints()` to
filter out all queries containing `()-[` or `FOR ()-`. Only 7 node-level
indices are created. This is a 20-line override.

**Impact of missing indices:** The 5 relationship range indices are used for
fast lookups by uuid/group_id on edges. Without them, Cypher queries on edges
do full scans. For our scale (single user, thousands of facts), this is
negligible. The relationship fulltext index would enable BM25 text search on
edge properties — but vector search (cosine similarity on `fact_embedding`)
still works fine, which is the primary retrieval path.

### Bug 2: `clone()` Returns Wrong Driver Class (Critical)

**What happens:** Graphiti uses FalkorDB's multi-tenant model: each `group_id`
becomes a separate FalkorDB graph via `driver.clone(database=group_id)`. The
upstream `FalkorDriver.clone()` returns a plain `FalkorDriver`:

```python
def clone(self, database):
    return FalkorDriver(falkor_db=self.client, database=database)
```

This new `FalkorDriver.__init__` fires the broken
`build_indices_and_constraints()` background task again — the original version,
not our safe override. Every new `group_id` re-triggers the crash.

**Our fix:** `SafeFalkorDriver.clone()` returns `SafeFalkorDriver` instead.
5 lines.

### Bug 3: `@handle_multiple_group_ids` Ignores Single Group (Medium)

**What happens:** The `Graphiti.search()` method is decorated with
`@handle_multiple_group_ids`. On FalkorDB, this decorator clones the driver to
the correct per-group graph — but only when `len(group_ids) > 1`:

```python
if (self.clients.driver.provider == GraphProvider.FALKORDB
    and group_ids
    and len(group_ids) > 1):   # <-- Bug: single group_id falls through
```

With a single `group_id`, search runs against the default database
(`galatea_memory`) which contains only schema indices and zero data. The
actual data lives in the per-group graph (e.g., `test-e2e`).

**Our fix:** `ZepGraphiti.search()` override that manually clones the driver
when `len(group_ids) == 1`. 15 lines.

---

## 2. The Ollama + Graphiti Struggles

Graphiti's entity extraction pipeline uses the OpenAI SDK internally
(`openai.ChatCompletion.create` with `response_format: { type: "json_schema" }`).
This is how it extracts entities, relationships, and temporal metadata from
text.

### Models Tested

| Model | Provider | Result |
|-------|----------|--------|
| `gpt-oss:latest` (13GB) | Ollama | Empty response — `response_format: json_schema` returns nothing |
| `meta-llama/llama-3.1-8b-instruct:free` | OpenRouter | Model name changed, 404 |
| `meta-llama/llama-4-scout:free` | OpenRouter | Model name changed, 404 |
| `z-ai/glm-4.5-air:free` | OpenRouter | Same empty response as gpt-oss |
| `openai/gpt-oss-120b:free` | OpenRouter | **Worked** but hit rate limit (429) before completion |
| **`llama3.2` (2GB)** | **Ollama** | **Works reliably** — entities + facts extracted correctly |
| `granite3-dense:8b` | Ollama | Not yet tested |

### Root Cause

Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`) handles
`response_format: { type: "json_schema", json_schema: {...} }` inconsistently
across models. Some models (gpt-oss, GLM-4.5) return empty strings. Ollama's
*native* API (`/api/chat` with `format: <schema>`) uses grammar-based
constrained decoding which is far more reliable — but Graphiti uses the OpenAI
SDK, not Ollama's native API.

`llama3.2` (3B) works because it has been specifically fine-tuned for
structured output compliance and is small enough to respond quickly within
Graphiti's internal timeouts.

### Current Config

```yaml
MODEL_NAME: "llama3.2"        # 2GB, reliable structured output
SMALL_MODEL_NAME: "llama3.2"  # Used for simpler extraction tasks
EMBEDDING_MODEL_NAME: "nomic-embed-text"  # 768-dim embeddings, 274MB
```

### Potential Future Issues

- **llama3.2 extraction quality:** It's a 3B model. Complex multi-entity
  sentences sometimes produce incomplete extractions. In our test, "I always
  use Vim keybindings in VS Code" only extracted "Catppuccin Mocha" as an
  entity, missing "Vim" and "VS Code". A larger model would do better, but
  none of the tested alternatives worked with Graphiti's OpenAI-compat path.
- **Model updates:** Ollama model tags are mutable. An `ollama pull llama3.2`
  could change behavior.
- **Timeout sensitivity:** Graphiti's extraction calls multiple LLM endpoints
  sequentially (entity extraction, relationship extraction, temporal parsing,
  deduplication). On a slow machine, these can chain-timeout.

---

## 3. How the "Soft Fork" Works

We replace **2 of 11** server Python files via Docker `COPY` overlays:

```dockerfile
COPY config_falkordb.py  /app/graph_service/config.py       # 40 lines
COPY zep_graphiti_falkordb.py /app/graph_service/zep_graphiti.py  # 260 lines
```

The other 9 files (`main.py`, `dto/`, `routers/`) are used as-is from
upstream.

We do NOT modify `graphiti-core` (the pip package, 82 files / 19,263 lines).
Instead, we use Python subclassing:

| Upstream Class | Our Subclass | What We Override |
|----------------|-------------|------------------|
| `FalkorDriver` | `SafeFalkorDriver` | `build_indices_and_constraints()` — filter relationship indices (20 lines) |
| `FalkorDriver` | `SafeFalkorDriver` | `clone()` — return SafeFalkorDriver, not FalkorDriver (5 lines) |
| `Graphiti` | `ZepGraphiti` | `search()` — handle single group_id routing (15 lines) |

### What the Upstream Files We Replace Do

**`config.py`** (upstream: 58 lines, ours: 40 lines): Upstream reads `neo4j_uri`,
`neo4j_user`, `neo4j_password`. Ours reads `falkordb_uri`, `falkordb_database`,
plus LLM/embedding config for Ollama.

**`zep_graphiti.py`** (upstream: ~200 lines, ours: 260 lines): Upstream creates
a `Neo4jDriver` and `OpenAIClient`. Ours creates `SafeFalkorDriver` and
`OpenAIGenericClient` pointed at Ollama. The ZepGraphiti class adds the
search override. Helper methods (`save_entity_node`, `delete_group`, etc.)
are functionally identical to upstream.

---

## 4. Foreseeable Future Troubles

### High Probability

1. **Upstream API changes in `graph_service/routers/`**: If Zep changes the
   request/response DTOs, our TypeScript client will break. We don't replace
   the router files, but our client (`graphiti-client.ts`) is typed against
   the current DTO shapes.

2. **`FalkorDriver` constructor changes**: If upstream changes the `__init__`
   signature or stops firing `build_indices_and_constraints()` as a background
   task, our `SafeFalkorDriver` override may become a no-op (harmless) or
   incompatible (breaks).

3. **`@handle_multiple_group_ids` decorator changes**: If Zep fixes the single
   group_id bug upstream, our `ZepGraphiti.search()` override would become
   redundant (harmless double-clone, since `clone(same_db)` returns `self`).

### Medium Probability

4. **Ollama structured output regressions**: Model updates or Ollama version
   updates could break the `/v1/chat/completions` + `response_format` path
   that Graphiti depends on.

5. **FalkorDB async driver changes**: The `falkordb` Python package uses
   `redis-py` under the hood. A major version bump could change connection
   semantics.

6. **New index types**: If Graphiti adds more index types (e.g., vector
   indices via explicit Cypher), our string-matching filter (`()-[` not in q)
   might miss them.

### Low Probability

7. **Graphiti drops FalkorDB support**: The `graphiti-core[falkordb]` extra
   is relatively new. If Zep deprioritizes it, we'd need to maintain the
   driver ourselves.

---

## 5. Could We Do a Proper Fork?

### The Case For

A proper Git fork would let us:
- Fix bugs 1-3 directly in the source instead of via subclasses
- Pin to exact commits instead of relying on `pip install --upgrade`
- Add FalkorDB-native config to the REST server directly
- Contribute fixes upstream via PRs

### Minimal Fork Strategy

The smallest possible fork would touch **4 files** in the Graphiti monorepo:

| File | Change | Lines Changed |
|------|--------|---------------|
| `graphiti-core/graphiti_core/driver/falkordb_driver.py` | Filter relationship indices in `build_indices_and_constraints()`, fix `clone()` to preserve subclass | ~15 lines |
| `graphiti-core/graphiti_core/decorators.py` | Fix `@handle_multiple_group_ids` for `len(group_ids) == 1` | ~3 lines |
| `server/graph_service/config.py` | Add FalkorDB settings alongside Neo4j | ~20 lines |
| `server/graph_service/zep_graphiti.py` | Add FalkorDB initialization path | ~40 lines |

Total: ~78 lines changed across 4 files out of 82+ files in the repo.

### Merge Conflict Risk Assessment

| File | Upstream Change Frequency | Merge Risk |
|------|--------------------------|------------|
| `falkordb_driver.py` | Medium — active development | **Medium** — our changes are in `build_indices_and_constraints()` which upstream also modifies when adding new index types |
| `decorators.py` | Low — stable utility | **Low** — the fix is a one-line condition change |
| `config.py` | Low — settings rarely change | **Low** |
| `zep_graphiti.py` | High — main integration point | **High** — this file changes frequently as Zep adds features |

### Recommendation

**Keep the soft fork for now.** The subclass approach works, touches zero
upstream code, and the 3 overrides total 40 lines. If any of these become
impractical (e.g., upstream refactors `FalkorDriver` internals that we depend
on), switch to a Git fork touching the 4 files above.

The strongest argument for forking would be if we want to **contribute the
fixes upstream** — bugs 2 and 3 are clearly bugs that affect all FalkorDB
users, and Zep would likely accept PRs for them. Bug 1 (skipping relationship
indices) is more debatable since FalkorDB *should* support them — it might be
a FalkorDB bug rather than a Graphiti bug.

---

## 6. File Inventory

### Our Patches (in `graphiti/`)
```
graphiti/
  Dockerfile                    # Custom image, clones upstream + installs falkordb extras
  config_falkordb.py            # 40 lines — replaces server/graph_service/config.py
  zep_graphiti_falkordb.py      # 260 lines — replaces server/graph_service/zep_graphiti.py
```

### Upstream Server (unchanged, used as-is)
```
graph_service/
  main.py                       # 29 lines — FastAPI app + lifespan
  dto/__init__.py               # 15 lines
  dto/common.py                 # 28 lines
  dto/ingest.py                 # 15 lines
  dto/retrieve.py               # 45 lines
  routers/ingest.py             # 111 lines — POST /messages
  routers/retrieve.py           # 63 lines — POST /search, GET /episodes, etc.
```

### graphiti-core (pip package, unmodified)
```
82 Python files, 19,263 total lines
Key file: driver/falkordb_driver.py (362 lines) — where our SafeFalkorDriver subclasses from
```
