import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface FactResult {
  uuid: string
  name: string
  fact: string
  valid_at: string | null
  invalid_at: string | null
  created_at: string
  expired_at: string | null
}

interface EpisodeResult {
  uuid: string
  name: string
  group_id: string
  content: string
  source: string
  source_description: string
  created_at: string
  valid_at: string
  entity_edges: string[]
}

interface SessionInfo {
  id: string
  name: string
  createdAt: string
}

export const Route = createFileRoute("/memories/")({
  component: MemoriesPage,
})

function MemoriesPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState("")
  const [healthy, setHealthy] = useState<boolean | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [facts, setFacts] = useState<FactResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Episodes state
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)

  // Active tab
  const [tab, setTab] = useState<"search" | "episodes">("search")

  // Load sessions and health on mount
  useEffect(() => {
    fetch("/api/memories/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => {})

    fetch("/api/memories/health")
      .then((r) => r.json())
      .then((data) => setHealthy(data.healthy))
      .catch(() => setHealthy(false))
  }, [])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    try {
      const params = new URLSearchParams({
        query: searchQuery,
        max_facts: "30",
      })
      if (selectedSession) {
        params.set("group_ids", selectedSession)
      }
      const res = await fetch(`/api/memories/search?${params}`)
      const data = await res.json()
      setFacts(data.facts ?? [])
    } catch {
      setFacts([])
    } finally {
      setSearchLoading(false)
    }
  }

  const loadEpisodes = async (groupId: string) => {
    if (!groupId) {
      setEpisodes([])
      return
    }
    setEpisodesLoading(true)
    try {
      const params = new URLSearchParams({ group_id: groupId, last_n: "30" })
      const res = await fetch(`/api/memories/episodes?${params}`)
      const data = await res.json()
      setEpisodes(data.episodes ?? [])
    } catch {
      setEpisodes([])
    } finally {
      setEpisodesLoading(false)
    }
  }

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId)
    if (tab === "episodes") {
      loadEpisodes(sessionId)
    }
  }

  const handleTabChange = (newTab: "search" | "episodes") => {
    setTab(newTab)
    if (newTab === "episodes" && selectedSession) {
      loadEpisodes(selectedSession)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Home
          </Link>
          <h1 className="text-xl font-semibold">Memory Browser</h1>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              healthy === true
                ? "bg-green-500"
                : healthy === false
                  ? "bg-red-500"
                  : "bg-yellow-500"
            }`}
            title={
              healthy === true
                ? "Graphiti healthy"
                : healthy === false
                  ? "Graphiti unreachable"
                  : "Checking..."
            }
          />
        </div>
        <select
          value={selectedSession}
          onChange={(e) => handleSessionChange(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm min-w-[200px]"
        >
          <option value="">All sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => handleTabChange("search")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "search"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Fact Search
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("episodes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "episodes"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Episodes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {tab === "search" && (
            <SearchPanel
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onSearch={handleSearch}
              facts={facts}
              loading={searchLoading}
            />
          )}
          {tab === "episodes" && (
            <EpisodesPanel
              episodes={episodes}
              loading={episodesLoading}
              noSession={!selectedSession}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SearchPanel({
  query,
  onQueryChange,
  onSearch,
  facts,
  loading,
}: {
  query: string
  onQueryChange: (v: string) => void
  onSearch: () => void
  facts: FactResult[]
  loading: boolean
}) {
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSearch()
        }}
        className="flex gap-2"
      >
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search knowledge graph..."
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {facts.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Enter a query to search the knowledge graph.
        </p>
      )}

      {facts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {facts.length} fact{facts.length !== 1 ? "s" : ""} found
          </p>
          {facts.map((f) => (
            <FactCard key={f.uuid} fact={f} />
          ))}
        </div>
      )}
    </div>
  )
}

function EpisodesPanel({
  episodes,
  loading,
  noSession,
}: {
  episodes: EpisodeResult[]
  loading: boolean
  noSession: boolean
}) {
  if (noSession) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Select a session to view its episodes.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Loading episodes...
      </p>
    )
  }

  if (episodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No episodes found for this session.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
      </p>
      {episodes.map((ep) => (
        <EpisodeCard key={ep.uuid} episode={ep} />
      ))}
    </div>
  )
}

function FactCard({ fact }: { fact: FactResult }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{fact.name}</p>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDate(fact.created_at)}
        </span>
      </div>
      <p className="text-sm text-foreground">{fact.fact}</p>
      <div className="flex gap-2 text-xs text-muted-foreground">
        {fact.valid_at && <span>Valid: {formatDate(fact.valid_at)}</span>}
        {fact.invalid_at && <span>Invalid: {formatDate(fact.invalid_at)}</span>}
        {fact.expired_at && <span>Expired: {formatDate(fact.expired_at)}</span>}
      </div>
    </div>
  )
}

function EpisodeCard({ episode }: { episode: EpisodeResult }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = episode.content.length > 200

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{episode.name || "Episode"}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {episode.source}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(episode.created_at)}
          </span>
        </div>
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap">
        {isLong && !expanded
          ? `${episode.content.slice(0, 200)}...`
          : episode.content}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {episode.entity_edges.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {episode.entity_edges.length} linked edge
          {episode.entity_edges.length !== 1 ? "s" : ""}
        </p>
      )}
      {episode.source_description && (
        <p className="text-xs text-muted-foreground">
          {episode.source_description}
        </p>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
