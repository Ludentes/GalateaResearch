/**
 * gen-artifacts.ts
 * Generate CLAUDE.md and subagent artifacts from a knowledge store.
 *
 * Usage:
 *   pnpm tsx scripts/gen-artifacts.ts [--store <path>] [--output <dir>]
 */
import { config } from "dotenv"

config({ override: true })

import { parseArgs } from "node:util"
import {
  generateClaudeMd,
  generateSkillFiles,
} from "../server/memory/artifact-generator"

const { values } = parseArgs({
  options: {
    store: { type: "string", default: "data/memory/entries.jsonl" },
    output: { type: "string", default: "data/artifacts" },
  },
})

async function main() {
  const storePath = values.store!
  const outputDir = values.output!

  console.log(`Store: ${storePath}`)
  console.log(`Output: ${outputDir}\n`)

  await generateClaudeMd({ storePath, outputDir })
  console.log(`Generated: ${outputDir}/CLAUDE.md`)

  const skills = await generateSkillFiles({ storePath, outputDir })
  if (skills.length > 0) {
    console.log(`\nSkill files (${skills.length}):`)
    for (const s of skills) console.log(`  skills/${s.filename} — ${s.title}`)
  } else {
    console.log("No skill files generated")
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
