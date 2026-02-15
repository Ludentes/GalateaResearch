// @vitest-environment node
import type { LanguageModel } from "ai"
import { asc, desc, eq } from "drizzle-orm"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { messages, preprompts, sessions } from "../../../db/schema"
import { assembleContext } from "../../../memory/context-assembler"
import { runExtraction } from "../../../memory/extraction-pipeline"
import {
  getExtractionState,
  type ExtractionState,
} from "../../../memory/extraction-state"
import { appendEntries, readEntries } from "../../../memory/knowledge-store"
import { filterSignalTurns } from "../../../memory/signal-classifier"
import { readTranscript } from "../../../memory/transcript-reader"
import type {
  AssembledContext,
  ExtractionResult,
  KnowledgeEntry,
  TranscriptTurn,
} from "../../../memory/types"
import { updateAgentState } from "../../../agent/agent-state"
import { tick as agentTick } from "../../../agent/tick"
import type {
  AgentState,
  PendingMessage,
  TickResult,
} from "../../../agent/types"
import {
  cleanupTestPreprompts,
  cleanupTestSession,
  cleanupTempFiles,
  getTestDb,
} from "./setup"

// ---- Types ----

interface PrepromptSeed {
  identity?: string
  constraints?: string[]
}

export interface TestWorld {
  sessionId: string

  // Layer 1: Chat
  sendMessage(content: string): Promise<void>
  roundTrip(
    content: string,
  ): Promise<{ text: string; tokenCount: number }>
  lastMessage(role: "user" | "assistant"): Promise<MessageRow>
  getHistory(): Promise<MessageRow[]>
  assembleContext(): Promise<AssembledContext>

  // Layer 2: Extraction
  readTranscript(): Promise<TranscriptTurn[]>
  classifySignal(turns: TranscriptTurn[]): Promise<TranscriptTurn[]>
  extract(opts?: { force?: boolean }): Promise<ExtractionResult>
  extractOnce(): Promise<ExtractionResult>
  extractAgain(): Promise<ExtractionResult>
  getExtractionState(): Promise<ExtractionState>

  // Layer 3: Tick
  tick(trigger: "manual" | "heartbeat"): Promise<TickResult>

  // Cleanup
  teardown(): Promise<void>
}

interface MessageRow {
  id: string
  sessionId: string
  role: string
  content: string
  model: string | null
  tokenCount: number | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: Date
}

// ---- Scenario Builder ----

interface ScenarioConfig {
  name: string
  project?: string
  prepromptSeed?: PrepromptSeed
  knowledgeEntries?: KnowledgeEntry[]
  knowledgeFromPath?: string
  emptyKnowledgeStore?: boolean
  transcriptPath?: string
  model?: LanguageModel
  agentState?: Partial<AgentState>
  pendingMessages?: PendingMessage[]
  noPendingMessages?: boolean
}

class ScenarioBuilder {
  private config: ScenarioConfig

  constructor(name: string) {
    this.config = { name }
  }

  withSession(project: string): this {
    this.config.project = project
    return this
  }

  withPreprompts(seed: PrepromptSeed): this {
    this.config.prepromptSeed = seed
    return this
  }

  withKnowledge(entries: KnowledgeEntry[]): this {
    this.config.knowledgeEntries = entries
    return this
  }

  withKnowledgeFrom(jsonlPath: string): this {
    this.config.knowledgeFromPath = jsonlPath
    return this
  }

  withEmptyKnowledgeStore(): this {
    this.config.emptyKnowledgeStore = true
    return this
  }

  withTranscript(transcriptPath: string): this {
    this.config.transcriptPath = transcriptPath
    return this
  }

  withModel(model: LanguageModel): this {
    this.config.model = model
    return this
  }

  withAgentState(state: Partial<AgentState>): this {
    this.config.agentState = state
    return this
  }

  withPendingMessage(msg: PendingMessage): this {
    if (!this.config.pendingMessages) this.config.pendingMessages = []
    this.config.pendingMessages.push(msg)
    return this
  }

  withNoPendingMessages(): this {
    this.config.noPendingMessages = true
    return this
  }

