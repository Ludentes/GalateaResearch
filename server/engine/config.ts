import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---- Types ----

export interface RetrievalConfig {
  max_entries: number
  entity_name_min_length: number
  keyword_min_length: number
  keyword_overlap_threshold: number
  use_vector: boolean
  qdrant_url: string
  ollama_embed_url: string
}

export interface SignalConfig {
  greeting_max_length: number
  signal_confidence: number
  noise_confidence: number
  factual_min_length: number
  factual_confidence: number
  default_noise_confidence: number
}

export interface DedupConfig {
  content_jaccard_threshold: number
  evidence_jaccard_threshold: number
  content_with_evidence_threshold: number
  embedding_cosine_threshold: number
  tokenize_min_word_length: number
}

export interface ExtractionConfig {
  chunk_size: number
  default_temperature: number
  max_retries: number
  tool_input_truncation: number
  novelty_filter: boolean
  inferred_confidence_cap: number
  auto_approve_explicit_threshold: number
}

export interface ContextConfig {
  token_budget: number
  chars_per_token: number
  truncation_min_remaining: number
  truncation_min_content: number
  truncation_header_buffer: number
  compression: {
    strategy: string
    chars_per_token: number
    reserve_ratio: number
    model_budgets: Record<string, number>
  }
}

export interface HomeostasisConfig {
  communication_idle_hours: number
  stuck_detection_window: number
  stuck_jaccard_threshold: number
  stuck_shared_stems_min: number
  knowledge_message_min_length: number
  knowledge_keyword_overlap: number
  knowledge_high_score: number
  keyword_min_length: number
  cache_ttl: Record<string, number>
  l2: {
    enabled: boolean
    model: string
    max_tokens: number
    timeout_ms: number
  }
}

export interface HeartbeatConfig {
  enabled: boolean
  interval_ms: number
  skip_when_idle: boolean
}

export interface DecayConfig {
  enabled: boolean
  decay_start_days: number
  decay_factor: number
  archive_threshold: number
  run_interval_minutes: number
  exempt_types: string[]
  origin_grace_multipliers: Record<string, number>
  outcome_weighting: { harm_penalty_max: number; help_bonus_max: number }
  hook_entries_exempt: boolean
}

export interface ConsolidationConfig {
  min_occurrences: number
  min_avg_confidence: number
}

export interface MemoryConfig {
  decay: DecayConfig
  consolidation: ConsolidationConfig
}

export interface DiscordConfig {
  enabled: boolean
  respond_to_dms: boolean
  respond_to_mentions: boolean
  allowed_guilds: string[]
  allowed_channels: string[]
}

export interface StopWordsConfig {
  retrieval: string[]
  dedup: string[]
}

export interface ArtifactClaudeMdConfig {
  max_lines: number
  min_confidence: number
  require_curation: boolean
  architecture_preamble: string
}

export interface ArtifactSkillsConfig {
  max_count: number
  max_lines_per_skill: number
  min_confidence: number
  require_curation: boolean
  staleness_sessions: number
}

export interface ArtifactHooksConfig {
  auto_convert: boolean
  learned_patterns_file: string
}

export interface ArtifactPriorOverlapConfig {
  common_patterns: string[]
}

export interface ArtifactGenerationConfig {
  claude_md: ArtifactClaudeMdConfig
  skills: ArtifactSkillsConfig
  hooks: ArtifactHooksConfig
  prior_overlap: ArtifactPriorOverlapConfig
}

export interface CurationConfig {
  queue_max_items: number
  auto_reject_after_days: number
  auto_reject_after_defers: number
  present_on_idle: boolean
}

export interface FeedbackConfig {
  min_sessions_for_impact: number
  auto_demote_threshold: number
  confidence_boost_threshold: number
  confidence_boost_amount: number
  regen_debounce_minutes: number
}

export interface HybridExtractionConfig {
  enabled: boolean
  llm_fallback_enabled: boolean
}

export type ExtractionStrategy = "heuristics-only" | "cloud" | "hybrid"

export interface ExtractionConsolidationConfig {
  enabled: boolean
  max_new_entries: number
  provider: string | null
  model: string | null
}

