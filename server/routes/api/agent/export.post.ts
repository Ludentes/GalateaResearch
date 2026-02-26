import { defineEventHandler } from "h3"
import { generateAllArtifacts } from "../../../memory/artifact-generator"

export default defineEventHandler(async () => {
  const storePath = "data/memory/entries.jsonl"
  const outputDir = ".claude"

  const result = await generateAllArtifacts(storePath, outputDir)

  return {
    ok: true,
    claudeMd: {
      written: result.claudeMd.written,
      lines: result.claudeMd.lines,
      entryCount: result.claudeMd.entryCount,
    },
    skills: {
      count: result.skills.count,
      files: result.skills.files,
    },
    hooks: {
      written: result.hooks.written,
      count: result.hooks.count,
    },
  }
})
