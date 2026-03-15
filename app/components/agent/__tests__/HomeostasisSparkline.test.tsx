import { render, screen } from "@testing-library/react"
import type { HomeostasisState } from "server/engine/types"
import { describe, expect, it } from "vitest"
import { HomeostasisSparkline } from "../HomeostasisSparkline"

describe("HomeostasisSparkline", () => {
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

  it("renders 7 horizontal bars for all dimensions", () => {
    render(<HomeostasisSparkline homeostasis={mockHomeostasis} />)

    expect(screen.getByText("KS")).toBeInTheDocument()
    expect(screen.getByText("CA")).toBeInTheDocument()
    expect(screen.getByText("PM")).toBeInTheDocument()
    expect(screen.getByText("CH")).toBeInTheDocument()
    expect(screen.getByText("PE")).toBeInTheDocument()
    expect(screen.getByText("KA")).toBeInTheDocument()
    expect(screen.getByText("SP")).toBeInTheDocument()
  })

  it("displays correct health count", () => {
    render(<HomeostasisSparkline homeostasis={mockHomeostasis} />)

    // 5 HEALTHY, 1 LOW, 1 HIGH = 5/7
    expect(screen.getByText("5/7 healthy")).toBeInTheDocument()
  })

  it("renders with correct tooltips", () => {
    render(<HomeostasisSparkline homeostasis={mockHomeostasis} />)

    const ksElement = screen.getByText("KS").closest("div")
    expect(ksElement).toHaveAttribute("title", "KS: HEALTHY")
  })

  it("hides labels when showLabels is false", () => {
    render(
      <HomeostasisSparkline homeostasis={mockHomeostasis} showLabels={false} />,
    )

    expect(screen.queryByText("KS")).not.toBeInTheDocument()
    expect(screen.queryByText("CA")).not.toBeInTheDocument()
    expect(screen.getByText("5/7 healthy")).toBeInTheDocument()
  })

  it("applies compact styling when compact is true", () => {
    const { container } = render(
      <HomeostasisSparkline homeostasis={mockHomeostasis} compact />,
    )

    const rootDiv = container.firstChild as HTMLElement
    expect(rootDiv?.className).toContain("space-y-1")
  })

  it("applies normal styling when compact is false", () => {
    const { container } = render(
      <HomeostasisSparkline homeostasis={mockHomeostasis} compact={false} />,
    )

    const rootDiv = container.firstChild as HTMLElement
    expect(rootDiv?.className).toContain("space-y-1.5")
  })

  it("handles all dimension states correctly", () => {
    const healthyState: HomeostasisState = {
      knowledge_sufficiency: "HEALTHY",
      certainty_alignment: "HEALTHY",
      progress_momentum: "HEALTHY",
      communication_health: "HEALTHY",
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

    render(<HomeostasisSparkline homeostasis={healthyState} />)
    expect(screen.getByText("7/7 healthy")).toBeInTheDocument()
  })

  it("handles all low state correctly", () => {
    const lowState: HomeostasisState = {
      knowledge_sufficiency: "LOW",
      certainty_alignment: "LOW",
      progress_momentum: "LOW",
      communication_health: "LOW",
      productive_engagement: "LOW",
      knowledge_application: "LOW",
      self_preservation: "LOW",
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

    render(<HomeostasisSparkline homeostasis={lowState} />)
    expect(screen.getByText("0/7 healthy")).toBeInTheDocument()
  })
})
