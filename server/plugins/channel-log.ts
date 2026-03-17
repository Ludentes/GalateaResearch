import { registerLogHandlers } from "../agent/channel-log"

export default () => {
  registerLogHandlers()
  console.log("[channel-log] Fallback log handlers registered")
}
