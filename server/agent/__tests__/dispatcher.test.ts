// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { dispatch, registerHandler, clearHandlers } from "../dispatcher"

describe("Response Dispatcher", () => {
  afterEach(() => {
    clearHandlers()
  })

  it("routes response to registered handler", async () => {
    const sendFn = vi.fn()
    registerHandler("test-channel", { send: sendFn })

    await dispatch(
      { channel: "test-channel", to: "user1" },
      "Hello!",
      { someKey: "someValue" },
    )

    expect(sendFn).toHaveBeenCalledWith(
      { channel: "test-channel", to: "user1" },
      "Hello!",
      { someKey: "someValue" },
    )
  })

  it("throws for unregistered channel", async () => {
    await expect(
      dispatch({ channel: "unknown" }, "Hello!"),
    ).rejects.toThrow("No handler registered for channel: unknown")
  })

  it("allows overriding a handler", async () => {
    const first = vi.fn()
    const second = vi.fn()
    registerHandler("ch", { send: first })
    registerHandler("ch", { send: second })

    await dispatch({ channel: "ch" }, "test")
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})
