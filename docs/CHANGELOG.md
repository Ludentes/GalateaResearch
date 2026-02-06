# Galatea Documentation Changelog

## 2026-02-06: OpenTelemetry Observation Pipeline

### Major Decision: OTEL as Unified Backbone

After comprehensive research (see [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md)), adopted **OpenTelemetry (OTEL) as the unified observation pipeline backbone**.

### New Documentation

**Observation Pipeline Docs** ([observation-pipeline/](./observation-pipeline/)):
1. [00-architecture-overview.md](./observation-pipeline/00-architecture-overview.md) - OTEL-first system design
2. [01-claude-code-otel.md](./observation-pipeline/01-claude-code-otel.md) - Claude Code hooks implementation
3. [02-vscode-otel.md](./observation-pipeline/02-vscode-otel.md) - VSCode extension design
4. [03-linux-activity-otel.md](./observation-pipeline/03-linux-activity-otel.md) - System activity monitoring
5. [04-discord-otel.md](./observation-pipeline/04-discord-otel.md) - Discord bot (optional)
6. [05-browser-otel.md](./observation-pipeline/05-browser-otel.md) - Browser extension design
7. [06-mqtt-to-otel-bridge.md](./observation-pipeline/06-mqtt-to-otel-bridge.md) - Home Assistant/Frigate bridge
8. [README.md](./observation-pipeline/README.md) - Index and quick start

**Research Report**:
- [research/2026-02-06-otel-vs-mqtt-comparison.md](./research/2026-02-06-otel-vs-mqtt-comparison.md) - Comprehensive OTEL vs MQTT analysis

### Updated Documentation

**Core Architecture Docs**:
1. **[FINAL_MINIMAL_ARCHITECTURE.md](./FINAL_MINIMAL_ARCHITECTURE.md)**
   - Updated date to 2026-02-06
   - Added OTEL observation pipeline section
   - Updated "The Observation Pipeline" to reflect OTEL-first design

2. **[PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)**
   - Updated date to 2026-02-06
   - Added note about OTEL observation pipeline

3. **[OBSERVATION_PIPELINE.md](./OBSERVATION_PIPELINE.md)**
   - Complete rewrite for OTEL-first architecture
   - Added "Architectural Decision: OpenTelemetry as Unified Backbone" section
   - Updated pipeline architecture diagram to show OTEL Collector
   - Changed Layer 1 from "Activity Capture" to "Activity Sources (OTEL Emitters)"
   - Updated data schema to show OTEL event format
   - Added OTEL infrastructure setup section
   - Archived old ActivityWatch/extension examples

4. **[OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)**
   - Marked Question #1 "Logging & Observation Infrastructure" as ✅ RESOLVED
   - Added decision summary and links to OTEL docs
   - Collapsed original question into details tag (archived)
   - Updated summary table
   - Updated date to 2026-02-06

### Key Changes Summary

**Before (2026-02-02)**:
- Observation pipeline design was incomplete
- No decision on infrastructure (ActivityWatch vs custom vs LangFuse)
- MQTT mentioned for Home Assistant but no integration plan

**After (2026-02-06)**:
- ✅ OTEL adopted as unified backbone
- ✅ Complete implementation guides for all sources
- ✅ Infrastructure architecture (OTEL Collector config)
- ✅ MQTT→OTEL bridge designed for Home Assistant/Frigate
- ✅ Single ingestion API endpoint (POST /api/observation/ingest)
- ✅ Standardized OTEL event format across all sources

### Implementation Priority

**Phase 1 (MVP)**:
1. OTEL Collector setup
2. Claude Code observation (hooks)
3. Browser extension
4. Galatea ingest API

**Phase 2**:
5. VSCode extension
6. Linux activity monitoring

**Phase 3**:
7. MQTT→OTEL bridge (Home Assistant/Frigate)

### Benefits of OTEL Approach

1. **Single Interface**: Pipeline code only consumes OTEL events (no MQTT handling)
2. **Native Support**: Claude Code has built-in OTEL support via hooks
3. **Infrastructure Bridge**: OTEL Collector bridges MQTT→OTEL (no code needed)
4. **Extensible**: Add sources by emitting OTEL (VSCode, Browser, Discord)
5. **Ecosystem**: Integration with Langfuse (already using), Jaeger, Prometheus

### Breaking Changes

None. This is a new system design, not a refactor of existing code.

### Migration Notes

N/A - This is greenfield implementation.

---

## Previous Changes

See git history for changes before 2026-02-06.

---

*This changelog tracks major documentation updates and architectural decisions.*
