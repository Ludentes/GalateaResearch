# Graphiti Fork Workflow

Fork: https://github.com/Ludentes/graphiti

## Branch Strategy

```
main               ← tracks upstream getzep/graphiti (never commit here)
galatea             ← our working branch, branched from main
```

- `main` stays a clean mirror of upstream. Sync it periodically with
  `git fetch upstream && git merge upstream/main`.
- `galatea` contains our changes. When upstream syncs, rebase or merge
  `main` into `galatea`.
- Tag releases on `galatea`: `galatea-v0.26.3-1`, `galatea-v0.26.3-2`, etc.

## Setup (one-time)

```bash
# Clone the fork
git clone git@github.com:Ludentes/graphiti.git
cd graphiti

# Add upstream remote for syncing
git remote add upstream https://github.com/getzep/graphiti.git

# Create working branch
git checkout -b galatea
```

## The 4 Files We Change

All changes total ~80 lines across 4 files in a 19,000+ line codebase.

### 1. `graphiti_core/driver/falkordb_driver.py` (Bug 1 + Bug 2)

Two surgical changes:

**`build_indices_and_constraints()` — filter relationship indices:**

FalkorDB crashes the TCP connection on relationship range/fulltext indices.
Of 13 index queries generated, 6 target relationships. We filter them out.

```python
# BEFORE (line ~340):
async def build_indices_and_constraints(self, delete_existing=False):
    if delete_existing:
        await self.delete_all_indexes()
    index_queries = get_range_indices(self.provider) + get_fulltext_indices(self.provider)
    for query in index_queries:
        await self.execute_query(query)

# AFTER:
async def build_indices_and_constraints(self, delete_existing=False):
    if delete_existing:
        await self.delete_all_indexes()
    index_queries = get_range_indices(self.provider) + get_fulltext_indices(self.provider)
    for query in index_queries:
        # FalkorDB does not support indices on relationships —
        # attempting these crashes the connection (drops TCP).
        if '()-[' in query or 'FOR ()-' in query:
            continue
        await self.execute_query(query)
```

**`clone()` — preserve subclass type:**

When Graphiti clones a driver for per-group routing, it hardcodes
`FalkorDriver(...)`, losing any subclass overrides. The fix uses
`type(self)` so that subclasses (or any future extension) are preserved.

```python
# BEFORE (line ~320):
def clone(self, database: str) -> 'GraphDriver':
    if database == self._database:
        cloned = self
    elif database == self.default_group_id:
        cloned = FalkorDriver(falkor_db=self.client)
    else:
        cloned = FalkorDriver(falkor_db=self.client, database=database)
    return cloned

# AFTER:
def clone(self, database: str) -> 'GraphDriver':
    if database == self._database:
        return self
    cls = type(self)  # Preserve subclass
    if database == self.default_group_id:
        return cls(falkor_db=self.client)
    return cls(falkor_db=self.client, database=database)
```

**Merge risk: MEDIUM.** Upstream modifies this file when adding index types
or driver features. Our changes are in two small, clearly-bounded methods.
Most upstream changes (new query methods, new fields) won't touch these.

### 2. `graphiti_core/decorators.py` (Bug 3)

The `@handle_multiple_group_ids` decorator only routes FalkorDB queries
to the correct per-group graph when `len(group_ids) > 1`. A single
group_id falls through and queries the empty default database.

```python
# BEFORE (line ~52):
        if (
            hasattr(self, 'clients')
            and hasattr(self.clients, 'driver')
            and self.clients.driver.provider == GraphProvider.FALKORDB
            and group_ids
            and len(group_ids) > 1
        ):

# AFTER:
        if (
            hasattr(self, 'clients')
            and hasattr(self.clients, 'driver')
            and self.clients.driver.provider == GraphProvider.FALKORDB
            and group_ids
            and len(group_ids) >= 1
        ):
```

One character: `>` becomes `>=`.

**Merge risk: LOW.** This file is stable infrastructure. Upstream rarely
touches it. This fix is a clear bug — it could be submitted as an upstream
PR.

### 3. `server/graph_service/config.py` (FalkorDB config)

Replace Neo4j settings with FalkorDB + Ollama LLM/embedding settings.

```python
# REPLACE entire file with:
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # LLM
    openai_api_key: str = Field(default="ollama")
    openai_base_url: str | None = Field(None)
    model_name: str | None = Field(None)
    small_model_name: str | None = Field(None)
    embedding_model_name: str | None = Field(None)
    embedder_base_url: str | None = Field(None)
    embedder_api_key: str | None = Field(None)

    # FalkorDB (replaces Neo4j)
    falkordb_uri: str = Field(default="redis://localhost:6379")
    falkordb_database: str = Field(default="galatea_memory")

    # Concurrency
    semaphore_limit: int = Field(default=10)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings():
    return Settings()


ZepEnvDep = Annotated[Settings, Depends(get_settings)]
```

**Merge risk: LOW.** This file is a simple Pydantic model. Upstream
changes would add new Neo4j fields, which we don't use. Merge conflicts
would be trivially resolvable.

### 4. `server/graph_service/zep_graphiti.py` (FalkorDB initialization)

Replace Neo4j driver construction with FalkorDB driver construction,
use `OpenAIGenericClient` for Ollama compatibility, add embedder config.

