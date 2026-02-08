import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ActivityLevelBadge } from "../ActivityLevelBadge"

describe("ActivityLevelBadge", () => {
  it("renders Level 0 with gray styling", () => {
    render(<ActivityLevelBadge level={0} />)
    const badge = screen.getByText("L0")
    expect(badge).toHaveClass("bg-gray-100", "text-gray-700")
  })

  it("renders Level 1 with blue styling", () => {
    render(<ActivityLevelBadge level={1} />)
    const badge = screen.getByText("L1")
    expect(badge).toHaveClass("bg-blue-100", "text-blue-700")
  })

  it("renders Level 2 with purple styling", () => {
    render(<ActivityLevelBadge level={2} model="Sonnet" />)
    const badge = screen.getByText("L2")
    expect(badge).toHaveClass("bg-purple-100", "text-purple-700")
  })

  it("renders Level 3 with orange styling and Reflexion label", () => {
    render(<ActivityLevelBadge level={3} model="Sonnet" />)
    const badge = screen.getByText("L3 + Reflexion")
    expect(badge).toHaveClass("bg-orange-100", "text-orange-700")
  })

  it("shows tooltip with model name on hover", async () => {
    render(<ActivityLevelBadge level={2} model="Sonnet" />)
    const badge = screen.getByText("L2")
    expect(badge).toHaveAttribute("title")
    expect(badge.getAttribute("title")).toContain("Sonnet")
  })

  it("shows tooltip without model when model not provided", () => {
    render(<ActivityLevelBadge level={1} />)
    const badge = screen.getByText("L1")
    expect(badge.getAttribute("title")).not.toContain("undefined")
  })

  it("returns null for undefined level", () => {
    const { container } = render(<ActivityLevelBadge level={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })
})
