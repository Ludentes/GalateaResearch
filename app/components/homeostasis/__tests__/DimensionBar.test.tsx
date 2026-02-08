import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DimensionBar } from "../DimensionBar"

describe("DimensionBar", () => {
  it("renders dimension label", () => {
    render(<DimensionBar label="Knowledge Sufficiency" state="HEALTHY" method="computed" />)
    expect(screen.getByText("Knowledge Sufficiency")).toBeInTheDocument()
  })

  it("shows LOW state with yellow indicator", () => {
    render(<DimensionBar label="Test Dimension" state="LOW" method="computed" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-yellow-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "16%" })
  })

  it("shows HEALTHY state with green indicator", () => {
    render(<DimensionBar label="Test Dimension" state="HEALTHY" method="computed" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-green-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "50%" })
  })

  it("shows HIGH state with blue indicator", () => {
    render(<DimensionBar label="Test Dimension" state="HIGH" method="llm" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-blue-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "83%" })
  })

  it("displays computed method badge", () => {
    render(<DimensionBar label="Test" state="HEALTHY" method="computed" />)
    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("displays LLM method badge", () => {
    render(<DimensionBar label="Test" state="HEALTHY" method="llm" />)
    expect(screen.getByText("LLM")).toBeInTheDocument()
  })
})
