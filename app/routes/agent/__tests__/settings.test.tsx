import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: {
      retrieval: { max_entries: 20 },
      homeostasis: { thresholds: {} },
      extraction_strategy: { strategy: "heuristics-only" },
    },
    isLoading: false,
    error: null,
  })),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn((path) => vi.fn(() => ({ component: vi.fn() }))),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}))

import { SettingsPage } from "../settings"

describe("SettingsPage", () => {
  it("should render settings page with title", () => {
    render(<SettingsPage />)
    expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument()
  })

  it("should render settings groups", () => {
    render(<SettingsPage />)
    expect(screen.getByText(/Retrieval/i)).toBeInTheDocument()
    expect(screen.getByText(/Homeostasis/i)).toBeInTheDocument()
  })
})