This is the file with the highest merge risk because upstream modifies
it when adding features. Our version is 260 lines vs upstream's ~100.
The extra size comes from:
- `_parse_redis_uri()` helper (18 lines)
- `_create_driver()`, `_create_llm_client()`, `_create_embedder()` (40 lines)
- The `ZepGraphiti.search()` override (15 lines) — but this becomes
  unnecessary once Bug 3 in `decorators.py` is fixed

If we fix Bug 3 in `decorators.py`, this file shrinks to ~200 lines and
the only structural difference from upstream is the driver/client construction.

**Merge risk: HIGH.** Mitigate by keeping the structure as close to
upstream as possible. When upstream adds a new method to `ZepGraphiti`,
it will likely just need adding — not conflicting with our changes.

## Galatea Integration

### Option A: Git Submodule (Recommended)

```
galatea/
  graphiti/          ← git submodule → Ludentes/graphiti@galatea
  docker-compose.yml
  server/            ← Galatea TypeScript code
```

```bash
# Add submodule (one-time)
cd /path/to/galatea
git submodule add -b galatea git@github.com:Ludentes/graphiti.git graphiti

# Dockerfile changes: build from local checkout instead of git clone
```

New `graphiti/Dockerfile` (replaces current overlay approach):

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && rm -rf /var/lib/apt/lists/*

ADD https://astral.sh/uv/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh
ENV PATH="/root/.local/bin:$PATH"
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

RUN groupadd -r app && useradd -r -d /app -g app app
WORKDIR /app

# Copy server code from the fork (already patched)
COPY server/ /app/

# Install dependencies, then add FalkorDB extras
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev && \
    uv pip install --upgrade "graphiti-core[falkordb]"

# Install graphiti-core from the fork source (with our fixes)
COPY graphiti_core/ /tmp/graphiti_core/
RUN uv pip install /tmp/graphiti_core/ && rm -rf /tmp/graphiti_core/

RUN chown -R app:app /app
ENV PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
USER app

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "graph_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The key difference: instead of cloning upstream and overlaying patched
files, we copy directly from the fork's `server/` and `graphiti_core/`
directories. No overlay, no `COPY` patches, no stale lockfile issues.

Docker Compose build context:

```yaml
graphiti:
  build:
    context: ./graphiti    # The submodule
    dockerfile: Dockerfile # Lives inside the submodule
```

Wait — the Dockerfile needs to be in Galatea, not in the fork, because it
references `COPY server/` and `COPY graphiti_core/` from the fork repo root.
Or we can put it in the fork itself.

**Cleanest approach:** Put the Dockerfile in the fork repo at
`Dockerfile.falkordb` (so it doesn't conflict with any upstream Dockerfile).
Then:

```yaml
graphiti:
  build:
    context: ./graphiti
    dockerfile: Dockerfile.falkordb
```

### Option B: Dockerfile Clones from Fork URL

If submodules feel heavy, the Dockerfile can clone from the fork directly:

```dockerfile
ARG GRAPHITI_REF=galatea
RUN git clone --depth 1 -b $GRAPHITI_REF \
    https://github.com/Ludentes/graphiti.git /tmp/graphiti && \
    cp -r /tmp/graphiti/server/* /app/ && \
    rm -rf /tmp/graphiti
```

This is simpler but loses local editability — you'd have to push to
GitHub before every Docker rebuild.

### Recommendation: Option A with the Dockerfile in the fork

It gives you:
- `cd graphiti/ && vim graphiti_core/driver/falkordb_driver.py` — edit directly
- `docker compose build graphiti` — builds from local checkout
- `cd graphiti/ && git push` — push fixes to the fork
- `cd graphiti/ && git fetch upstream && git merge upstream/main` — sync upstream

## Syncing Upstream

```bash
cd graphiti/

# Fetch upstream changes
git fetch upstream

# Merge into main (keep main as a clean mirror)
git checkout main
git merge upstream/main
git push origin main

# Rebase our changes on top
git checkout galatea
git rebase main

# If conflicts: resolve, then
git rebase --continue
git push origin galatea --force-with-lease
```

Expected conflicts per sync: **0-1 files.** The only high-risk file
is `server/graph_service/zep_graphiti.py`. The other 3 files change
rarely upstream.

## Removing the Soft Fork

Once the real fork is set up, delete from Galatea:
- `graphiti/config_falkordb.py`
- `graphiti/zep_graphiti_falkordb.py`
- `graphiti/Dockerfile` (replaced by `Dockerfile.falkordb` in the fork)

The `graphiti/` directory becomes a pure git submodule pointer.

## Upstream PR Candidates

Two of our fixes are clearly bugs that affect all FalkorDB users:

| Fix | PR-ability | Notes |
|-----|-----------|-------|
| Bug 2: `clone()` loses subclass | **High** — clean fix, uses `type(self)` | Universal improvement, not Galatea-specific |
| Bug 3: `@handle_multiple_group_ids` single group | **High** — one-char fix | Obviously correct behavior |
| Bug 1: Skip relationship indices | **Medium** — could be seen as FalkorDB bug | Worth discussing in an issue first |
| Server FalkorDB config | **Low** — Zep has their own Neo4j infra | They'd need to restructure config to support both |

If bugs 2 and 3 are accepted upstream, our fork diff drops to **2 files**
(config.py + zep_graphiti.py) which are server-specific and rarely conflict.
