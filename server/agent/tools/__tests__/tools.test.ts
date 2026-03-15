// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createAllTools,
  createBashTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
} from "../index"

let tmpDir: string

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "agent-tools-"))
  await writeFile(
    path.join(tmpDir, "hello.txt"),
    "line one\nline two\nline three",
  )
  await writeFile(path.join(tmpDir, "data.json"), '{"key": "value"}')
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe("read_file", () => {
  it("reads file with line numbers", async () => {
    const tool = createReadFileTool(tmpDir)
    const result = await tool.execute({ path: "hello.txt" })
    expect(result).toContain("1\tline one")
    expect(result).toContain("2\tline two")
    expect(result).toContain("3\tline three")
  })

  it("returns error for missing file", async () => {
    const tool = createReadFileTool(tmpDir)
    const result = await tool.execute({ path: "nope.txt" })
    expect(result).toContain("Error reading file")
  })

  it("blocks path traversal", async () => {
    const tool = createReadFileTool(tmpDir)
    const result = await tool.execute({ path: "../../etc/passwd" })
    expect(result).toContain("outside workspace boundary")
  })
})

describe("list_files", () => {
  it("lists directory contents", async () => {
    const tool = createListFilesTool(tmpDir)
    const result = await tool.execute({ path: "." })
    expect(result).toContain("hello.txt")
    expect(result).toContain("data.json")
  })

  it("blocks path traversal", async () => {
    const tool = createListFilesTool(tmpDir)
    const result = await tool.execute({ path: "../../" })
    expect(result).toContain("outside workspace boundary")
  })
})

describe("write_file", () => {
  it("creates a new file", async () => {
    const tool = createWriteFileTool(tmpDir)
    const result = await tool.execute({
      path: "new.txt",
      content: "hello world",
    })
    expect(result).toContain("File written")

    const readTool = createReadFileTool(tmpDir)
    const content = await readTool.execute({ path: "new.txt" })
    expect(content).toContain("hello world")
  })

  it("creates nested directories", async () => {
    const tool = createWriteFileTool(tmpDir)
    const result = await tool.execute({
      path: "sub/dir/file.txt",
      content: "nested",
    })
    expect(result).toContain("File written")
  })

  it("blocks path traversal", async () => {
    const tool = createWriteFileTool(tmpDir)
    const result = await tool.execute({
      path: "../../evil.txt",
      content: "nope",
    })
    expect(result).toContain("outside workspace boundary")
  })
})

describe("bash", () => {
  it("runs simple commands", async () => {
    const tool = createBashTool(tmpDir)
    const result = await tool.execute({ command: "echo hello" })
    expect(result).toContain("hello")
  })

  it("runs in workspace directory", async () => {
    const tool = createBashTool(tmpDir)
    const result = await tool.execute({ command: "ls" })
    expect(result).toContain("hello.txt")
  })

  it("blocks destructive commands", async () => {
    const tool = createBashTool(tmpDir)
    const result = await tool.execute({ command: "rm -rf /" })
    expect(result).toContain("blocked by safety policy")
  })

  it("blocks sudo", async () => {
    const tool = createBashTool(tmpDir)
    const result = await tool.execute({ command: "sudo apt install foo" })
    expect(result).toContain("blocked by safety policy")
  })

  it("returns stderr on failure", async () => {
    const tool = createBashTool(tmpDir)
    const result = await tool.execute({ command: "ls /nonexistent_dir_xyz" })
    expect(result).toContain("No such file or directory")
  })
})

describe("createAllTools", () => {
  it("returns all 4 tools", () => {
    const tools = createAllTools(tmpDir)
    expect(Object.keys(tools)).toEqual([
      "read_file",
      "list_files",
      "write_file",
      "bash",
    ])
  })
})