export interface ExtractionStrategyConfig {
  strategy: ExtractionStrategy
  cloud: {
    provider: string
    model: string
  }
  consolidation: ExtractionConsolidationConfig
  optimized_prompt: boolean
}

export interface BatchDedupConfig {
  enabled: boolean
  minEntries: number
  provider?: string
  model?: string
}

export interface PipelineConfig {
  retrieval: RetrievalConfig
  signal: SignalConfig
  dedup: DedupConfig
  extraction: ExtractionConfig
  context: ContextConfig
  homeostasis: HomeostasisConfig
  heartbeat: HeartbeatConfig
  memory: MemoryConfig
  discord: DiscordConfig
  stop_words: StopWordsConfig
  artifact_generation: ArtifactGenerationConfig
  curation: CurationConfig
  feedback: FeedbackConfig
  hybrid_extraction: HybridExtractionConfig
  extraction_strategy: ExtractionStrategyConfig
  batch_dedup: {
    enabled: boolean
    min_entries: number
    provider: string | null
    model: string | null
  }
}

// ---- Loader ----

let _configCache: PipelineConfig | null = null

export function loadConfig(configPath?: string): PipelineConfig {
  if (_configCache && !configPath) return _configCache

  const resolvedPath = configPath || path.join(__dirname, "config.yaml")
  const raw = readFileSync(resolvedPath, "utf-8")
  const config = parseYaml(raw) as PipelineConfig

  if (!configPath) _configCache = config
  return config
}

/**
 * Get a specific config section. Shorthand for loadConfig().section.
 */
export function getRetrievalConfig(): RetrievalConfig {
  return loadConfig().retrieval
}

export function getSignalConfig(): SignalConfig {
  return loadConfig().signal
}

export function getDedupConfig(): DedupConfig {
  return loadConfig().dedup
}

export function getExtractionConfig(): ExtractionConfig {
  return loadConfig().extraction
}

export function getContextConfig(): ContextConfig {
  return loadConfig().context
}

export function getHomeostasisConfig(): HomeostasisConfig {
  return loadConfig().homeostasis
}

export function getHeartbeatConfig(): HeartbeatConfig {
  return loadConfig().heartbeat
}

export function getDecayConfig(): DecayConfig {
  return loadConfig().memory.decay
}

export function getConsolidationConfig(): ConsolidationConfig {
  return loadConfig().memory.consolidation
}

export function getDiscordConfig(): DiscordConfig {
  return loadConfig().discord
}

export function getStopWords(list: "retrieval" | "dedup"): Set<string> {
  return new Set(loadConfig().stop_words[list])
}

export function getArtifactConfig(): ArtifactGenerationConfig {
  return loadConfig().artifact_generation
}

export function getCurationConfig(): CurationConfig {
  return loadConfig().curation
}

export function getFeedbackConfig(): FeedbackConfig {
  return loadConfig().feedback
}

let _hybridDeprecationWarned = false

export function getHybridExtractionConfig(): HybridExtractionConfig {
  if (!_hybridDeprecationWarned) {
    console.warn(
      "[config] DEPRECATED: hybrid_extraction config is deprecated. Use extraction_strategy instead. " +
        "See docs/research/2026-02-26-extraction-approach-evaluation.md",
    )
    _hybridDeprecationWarned = true
  }
  return loadConfig().hybrid_extraction
}

export function getExtractionStrategyConfig(): ExtractionStrategyConfig {
  const cfg = loadConfig()
  return (
    cfg.extraction_strategy ?? {
      strategy: "hybrid",
      cloud: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
      consolidation: {
        enabled: true,
        max_new_entries: 20,
        provider: null,
        model: null,
      },
      optimized_prompt: true,
    }
  )
}

export function getBatchDedupConfig(): BatchDedupConfig {
  const cfg = loadConfig()
  return {
    enabled: cfg.batch_dedup?.enabled ?? false,
    minEntries: cfg.batch_dedup?.min_entries ?? 5,
    provider: cfg.batch_dedup?.provider ?? undefined,
    model: cfg.batch_dedup?.model ?? undefined,
  }
}

/**
 * Reset config cache. Useful for tests that modify config.
 */
export function resetConfigCache(): void {
  _configCache = null
}
