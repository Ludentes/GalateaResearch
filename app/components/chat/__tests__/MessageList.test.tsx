import { describe, it, expect, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import { MessageList } from "../MessageList"

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

describe("MessageList", () => {
  it("displays activity level badge on assistant messages", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
        activityLevel: 2 as const,
        model: "Sonnet",
      },
    ]

    render(<MessageList messages={messages} />)
    expect(screen.getByText("L2")).toBeInTheDocument()
  })

  it("does not show activity badge on user messages", () => {
    const messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
      },
    ]

    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/L\d/)).not.toBeInTheDocument()
  })

  it("gracefully handles missing activityLevel", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
        model: "Sonnet",
      },
    ]

    render(<MessageList messages={messages} />)
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })
})
