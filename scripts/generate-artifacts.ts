import { generateAllArtifacts } from "../server/memory/artifact-generator"
import { readFileSync } from "node:fs"
import path from "node:path"

async function main() {
  const storePath = process.argv[2] || "data/memory/entries.jsonl"
  const outputDir = process.argv[3] || "data/memory/.claude"

  console.log(`Store: ${storePath}`)
  console.log(`Output: ${outputDir}`)
  console.log()

  const result = await generateAllArtifacts(storePath, outputDir)

  console.log("=== Results ===")
  console.log(`CLAUDE.md: ${result.claudeMd.entryCount} entries, ${result.claudeMd.lines} lines`)
  console.log(`Skills: ${result.skills.count} files`)
  console.log(`Hooks: written=${result.hooks.written}, count=${result.hooks.count}`)
  console.log(`Skipped: ${result.skipped.count}`)
  console.log()

  if (result.claudeMd.tracedEntries.length > 0) {
    console.log("=== CLAUDE.md traced entries ===")
    for (const e of result.claudeMd.tracedEntries) {
      const genDecision = e.decisions?.find((d) => d.stage === "claude-md-gen")
      console.log(`  [${e.type}] ${e.content.slice(0, 80)} (${genDecision ? "traced" : "NOT traced"})`)
    }
    console.log()
  }

  // Show the generated CLAUDE.md
  const claudeMdPath = path.join(outputDir, "CLAUDE.md")
  try {
    const md = readFileSync(claudeMdPath, "utf-8")
    console.log("=== Generated CLAUDE.md ===")
    console.log(md)
  } catch {
    console.log("CLAUDE.md not generated")
  }
}

main().catch(console.error)
