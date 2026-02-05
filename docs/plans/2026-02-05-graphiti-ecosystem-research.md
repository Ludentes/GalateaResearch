# Graphiti Ecosystem Research

**Date**: 2026-02-05
**Status**: Reference document for Phase 2 planning
**Context**: Evaluating Graphiti and its ecosystem for Galatea's memory system

---

## Graphiti Overview

- **Repo**: [getzep/graphiti](https://github.com/getzep/graphiti)
- **Version**: 0.26.3 (January 2026)
- **License**: Apache 2.0
- **Stars**: ~22.6k
- **Python**: 3.10+

Graphiti is an open-source Python framework for building temporally-aware knowledge graphs, made by Zep. It's the core engine behind Zep's commercial context-engineering platform.

### What Graphiti Provides Out of the Box

- **Entity Extraction**: LLM-powered extraction of entities and relationships from unstructured text, JSON, or chat messages. Uses reflexion loops to verify extraction completeness.
- **Entity Resolution / Deduplication**: Hybrid search (BM25 + vector similarity) identifies duplicates; LLM performs semantic deduplication.
- **Bi-Temporal Model**: Every edge tracks `valid_at`/`invalid_at` (when fact was true) and `created_at`/`expired_at` (when recorded/superseded). Enables time-travel queries.
- **Hybrid Search**: Combines semantic embeddings, keyword (BM25), and graph traversal (BFS). No LLM calls during retrieval — sub-200ms P95 latency.
- **Incremental Updates**: Real-time graph updates without batch recomputation. Contradictions resolved by invalidating (not deleting) old facts.
- **Community Detection**: Label propagation clustering for hierarchical summarization.
- **Custom Entity Types**: Define domain-specific entities via Pydantic models. Nine built-in: Preference, Requirement, Procedure, Location, Event, Organization, Document, Topic, Object.
- **Multi-Tenancy**: `group_id` field on all nodes/edges enables isolated graphs within a single database.
- **Cross-Encoder Reranking**: Supports OpenAI and Gemini rerankers.

### Graph Data Model

| Node Type | Label | Description |
|-----------|-------|-------------|
| EpisodicNode | `:Episodic` | Raw input data with temporal metadata |
| EntityNode | `:Entity` (+ dynamic labels) | Extracted entities with attributes and `name_embedding` |
| CommunityNode | `:Community` | Semantic clusters of entities |
| SagaNode | `:Saga` | Episode groupings |

| Edge Type | Relationship | Pattern |
|-----------|-------------|---------|
| EpisodicEdge | `:MENTIONS` | `(Episodic)-[:MENTIONS]->(Entity)` |
| EntityEdge | `:RELATES_TO` | `(Entity)-[:RELATES_TO]->(Entity)` — primary knowledge representation |
| CommunityEdge | `:HAS_MEMBER` | `(Community)-[:HAS_MEMBER]->(Entity)` |
| HasEpisodeEdge | `:HAS_EPISODE` | `(Saga)-[:HAS_EPISODE]->(Episodic)` |
| NextEpisodeEdge | `:NEXT_EPISODE` | `(Episodic)-[:NEXT_EPISODE]->(Episodic)` |

---

## Server Modes

### REST API Server (`/server` directory)

FastAPI service exposing Graphiti's capabilities over HTTP.

**Ingest Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/messages` | Add messages/episodes (returns 202 Accepted) |
| `POST` | `/entity-node` | Add an entity node directly (returns 201) |
| `DELETE` | `/entity-edge/{uuid}` | Delete an entity edge |
| `DELETE` | `/group/{group_id}` | Delete an entire group |
| `DELETE` | `/episode/{uuid}` | Delete an episode |
| `POST` | `/clear` | Clear all graph data |

**Retrieve Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/search` | Search for facts with group IDs filter |
| `GET` | `/entity-edge/{uuid}` | Get a specific entity edge |
| `GET` | `/episodes/{group_id}?last_n=N` | Get recent episodes for a group |
| `POST` | `/get-memory` | Compose memory from message history |

**Health:** `GET /healthcheck` returns `{"status": "healthy"}`
**Docs:** Swagger at `http://localhost:8000/docs`, ReDoc at `/redoc`

### MCP Server (`/mcp_server` directory)

Exposes Graphiti as a Model Context Protocol server for AI assistants.

**MCP Tools:**

| Tool | Description |
|------|-------------|
| `add_episode` | Ingest episodes (text, JSON, messages) |
| `search_nodes` | Query entity node summaries semantically |
| `search_facts` | Find edges/relationships between entities |
| `delete_entity_edge` | Remove edges by UUID |
| `delete_episode` | Remove episodes by UUID |
| `get_entity_edge` | Retrieve a specific edge by UUID |
| `get_episodes` | Fetch recent episodes for a group |
| `clear_graph` | Wipe graph and rebuild indices |
| `get_status` | Server and database health check |

**Transport:** HTTP at `/mcp/` endpoint, or stdio for CLI clients.

---

## Database Backend Support

| Backend | Protocol | Install Extra | Notes |
|---------|----------|--------------|-------|
| **Neo4j 5.26+** | Bolt | (included) | Primary/original backend |
| **FalkorDB 1.1.2+** | Redis | `[falkordb]` | 496x faster P99 latency vs Neo4j, now default for MCP server |
| **Kuzu 0.11.2+** | Embedded (file) | `[kuzu]` | Single-process, good for dev |
| **Amazon Neptune** | HTTPS | `[neptune]` | Requires Neptune cluster + OpenSearch |

FalkorDB connection:
```python
from graphiti_core.driver.falkordb_driver import FalkorDriver
driver = FalkorDriver(host="localhost", port=16379)
graphiti = Graphiti(graph_driver=driver)
```

---

## LLM Configuration

Graphiti uses LLM during **ingestion only** (entity extraction, resolution, edge extraction) — never during search.

**Critical warning**: "Graphiti works best with LLM services that support **Structured Output**. Using other services may result in incorrect output schemas and ingestion failures."

| Provider | Default Model | Install Extra | Notes |
|----------|--------------|--------------|-------|
| **OpenAI** | `gpt-5-mini` / `gpt-5-nano` | (included) | Best supported, JSON schema structured output |
| **Azure OpenAI** | (deployment name) | (included) | API version 2024-10-21+ required |
| **Google Gemini** | `gemini-2.5-flash` | `[google-genai]` | Good structured output |
| **Anthropic** | (configurable) | `[anthropic]` | Still needs OpenAI key for embeddings/reranking |
| **Groq** | (configurable) | `[groq]` | |
| **OpenAI-compatible** (Ollama, vLLM) | varies | (included) | Via custom `base_url`, quality varies |

### Our Configuration Decision

- **Primary**: Ollama with `gpt-oss:latest` (20GB) via OpenAI-compatible endpoint
- **Fallback 1**: OpenRouter with `gpt-oss` (120B)
- **Fallback 2**: OpenRouter with Z-LM flash
- **Escalation reason**: Structured output quality — smaller models may cause ingestion failures

---

## Embedding Configuration

| Provider | Default Model | Install Extra |
|----------|--------------|--------------|
| **OpenAI** | `text-embedding-3-small` (1536 dims) | (included) |
| **Voyage AI** | (configurable) | `[voyageai]` |
| **Sentence Transformers** | Any HuggingFace model | `[sentence-transformers]` |
| **Gemini** | (configurable) | `[google-genai]` |
| **Azure OpenAI** | (deployment name) | (included) |

### Our Configuration Decision

- **Ollama embeddings** — keeps the entire pipeline local and free

---

## Ecosystem Tools

### What We Can Reuse

| Tool | Status | Value | Notes |
|------|--------|-------|-------|
| **FalkorDB Browser** (port 13001) | Already running | **High** | Best option for exploring Graphiti's graph with Cypher queries. Customize node colors by label. |
| **Graphiti MCP Server** | Easy to add | **High** | Add to docker-compose for interactive Claude-powered memory testing/debugging. |
| **Graphiti FastAPI Server** | Easy to add | **High** | Our primary integration point. Swagger docs for development. |
| **zep-graph-visualization** | Needs forking | **Medium** | D3.js + React + Next.js graph visualization. MIT licensed. Connects to Zep Cloud API — would need rewiring to local Graphiti. |
| **G.V() Desktop** | Third-party | **Low-Medium** | Desktop graph IDE with FalkorDB support (v3.38.90+). WebGL rendering, schema auto-discovery. Commercial with free tier. |
| **rawr-ai/mcp-graphiti** | Third-party CLI | **Low** | Community CLI for multi-project MCP setups. Not needed for single project. |
| **Neo4j Browser/Bloom** | Not compatible | **Skip** | FalkorDB Bolt support is experimental. Not recommended. |

### FalkorDB Browser for Graphiti

Useful Cypher queries to run in FalkorDB Browser (port 13001):

```cypher
-- See all entities
MATCH (e:Entity) RETURN e

-- See all relationships between entities
MATCH (e1:Entity)-[r:RELATES_TO]->(e2:Entity) RETURN e1, r, e2

-- See episodes and what they mention
MATCH (ep:Episodic)-[m:MENTIONS]->(e:Entity) RETURN ep, m, e

-- See communities and their members
MATCH (c:Community)-[h:HAS_MEMBER]->(e:Entity) RETURN c, h, e

-- Full graph overview (limit for large graphs)
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100
```

### Graphiti MCP Server for Claude Integration

Can be added to docker-compose for interactive memory testing:

```yaml
graphiti-mcp:
  image: zepai/knowledge-graph-mcp:standalone
  ports:
    - "18000:8000"
  environment:
    FALKORDB_URI: "redis://falkordb:6379"
    FALKORDB_DATABASE: "galatea_memory"
    LLM_PROVIDER: "openai"
    MODEL_NAME: "gpt-oss:latest"
    LLM_BASE_URL: "http://host.docker.internal:11434/v1"
  depends_on:
    falkordb:
      condition: service_healthy
```

Claude Code MCP config (in `.claude/settings.json`):
```json
{
  "mcpServers": {
    "graphiti": {
      "uri": "http://localhost:18000/mcp/",
      "transport": { "type": "http" }
    }
  }
}
```

### zep-graph-visualization (Reference Implementation)

- **Repo**: [getzep/zep-graph-visualization](https://github.com/getzep/zep-graph-visualization)
- **Stack**: Next.js 15, React 19, D3.js (force-directed graph), Tailwind CSS, shadcn/ui
- **License**: MIT
- **Current state**: Connects to Zep Cloud API only (`ZEP_API_KEY`)
- **Reuse potential**: D3.js visualization components could be extracted and rewired to hit our local Graphiti REST API. Similar tech stack to ours (React, Tailwind, shadcn/ui).

---

## Testing Resources in Graphiti Repo

### Example Scripts and Data

| Example | Files | Description |
|---------|-------|-------------|
| `quickstart/` | `quickstart_falkordb.py`, `quickstart_neo4j.py` | Basic usage with California political figures |
| `podcast/` | `podcast_runner.py`, `transcript_parser.py` | Real podcast transcript parsing |
| `wizard_of_oz/` | `runner.py`, `parser.py`, `woo.txt` | Wizard of Oz text processing |
| `ecommerce/` | `runner.py`, `runner.ipynb` | E-commerce use case (Jupyter) |
| `langgraph-agent/` | `agent.ipynb` | LangGraph agent integration |
| `data/` | `manybirds_products.json` | Product catalog fixture |

### Test Fixtures

- `graph_driver` — parametrized async fixture supporting all 4 backends
- `mock_embedder` — returns pre-generated 384-dim embeddings for predefined names
- Mock tests create realistic graph structures with Entity, Episodic, Community nodes

---

## Known Issues and Limitations

### Structured Output Dependency (Critical)

Graphiti heavily relies on LLM structured output for entity/edge extraction. Providers without robust JSON schema support frequently produce malformed output, causing ingestion failures.

### Provider-Specific Bugs

- **Azure OpenAI**: Uses deprecated `beta.chat.completions.parse` API. GPT-4.1 on Azure doesn't support reasoning/verbosity params.
- **GPT-5 models**: Temperature parameter not supported, causes 400 errors.
- **Gemini**: Deprecated model references cause failures even with explicit configuration.
- **LLM Hallucinations**: May hallucinate entities/relationships not in source text.

### Rate Limiting

Entity extraction makes **many LLM calls** per episode (extraction, reflexion, resolution, edge extraction). `SEMAPHORE_LIMIT` env var (default: 10) controls concurrency.

### No Official TypeScript/HTTP Client SDK

Per [issue #921](https://github.com/getzep/graphiti/issues/921), no client library exists for the REST API. Must write own HTTP wrapper.

### Docker Image Backend Support

The `zepai/graphiti` Docker image historically only supported Neo4j. FalkorDB support was added via PR #742 — verify the latest image includes it.

---

## Decision: REST API Server vs MCP Server

For Galatea Phase 2, we plan to use the **REST API server** (`/server`) as the primary integration:

| Criteria | REST API | MCP Server |
|----------|---------|------------|
| Endpoints | Full CRUD + search | Limited tool set |
| Async ingestion | `POST /messages` returns 202 | `add_episode` blocks |
| Swagger docs | Yes | No |
| TypeScript integration | HTTP client (straightforward) | MCP protocol (more complex) |
| Claude debugging | No | Yes (interactive) |

**Plan**: Deploy REST API server for programmatic integration + optionally add MCP server for Claude-powered debugging.

---

*Document created: 2026-02-05*
*Related: [2026-02-02-memory-system-design.md](./2026-02-02-memory-system-design.md), [2026-02-02-memory-findings.md](./2026-02-02-memory-findings.md)*
