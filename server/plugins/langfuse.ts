import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeSDK } from "@opentelemetry/sdk-node"

const hasLangfuseConfig =
  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY

if (hasLangfuseConfig) {
  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  })
  sdk.start()
  console.log(
    `[langfuse] Tracing enabled → ${process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"}`,
  )
}
