import { defineEventHandler } from "h3"

/**
 * Extend the HTTP socket timeout to 6 minutes.
 *
 * The Claude Code SDK adapter can run for up to 5 minutes
 * (work-arc default 300s). Node.js HTTP server also defaults
 * to 300s requestTimeout, causing the socket to be torn down
 * just as the adapter finishes. Extending to 360s gives
 * sufficient headroom.
 */
export default defineEventHandler((event) => {
  // @ts-expect-error — access underlying Node.js socket via h3 internals
  const req = event._nodeReq ?? event.node?.req
  if (req?.socket) {
    req.socket.setTimeout(360_000)
  }
})
