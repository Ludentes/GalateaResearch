import { execFile } from "node:child_process"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import type { AgentTool } from "../agent-loop"

const execFileAsync = promisify(execFile)

const MAX_OUTPUT = 4000

function truncate(text: string, max = MAX_OUTPUT): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n... (truncated, ${text.length} chars total)`
}

export function createReadFileTool(workspaceRoot: string): AgentTool {
  return {
    description:
      "Read a file from the workspace. Returns file contents with line numbers.",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace root"),
    }),
    async execute(args) {
      const filePath = path.resolve(workspaceRoot, args.path as string)
      if (!filePath.startsWith(path.resolve(workspaceRoot))) {
        return "Error: path is outside workspace boundary"
      }
      try {
        const content = await readFile(filePath, "utf-8")
        const lines = content.split("\n")
        const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join("\n")
        return truncate(numbered)
      } catch (err) {
        return `Error reading file: ${(err as Error).message}`
      }
    },
  }
}

export function createListFilesTool(workspaceRoot: string): AgentTool {
  return {
    description: "List files and directories in a workspace directory.",
    parameters: z.object({
      path: z
        .string()
        .default(".")
        .describe("Directory path relative to workspace root"),
    }),
    async execute(args) {
      const dirPath = path.resolve(workspaceRoot, (args.path as string) || ".")
      if (!dirPath.startsWith(path.resolve(workspaceRoot))) {
        return "Error: path is outside workspace boundary"
      }
      try {
        const entries = await readdir(dirPath, { withFileTypes: true })
        const lines = entries.map((e) =>
          e.isDirectory() ? `${e.name}/` : e.name,
        )
        return lines.join("\n") || "(empty directory)"
      } catch (err) {
        return `Error listing directory: ${(err as Error).message}`
      }
    },
  }
}

export function createWriteFileTool(workspaceRoot: string): AgentTool {
  return {
    description:
      "Write content to a file in the workspace. Creates parent directories if needed.",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace root"),
      content: z.string().describe("Content to write to the file"),
    }),
    async execute(args) {
      const filePath = path.resolve(workspaceRoot, args.path as string)
      if (!filePath.startsWith(path.resolve(workspaceRoot))) {
        return "Error: path is outside workspace boundary"
      }
      try {
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, args.content as string, "utf-8")
        return `File written: ${args.path}`
      } catch (err) {
        return `Error writing file: ${(err as Error).message}`
      }
    },
  }
}

export function createBashTool(workspaceRoot: string): AgentTool {
  return {
    description:
      "Run a shell command in the workspace directory. Use for git, npm/pnpm, testing, etc. Commands run with a 30s timeout.",
    parameters: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    async execute(args) {
      const command = args.command as string

      // Block destructive patterns
      const blocked = [
        /rm\s+-rf\s+[/~]/,
        /git\s+push\s+.*--force/,
        /git\s+reset\s+--hard/,
        /sudo\s+/,
        /chmod\s+777/,
        /:\s*>\s*\//,
      ]
      for (const pattern of blocked) {
        if (pattern.test(command)) {
          return `Error: command blocked by safety policy`
        }
      }

      try {
        const { stdout, stderr } = await execFileAsync(
          "bash",
          ["-c", command],
          {
            cwd: workspaceRoot,
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            env: { ...process.env, HOME: process.env.HOME },
          },
        )
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")
        return truncate(output) || "(no output)"
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message: string }
        const output =
          (e.stdout || "") + (e.stderr ? `\nSTDERR:\n${e.stderr}` : "")
        return truncate(output || `Error: ${e.message}`)
      }
    },
  }
}

export function createAllTools(
  workspaceRoot: string,
): Record<string, AgentTool> {
  return {
    read_file: createReadFileTool(workspaceRoot),
    list_files: createListFilesTool(workspaceRoot),
    write_file: createWriteFileTool(workspaceRoot),
    bash: createBashTool(workspaceRoot),
  }
}