  async seed(): Promise<TestWorld> {
    const db = getTestDb()
    const tempFiles: string[] = []
    const prepromptIds: string[] = []

    // 1. Create test session
    const [session] = await db
      .insert(sessions)
      .values({ name: `test:${this.config.name}` })
      .returning()

    // 2. Insert preprompts if provided
    if (this.config.prepromptSeed) {
      const { identity, constraints } = this.config.prepromptSeed
      if (identity) {
        const [p] = await db
          .insert(preprompts)
          .values({
            name: `test-identity-${session.id}`,
            type: "core",
            content: identity,
            active: true,
          })
          .returning()
        prepromptIds.push(p.id)
      }
      if (constraints) {
        for (const constraint of constraints) {
          const [p] = await db
            .insert(preprompts)
            .values({
              name: `test-constraint-${session.id}-${prepromptIds.length}`,
              type: "hard_rule",
              content: constraint,
              active: true,
            })
            .returning()
          prepromptIds.push(p.id)
        }
      }
    }

    // 3. Set up knowledge store
    const testDir = path.join(
      "data",
      "test",
      `scenario-${session.id.slice(0, 8)}`,
    )
    await mkdir(testDir, { recursive: true })
    tempFiles.push(testDir)

    const storePath = path.join(testDir, "entries.jsonl")
    const statePath = path.join(testDir, "extraction-state.json")

    if (this.config.knowledgeFromPath) {
      const entries = await readEntries(this.config.knowledgeFromPath)
      if (entries.length > 0) {
        await appendEntries(entries, storePath)
      }
    } else if (
      this.config.knowledgeEntries &&
      this.config.knowledgeEntries.length > 0
    ) {
      await appendEntries(this.config.knowledgeEntries, storePath)
    } else if (this.config.emptyKnowledgeStore) {
      await writeFile(storePath, "")
    }

    // 4. Set up agent state
    const agentStatePath = path.join(testDir, "agent-state.json")
    const agentState: AgentState = {
      lastActivity: new Date().toISOString(),
      pendingMessages: [],
      ...this.config.agentState,
    }
    if (this.config.pendingMessages) {
      agentState.pendingMessages = this.config.pendingMessages
    }
    if (this.config.noPendingMessages) {
      agentState.pendingMessages = []
    }
    await updateAgentState(agentState, agentStatePath)

    // 5. Build and return TestWorld
    const transcriptPath =
      this.config.transcriptPath ||
      path.join(
        "server",
        "memory",
        "__tests__",
        "fixtures",
        "sample-session.jsonl",
      )
    const model = this.config.model

    return createTestWorld({
      sessionId: session.id,
      storePath,
      statePath,
      agentStatePath,
      transcriptPath,
      model,
      tempFiles,
      prepromptIds,
    })
  }
}

export function scenario(name: string): ScenarioBuilder {
  return new ScenarioBuilder(name)
}

// ---- TestWorld Implementation ----

interface TestWorldConfig {
  sessionId: string
  storePath: string
  statePath: string
  agentStatePath: string
  transcriptPath: string
  model?: LanguageModel
  tempFiles: string[]
  prepromptIds: string[]
}

function createTestWorld(config: TestWorldConfig): TestWorld {
  const {
    sessionId,
    storePath,
    statePath,
    agentStatePath,
    transcriptPath,
    model,
    tempFiles,
    prepromptIds,
  } = config
  const db = getTestDb()

  let extractedOnce = false

  return {
    sessionId,

    // Layer 1: Chat

    async sendMessage(content: string): Promise<void> {
      await db.insert(messages).values({
        sessionId,
        role: "user",
        content,
      })
    },

    async roundTrip(
      content: string,
    ): Promise<{ text: string; tokenCount: number }> {
      if (!model) throw new Error("No model configured. Use withModel().")

      // Import dynamically to avoid circular deps with db singleton
      const { sendMessageLogic } = await import(
        "../../../functions/chat.logic"
      )
      const result = await sendMessageLogic(
        sessionId,
        content,
        model,
        "test-model",
      )
      const lastMsg = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(1)

      return {
        text: result.text,
        tokenCount: lastMsg[0]?.tokenCount ?? 0,
      }
    },

    async lastMessage(role: "user" | "assistant"): Promise<MessageRow> {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))

      const msg = rows.find((r) => r.role === role)
      if (!msg) throw new Error(`No ${role} message found in session`)
      return msg as MessageRow
    },

    async getHistory(): Promise<MessageRow[]> {
      return (await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt))) as MessageRow[]
    },

    async assembleContext(): Promise<AssembledContext> {
      const history = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt))

      const lastUserMsg = [...history]
        .reverse()
        .find((m) => m.role === "user")

      return assembleContext({
        storePath,
        agentContext: {
          sessionId,
          currentMessage: lastUserMsg?.content ?? "",
          messageHistory: history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          retrievedFacts: [],
        },
      })
    },

    // Layer 2: Extraction

    async readTranscript(): Promise<TranscriptTurn[]> {
      return readTranscript(transcriptPath)
    },

    async classifySignal(turns: TranscriptTurn[]): Promise<TranscriptTurn[]> {
      return filterSignalTurns(turns)
    },

    async extract(opts?: { force?: boolean }): Promise<ExtractionResult> {
      if (!model) throw new Error("No model configured. Use withModel().")
      const result = await runExtraction({
        transcriptPath,
        model,
        storePath,
        force: opts?.force ?? false,
      })
      extractedOnce = true
      return result
    },

    async extractOnce(): Promise<ExtractionResult> {
      if (extractedOnce)
        throw new Error("extractOnce() already called. Use extractAgain().")
      return this.extract()
    },

    async extractAgain(): Promise<ExtractionResult> {
      return this.extract()
    },

    async getExtractionState(): Promise<ExtractionState> {
      return getExtractionState(statePath)
    },

    // Layer 3: Tick

    async tick(trigger: "manual" | "heartbeat"): Promise<TickResult> {
      return agentTick(trigger, {
        statePath: agentStatePath,
        storePath,
      })
    },

    // Cleanup

    async teardown(): Promise<void> {
      await cleanupTestSession(sessionId)
      await cleanupTestPreprompts(prepromptIds)
      cleanupTempFiles(tempFiles)
    },
  }
}
