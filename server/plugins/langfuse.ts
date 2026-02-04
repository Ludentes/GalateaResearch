export default () => {
  const hasConfig =
    process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY

  if (!hasConfig) return

  import("@opentelemetry/sdk-node").then(({ NodeSDK }) => {
    import("@langfuse/otel").then(({ LangfuseSpanProcessor }) => {
      const sdk = new NodeSDK({
        spanProcessors: [new LangfuseSpanProcessor()],
      })
      sdk.start()
      console.log(
        `[langfuse] Tracing enabled → ${process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"}`,
      )
    })
  })
}
