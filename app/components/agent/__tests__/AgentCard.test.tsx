import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AgentCard } from "../AgentCard"
import type { HomeostasisState } from "server/engine/types"

// Mock the Link component from @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router")
  return {
    ...actual,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }
})

const mockHomeostasis: HomeostasisState = {
  knowledge_sufficiency: "HEALTHY",
  certainty_alignment: "LOW",
  progress_momentum: "HEALTHY",
  communication_health: "HIGH",
  productive_engagement: "HEALTHY",
  knowledge_application: "HEALTHY",
  self_preservation: "HEALTHY",
  assessed_at: new Date(),
  assessment_method: {
    knowledge_sufficiency: "computed",
    certainty_alignment: "computed",
    progress_momentum: "computed",
    communication_health: "computed",
    productive_engagement: "computed",
    knowledge_application: "computed",
    self_preservation: "computed",
  },
}

describe("AgentCard", () => {
  it("renders agent information", () => {
    render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="healthy"
        lastTick="2026-03-14T10:00:00Z"
        homeostasis={null}
      />,
    )

    expect(screen.getByText("Test Agent")).toBeInTheDocument()
    expect(screen.getByText(/Developer/)).toBeInTheDocument()
    expect(screen.getByText(/testing/)).toBeInTheDocument()
    expect(screen.getByText(/healthy/)).toBeInTheDocument()
  })

  it("shows 'No activity yet' when lastTick is null", () => {
    render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="unknown"
        lastTick={null}
        homeostasis={null}
      />,
    )

    expect(screen.getByText("No activity yet")).toBeInTheDocument()
  })

  it("renders HomeostasisSparkline when homeostasis is provided", () => {
    render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="healthy"
        lastTick="2026-03-14T10:00:00Z"
        homeostasis={mockHomeostasis}
      />,
    )

    // Check that the sparkline is rendered by looking for the health count
    expect(screen.getByText("5/7 healthy")).toBeInTheDocument()
  })

  it("does not render HomeostasisSparkline when homeostasis is null", () => {
    render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="healthy"
        lastTick="2026-03-14T10:00:00Z"
        homeostasis={null}
      />,
    )

    // The sparkline should not be rendered
    expect(screen.queryByText("5/7 healthy")).not.toBeInTheDocument()
  })

  it("renders with correct health color indicator", () => {
    const { container } = render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="degraded"
        lastTick="2026-03-14T10:00:00Z"
        homeostasis={null}
      />,
    )

    // Check for red color indicator (degraded health)
    const indicator = container.querySelector(".bg-red-500")
    expect(indicator).toBeInTheDocument()
  })

  it("renders sparkline with compact mode and no labels", () => {
    render(
      <AgentCard
        id="agent-1"
        name="Test Agent"
        role="Developer"
        domain="testing"
        health="healthy"
        lastTick="2026-03-14T10:00:00Z"
        homeostasis={mockHomeostasis}
      />,
    )

    // The sparkline should be rendered with compact spacing
    // (no dimension labels visible)
    expect(screen.queryByText("KS")).not.toBeInTheDocument()
    expect(screen.queryByText("CA")).not.toBeInTheDocument()
    // But the health count should still be there
    expect(screen.getByText("5/7 healthy")).toBeInTheDocument()
  })
})
