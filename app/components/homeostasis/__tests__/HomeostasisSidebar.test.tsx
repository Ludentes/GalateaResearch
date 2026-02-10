import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HomeostasisSidebar } from "../HomeostasisSidebar"

// Mock the server function module
vi.mock("../../../../server/functions/homeostasis", () => ({
  getHomeostasisState: vi.fn(),
}))

// Import after mock
import { getHomeostasisState } from "../../../../server/functions/homeostasis"

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe("HomeostasisSidebar", () => {
  it("shows loading state initially", () => {
    vi.mocked(getHomeostasisState).mockReturnValue(
      new Promise(() => {}) // Never resolves
    )
    renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)
    expect(screen.getByText("Homeostasis State")).toBeInTheDocument()
    expect(screen.getAllByTestId("skeleton-bar")).toHaveLength(6)
  })

  it("displays all 6 dimensions when data loads", async () => {
    const mockState = {
      id: "state-1",
      sessionId: "test-session",
      messageId: "msg-1",
      dimensions: {
        knowledge_sufficiency: "HEALTHY" as const,
        certainty_alignment: "HIGH" as const,
        progress_momentum: "LOW" as const,
        communication_health: "HEALTHY" as const,
        productive_engagement: "HEALTHY" as const,
        knowledge_application: "LOW" as const,
      },
      assessmentMethod: {
        knowledge_sufficiency: "computed" as const,
        certainty_alignment: "llm" as const,
      },
      assessedAt: "2026-02-07T12:00:00.000Z",
    }

    vi.mocked(getHomeostasisState).mockResolvedValue(mockState)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)

    await waitFor(() => {
      expect(screen.getByText("Knowledge Sufficiency")).toBeInTheDocument()
    })

    expect(screen.getByText("Certainty Alignment")).toBeInTheDocument()
    expect(screen.getByText("Progress Momentum")).toBeInTheDocument()
    expect(screen.getByText("Communication Health")).toBeInTheDocument()
    expect(screen.getByText("Productive Engagement")).toBeInTheDocument()
    expect(screen.getByText("Knowledge Application")).toBeInTheDocument()
  })

  it("shows empty state when no assessment exists", async () => {
    vi.mocked(getHomeostasisState).mockResolvedValue(null)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)

    await waitFor(() => {
      expect(
        screen.getByText("No assessment yet. Send a message to begin.")
      ).toBeInTheDocument()
    })
  })

  it("shows error state with retry button", async () => {
    vi.mocked(getHomeostasisState).mockRejectedValue(
      new Error("Network error")
    )

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)

    await waitFor(() => {
      expect(
        screen.getByText("Unable to load homeostasis state")
      ).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("displays timestamp from assessment", async () => {
    const assessedAt = "2026-02-07T12:34:56.000Z"
    const mockState = {
      id: "state-1",
      sessionId: "test-session",
      messageId: "msg-1",
      dimensions: {
        knowledge_sufficiency: "HEALTHY" as const,
        certainty_alignment: "HEALTHY" as const,
        progress_momentum: "HEALTHY" as const,
        communication_health: "HEALTHY" as const,
        productive_engagement: "HEALTHY" as const,
        knowledge_application: "HEALTHY" as const,
      },
      assessmentMethod: {},
      assessedAt,
    }

    vi.mocked(getHomeostasisState).mockResolvedValue(mockState)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)

    // Compute expected time string the same way the component does
    const expectedTime = new Date(assessedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    await waitFor(() => {
      expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    })
    expect(screen.getByText(new RegExp(expectedTime))).toBeInTheDocument()
  })
})
