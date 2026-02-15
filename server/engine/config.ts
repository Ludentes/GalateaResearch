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
}

export interface MemoryConfig {
  decay: DecayConfig
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

export function getDiscordConfig(): DiscordConfig {
  return loadConfig().discord
}

export function getStopWords(list: "retrieval" | "dedup"): Set<string> {
  return new Set(loadConfig().stop_words[list])
}

/**
 * Reset config cache. Useful for tests that modify config.
 */
export function resetConfigCache(): void {
  _configCache = null
}
