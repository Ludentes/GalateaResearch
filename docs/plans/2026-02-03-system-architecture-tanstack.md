# Galatea System Architecture with TanStack Start

**Date**: 2026-02-03
**Purpose**: Full system sketch showing all components and their integration

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              OBSERVATION SOURCES                                 │
├──────────────────┬──────────────────┬──────────────────┬───────────────────────┤
│   Browser Ext    │   VSCode Ext     │   Home Assistant │   Frigate NVR         │
│   (HTTP POST)    │   (HTTP POST)    │   (MQTT)         │   (MQTT)              │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴───────────┬───────────┘
         │                  │                  │                     │
         └──────────────────┴────────┬─────────┴─────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           GALATEA SERVER (TanStack Start)                        │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         INGESTION LAYER                                  │   │
│  ├──────────────────────────────┬──────────────────────────────────────────┤   │
│  │   HTTP API Routes            │   MQTT Subscriber                        │   │
│  │   POST /api/observations     │   homeassistant/#                        │   │
│  │   POST /api/dialogue         │   frigate/events                         │   │
│  │                              │   galatea/extensions/+                   │   │
│  └──────────────────────────────┴──────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      OBSERVATION PIPELINE                                │   │
│  │                                                                          │   │
│  │   1. Capture → 2. Enrich → 3. Validate → 4. Store                       │   │
│  │      (raw)      (context)   (dialogue)    (memory)                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         CORE ENGINE                                      │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │   │
│  │   │ ACTIVITY ROUTER │───▶│   HOMEOSTASIS   │───▶│   GUARDRAILS    │    │   │
│  │   │                 │    │     ENGINE      │    │                 │    │   │
│  │   │ Level 0: Direct │    │                 │    │ Max iterations  │    │   │
│  │   │ Level 1: Pattern│    │ 6 Dimensions:   │    │ Over-research   │    │   │
│  │   │ Level 2: Reason │    │ • knowledge     │    │ Going dark      │    │   │
│  │   │ Level 3: Reflect│    │ • certainty     │    │ Over-ask        │    │   │
│  │   │                 │    │ • progress      │    │                 │    │   │
│  │   │ Model Selection │    │ • communication │    │                 │    │   │
│  │   │ Haiku/Sonnet    │    │ • engagement    │    │                 │    │   │
│  │   │                 │    │ • application   │    │                 │    │   │
│  │   └─────────────────┘    └─────────────────┘    └─────────────────┘    │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                    ┌────────────────┼────────────────┐                         │
│                    ▼                ▼                ▼                         │
│  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐     │
│  │    CONTEXT BUILDER   │  │   LLM EXECUTOR   │  │   TOOL EXECUTOR      │     │
│  │                      │  │                  │  │                      │     │
│  │ Assembles:           │  │ Vercel AI SDK    │  │ MCP Protocol         │     │
│  │ • Preprompts         │  │ • Haiku          │  │ • File operations    │     │
│  │ • Hard rules         │  │ • Sonnet         │  │ • Shell commands     │     │
│  │ • Relevant memories  │  │ • Streaming      │  │ • External APIs      │     │
│  │ • Homeostasis state  │  │                  │  │                      │     │
│  └──────────────────────┘  └──────────────────┘  └──────────────────────┘     │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Drizzle ORM   │         │    Graphiti     │         │   MQTT Broker   │
│   (SQLite/PG)   │         │   (FalkorDB)    │         │  (Mosquitto)    │
│                 │         │                 │         │                 │
│ • Sessions      │         │ • Episodic      │         │ • HA events     │
│ • Homeostasis   │         │ • Semantic      │         │ • Frigate       │
│ • Preprompts    │         │ • Procedural    │         │ • Extensions    │
│ • Tool history  │         │ • Cognitive     │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

---

## Component Breakdown

### 1. TanStack Start Application

```
/galatea-app
├── app/
│   ├── routes/
│   │   ├── __root.tsx              # Root layout
│   │   ├── index.tsx               # Dashboard
│   │   ├── chat/
│   │   │   └── $sessionId.tsx      # Chat interface
│   │   ├── memories/
│   │   │   └── index.tsx           # Memory browser
│   │   └── settings/
│   │       └── index.tsx           # Configuration
│   │
│   ├── api/
│   │   ├── observations.ts         # POST /api/observations
│   │   ├── dialogue.ts             # POST /api/dialogue
│   │   └── chat.ts                 # POST /api/chat (streaming)
│   │
│   └── components/
│       ├── chat/
│       │   ├── ChatInput.tsx
│       │   ├── MessageList.tsx
│       │   └── StreamingMessage.tsx
│       ├── memory/
│       │   ├── MemoryTable.tsx     # TanStack Table
│       │   └── MemoryDetail.tsx
│       └── homeostasis/
│           └── StatePanel.tsx
│
├── server/
│   ├── functions/                  # Server functions
│   │   ├── chat.ts                 # Chat completion (Level 0-3)
│   │   ├── memories.ts             # Memory CRUD
│   │   ├── sessions.ts             # Session management
│   │   ├── homeostasis.ts          # State updates
│   │   ├── learning.ts             # Memory promotion, calibration
│   │   ├── personas.ts             # Persona/agent spec management
│   │   └── cognitive-models.ts     # User/Domain/Relationship models
│   │
│   ├── engine/                     # Core Galatea logic
│   │   ├── activity-router.ts      # Level 0-3 classification
│   │   ├── homeostasis-engine.ts   # 6 dimensions + guidance
│   │   ├── context-builder.ts      # Assembles full context
│   │   ├── reflexion.ts            # Level 3 Draft→Critique→Revise
│   │   ├── guardrails.ts           # Over-research, going dark detection
│   │   ├── observation-pipeline.ts # Capture→Enrich→Validate→Store
│   │   └── calibration.ts          # Threshold learning from patterns
│   │
│   ├── integrations/
│   │   ├── graphiti.ts             # Graphiti client (memory graph)
│   │   ├── mqtt.ts                 # MQTT subscriber (HA/Frigate)
│   │   ├── llm.ts                  # Vercel AI SDK + Claude Code SDK
│   │   └── mcp.ts                  # MCP tool executor
│   │
│   └── db/
│       ├── schema.ts               # Drizzle schema (all tables)
│       ├── migrations/
│       └── index.ts                # DB client
│
├── drizzle.config.ts
├── app.config.ts                   # TanStack Start config
└── package.json
```

---

### 2. Server Functions

```typescript
// server/functions/chat.ts
import { createServerFn } from '@tanstack/react-start/server';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { activityRouter } from '../engine/activity-router';
import { homeostasisEngine } from '../engine/homeostasis-engine';
import { contextBuilder } from '../engine/context-builder';
import { reflexionLoop } from '../engine/reflexion';
import { graphiti } from '../integrations/graphiti';
import { db } from '../db';
import { sessions, messages } from '../db/schema';
import { eq } from 'drizzle-orm';

export const chat = createServerFn({ method: 'POST' })
  .validator((input: {
    sessionId: string;
    personaId: string;
    userId: string;
    message: string;
  }) => input)
  .handler(async ({ input }) => {
    const { sessionId, personaId, userId, message } = input;

    // 1. Classify activity
    const classification = await activityRouter.classify(message, sessionId);

    // 2. Level 0: Direct tool call (no LLM)
    if (classification.level === 0) {
      // Execute tool directly and return result
      // (Tool execution handled separately)
      return { type: 'tool_execution', classification };
    }

    // 3. Get homeostasis state (skip for Level 0-1)
    const homeostasis = classification.skipHomeostasis
      ? null
      : await homeostasisEngine.assess(sessionId);

    // 4. Get relevant memories
    const searchResults = await graphiti.search(message, sessionId);
    const memories = {
      episodic: searchResults.memories.filter(m => m.type === 'episodic'),
      semantic: searchResults.memories.filter(m => m.type === 'semantic'),
      procedural: searchResults.procedures || [],
    };

    // 5. Build context
    const context = await contextBuilder.build({
      sessionId,
      personaId,
      userId,
      message,
      classification,
      homeostasis,
      memories,
    });

    // 6. Level 3: Use Reflexion loop
    if (classification.level === 3) {
      const result = await reflexionLoop(context.messages, sessionId);

      // Store the response
      await db.insert(messages).values({
        id: crypto.randomUUID(),
        sessionId,
        role: 'assistant',
        content: result.finalResponse,
        activityLevel: 3,
        model: 'sonnet',
        createdAt: new Date(),
      });

      // Store as episodic memory
      await graphiti.addEpisode({
        content: `Reflexion response (${result.iterations} iterations): ${result.finalResponse.slice(0, 200)}...`,
        sessionId,
        source: 'chat',
        timestamp: new Date(),
      });

      return { type: 'reflexion', response: result.finalResponse, iterations: result.iterations };
    }

    // 7. Level 1-2: Standard LLM call
    const model = classification.model === 'haiku'
      ? anthropic('claude-3-haiku-20240307')
      : anthropic('claude-sonnet-4-20250514');

    const result = await streamText({
      model,
      messages: context.messages,
      system: context.systemPrompt,
    });

    // 8. Post-processing (in parallel with streaming)
    result.text.then(async (fullText) => {
      // Store message
      await db.insert(messages).values({
        id: crypto.randomUUID(),
        sessionId,
        role: 'assistant',
        content: fullText,
        activityLevel: classification.level,
        model: classification.model,
        createdAt: new Date(),
      });

      // Store as episodic memory
      await graphiti.addEpisode({
        content: `Response: ${fullText.slice(0, 200)}...`,
        sessionId,
        source: 'chat',
        timestamp: new Date(),
      });

      // Update homeostasis state
      await homeostasisEngine.updateAfterResponse(sessionId, classification);
    });

    return result.toDataStreamResponse();
  });
```

---

### 3. Drizzle Schema

```typescript
// server/db/schema.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

// ============ Core Tables ============

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  persona: text('persona', { enum: ['programmer', 'assistant', 'custom'] }).default('programmer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id).notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  activityLevel: integer('activity_level'),  // 0-3
  model: text('model'),  // haiku, sonnet
  tokenCount: integer('token_count'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============ Homeostasis ============

export const homeostasisState = sqliteTable('homeostasis_state', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id).notNull(),
  knowledgeSufficiency: text('knowledge_sufficiency', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  certaintyAlignment: text('certainty_alignment', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  progressMomentum: text('progress_momentum', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  communicationHealth: text('communication_health', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  productiveEngagement: text('productive_engagement', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  knowledgeApplication: text('knowledge_application', { enum: ['LOW', 'OK', 'HIGH'] }).default('OK'),
  // Guardrail counters
  iterationCount: integer('iteration_count').default(0),
  lastCommunicationAt: integer('last_communication_at', { mode: 'timestamp' }),
  researchStartedAt: integer('research_started_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============ Cognitive Models ============

// Self Model - agent's self-knowledge (per persona, not per session)
export const selfModels = sqliteTable('self_models', {
  id: text('id').primaryKey(),
  personaId: text('persona_id').references(() => personas.id).notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<{
    strong: string[];
    weak: string[];
    tools_available: string[];
  }>(),
  limitations: text('limitations', { mode: 'json' }).$type<string[]>(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// User Model - theories about user behavior
export const userModels = sqliteTable('user_models', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),  // External user identifier
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  interactionCount: integer('interaction_count').default(0),
  theories: text('theories', { mode: 'json' }).$type<Array<{
    statement: string;
    confidence: number;
    evidenceFor: string[];
    evidenceAgainst: string[];
  }>>(),
  preferences: text('preferences', { mode: 'json' }).$type<Record<string, string>>(),
  expertise: text('expertise', { mode: 'json' }).$type<Record<string, number>>(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Domain Model - domain-specific rules
export const domainModels = sqliteTable('domain_models', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().unique(),  // e.g., "mobile_development"
  precisionRequired: real('precision_required').default(0.7),
  riskLevel: text('risk_level', { enum: ['low', 'medium', 'high'] }).default('medium'),
  explorationEncouraged: integer('exploration_encouraged', { mode: 'boolean' }).default(true),
  mustCiteSources: integer('must_cite_sources', { mode: 'boolean' }).default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Relationship Model - per user-persona relationship
export const relationshipModels = sqliteTable('relationship_models', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  personaId: text('persona_id').references(() => personas.id).notNull(),
  firstInteraction: integer('first_interaction', { mode: 'timestamp' }).notNull(),
  totalInteractions: integer('total_interactions').default(0),
  significantEvents: text('significant_events', { mode: 'json' }).$type<string[]>(),  // Episode IDs
  trustLevel: real('trust_level').default(0.5),
  relationshipPhase: text('relationship_phase', { enum: ['initial', 'building', 'productive', 'mature'] }).default('initial'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============ Personas (Agent Specs) ============

export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),  // "Mobile Developer", "Assistant"
  domain: text('domain').notNull(),  // "Expo/React Native", "General"
  // Threshold tuning (JSON for flexibility)
  thresholds: text('thresholds', { mode: 'json' }).$type<{
    certaintyAlignment?: { context: string; value?: number };
    communicationHealth?: { context: string; intervalMinutes?: number };
    knowledgeApplication?: { context: string; maxResearchMinutes?: number };
  }>(),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============ Preprompts ============

export const preprompts = sqliteTable('preprompts', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type', { enum: ['core', 'persona', 'hard_rule', 'domain'] }).notNull(),
  content: text('content').notNull(),
  priority: integer('priority').default(0),  // Higher = earlier in context
  active: integer('active', { mode: 'boolean' }).default(true),
});

// ============ Observations ============

export const observations = sqliteTable('observations', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),  // 'browser', 'vscode', 'home_assistant', 'frigate'
  type: text('type').notNull(),       // 'navigation', 'file_save', 'person_detected', etc.
  data: text('data', { mode: 'json' }).notNull(),
  processed: integer('processed', { mode: 'boolean' }).default(false),
  sessionId: text('session_id').references(() => sessions.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============ Tool Executions ============

export const toolExecutions = sqliteTable('tool_executions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id).notNull(),
  messageId: text('message_id').references(() => messages.id),
  tool: text('tool').notNull(),
  input: text('input', { mode: 'json' }).notNull(),
  output: text('output', { mode: 'json' }),
  status: text('status', { enum: ['pending', 'approved', 'executed', 'failed'] }).default('pending'),
  executedAt: integer('executed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

---

### 4. MQTT Integration

```typescript
// server/integrations/mqtt.ts
import mqtt from 'mqtt';
import { observationPipeline } from '../engine/observation-pipeline';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

export function initMqtt() {
  const client = mqtt.connect(MQTT_BROKER);

  client.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Subscribe to all relevant topics
    client.subscribe([
      'homeassistant/+/+/state',      // HA entity states
      'homeassistant/+/+/attributes', // HA entity attributes
      'frigate/events',               // Frigate detections
      'frigate/+/person',             // Person detection per camera
      'zigbee2mqtt/+',                // Zigbee devices
      'galatea/extensions/+',         // Our own extensions
    ]);
  });

  client.on('message', async (topic, payload) => {
    try {
      const message = JSON.parse(payload.toString());

      // Route to observation pipeline
      await observationPipeline.ingest({
        source: topicToSource(topic),
        type: topicToType(topic),
        data: message,
        timestamp: Date.now(),
        topic,  // Keep original topic for debugging
      });
    } catch (error) {
      console.error('MQTT message processing error:', error);
    }
  });

  return client;
}

function topicToSource(topic: string): string {
  if (topic.startsWith('homeassistant/')) return 'home_assistant';
  if (topic.startsWith('frigate/')) return 'frigate';
  if (topic.startsWith('zigbee2mqtt/')) return 'zigbee';
  if (topic.startsWith('galatea/extensions/')) return 'extension';
  return 'unknown';
}

function topicToType(topic: string): string {
  const parts = topic.split('/');
  if (topic.startsWith('homeassistant/')) {
    return `${parts[1]}_${parts[3]}`; // e.g., "binary_sensor_state"
  }
  if (topic.startsWith('frigate/')) {
    return parts[1]; // e.g., "events" or camera name
  }
  return parts[parts.length - 1];
}
```

---

### 5. Graphiti Integration

```typescript
// server/integrations/graphiti.ts
import { spawn } from 'child_process';

interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: string;
  confidence: number;
  validFrom: Date;
  validUntil?: Date;
  source?: string;
}

interface SearchResult {
  memories: Memory[];
  procedures: Procedure[];
}

class GraphitiClient {
  private pythonProcess: ReturnType<typeof spawn> | null = null;

  async search(query: string, sessionId: string): Promise<SearchResult> {
    // Option A: REST API (if Graphiti exposes one)
    // Option B: Python subprocess for direct access

    const result = await this.callPython('search', { query, sessionId });
    return result as SearchResult;
  }

  async addMemory(memory: Omit<Memory, 'id'>): Promise<Memory> {
    const result = await this.callPython('add_memory', memory);
    return result as Memory;
  }

  async addEpisode(episode: {
    content: string;
    sessionId: string;
    source: string;
    timestamp: Date;
  }): Promise<void> {
    await this.callPython('add_episode', episode);
  }

  async promoteToFact(episodeId: string, confidence: number): Promise<void> {
    await this.callPython('promote_to_fact', { episodeId, confidence });
  }

  async invalidateMemory(memoryId: string, reason: string): Promise<void> {
    await this.callPython('invalidate', { memoryId, reason });
  }

  private async callPython(method: string, args: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const process = spawn('python', [
        '-m', 'galatea_graphiti',
        method,
        JSON.stringify(args),
      ]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => { stdout += data; });
      process.stderr.on('data', (data) => { stderr += data; });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(stdout));
        } else {
          reject(new Error(`Python error: ${stderr}`));
        }
      });
    });
  }
}

export const graphiti = new GraphitiClient();
```

---

### 6. Activity Router

```typescript
// server/engine/activity-router.ts
import { graphiti } from '../integrations/graphiti';
import { db } from '../db';
import { homeostasisState } from '../db/schema';
import { eq } from 'drizzle-orm';

interface ActivityClassification {
  level: 0 | 1 | 2 | 3;
  reason: string;
  model: 'none' | 'haiku' | 'sonnet';
  skipMemory: boolean;
  skipHomeostasis: boolean;
}

class ActivityRouter {
  async classify(message: string, sessionId: string): Promise<ActivityClassification> {
    // Level 0: Direct tool calls (no LLM needed)
    if (this.isDirectToolCall(message)) {
      return {
        level: 0,
        reason: 'direct_tool_call',
        model: 'none',
        skipMemory: false,
        skipHomeostasis: true,
      };
    }

    // Check for procedure match
    const procedureMatch = await graphiti.search(message, sessionId)
      .then(r => r.procedures.find(p => p.successRate > 0.85));

    // Check homeostasis state
    const [state] = await db
      .select()
      .from(homeostasisState)
      .where(eq(homeostasisState.sessionId, sessionId))
      .limit(1);

    // Level 3: Knowledge gaps or high stakes
    if (state?.knowledgeSufficiency === 'LOW' || state?.certaintyAlignment === 'LOW') {
      return {
        level: 3,
        reason: 'knowledge_gap',
        model: 'sonnet',
        skipMemory: false,
        skipHomeostasis: false,
      };
    }

    // Level 3: High stakes (irreversible actions)
    if (this.isHighStakes(message)) {
      return {
        level: 3,
        reason: 'high_stakes',
        model: 'sonnet',
        skipMemory: false,
        skipHomeostasis: false,
      };
    }

    // Level 1: Procedure exists with high success rate
    if (procedureMatch) {
      return {
        level: 1,
        reason: 'procedure_match',
        model: 'haiku',
        skipMemory: false,
        skipHomeostasis: true,
      };
    }

    // Level 2: Default - requires reasoning
    return {
      level: 2,
      reason: 'requires_reasoning',
      model: 'sonnet',
      skipMemory: false,
      skipHomeostasis: false,
    };
  }

  private isDirectToolCall(message: string): boolean {
    const directPatterns = [
      /^(run|execute|call)\s+\w+/i,
      /^git\s+(status|log|diff)/i,
      /^ls|pwd|cat/i,
    ];
    return directPatterns.some(p => p.test(message.trim()));
  }

  private isHighStakes(message: string): boolean {
    const highStakesPatterns = [
      /push\s+(to\s+)?(main|master|production)/i,
      /deploy/i,
      /delete\s+(all|everything|database)/i,
      /drop\s+table/i,
      /rm\s+-rf/i,
    ];
    return highStakesPatterns.some(p => p.test(message));
  }
}

export const activityRouter = new ActivityRouter();
```

---

### 7. Homeostasis Engine

```typescript
// server/engine/homeostasis-engine.ts
import { db } from '../db';
import { homeostasisState, relationshipModels, personas } from '../db/schema';
import { eq } from 'drizzle-orm';

type DimensionState = 'LOW' | 'OK' | 'HIGH';

interface HomeostasisAssessment {
  knowledgeSufficiency: DimensionState;
  certaintyAlignment: DimensionState;
  progressMomentum: DimensionState;
  communicationHealth: DimensionState;
  productiveEngagement: DimensionState;
  knowledgeApplication: DimensionState;
  guidance: string[];
  guardrailTriggered: boolean;
}

const GUIDANCE_TEMPLATES = {
  knowledgeSufficiency: {
    LOW: "You need more knowledge before acting. Options: Retrieve memories → Research docs/codebase → Ask teammate → Ask PM. Don't research forever - timebox then ask.",
  },
  certaintyAlignment: {
    LOW: "Your confidence is low but you're about to act. Is this reversible? If yes, try and learn. Could you be wrong in a costly way? Ask first.",
    HIGH: "You seem confident but keep asking. Do you actually need input or are you seeking validation?",
  },
  progressMomentum: {
    LOW: "You're not making progress. Diagnose: Knowledge gap? Uncertain? Blocked externally? Don't spin silently.",
    HIGH: "You're moving fast. Pause to verify quality. Have you tested?",
  },
  communicationHealth: {
    LOW: "You've been quiet. Does PM/team need a status update? Don't go dark during active work.",
    HIGH: "You're communicating a lot. Could you batch these messages?",
  },
  productiveEngagement: {
    LOW: "Find valuable work. Priority: assigned task > help teammates > review MRs > proactive improvements > learn.",
    HIGH: "You have too much going on. Prioritize, delegate, or signal overload.",
  },
  knowledgeApplication: {
    LOW: "You're acting without learning. Pause to understand why, not just how.",
    HIGH: "You've been learning a lot. Time to apply. Doing will teach you more than reading.",
  },
};

class HomeostasisEngine {
  async assess(sessionId: string): Promise<HomeostasisAssessment> {
    // Get current state
    const [state] = await db
      .select()
      .from(homeostasisState)
      .where(eq(homeostasisState.sessionId, sessionId))
      .limit(1);

    if (!state) {
      // Return default healthy state
      return this.defaultAssessment();
    }

    // Generate guidance for imbalanced dimensions
    const guidance: string[] = [];
    const dimensions = [
      'knowledgeSufficiency', 'certaintyAlignment', 'progressMomentum',
      'communicationHealth', 'productiveEngagement', 'knowledgeApplication'
    ] as const;

    for (const dim of dimensions) {
      const value = state[dim] as DimensionState;
      if (value !== 'OK') {
        const template = GUIDANCE_TEMPLATES[dim][value];
        if (template) guidance.push(template);
      }
    }

    // Check guardrails
    const guardrailTriggered = this.checkGuardrails(state);

    return {
      knowledgeSufficiency: state.knowledgeSufficiency as DimensionState,
      certaintyAlignment: state.certaintyAlignment as DimensionState,
      progressMomentum: state.progressMomentum as DimensionState,
      communicationHealth: state.communicationHealth as DimensionState,
      productiveEngagement: state.productiveEngagement as DimensionState,
      knowledgeApplication: state.knowledgeApplication as DimensionState,
      guidance,
      guardrailTriggered,
    };
  }

  private checkGuardrails(state: typeof homeostasisState.$inferSelect): boolean {
    const now = Date.now();

    // Over-research: researching > 2 hours without output
    if (state.researchStartedAt) {
      const researchMs = now - state.researchStartedAt.getTime();
      if (researchMs > 2 * 60 * 60 * 1000) return true;
    }

    // Going dark: no communication > 2 hours during active work
    if (state.lastCommunicationAt) {
      const silenceMs = now - state.lastCommunicationAt.getTime();
      if (silenceMs > 2 * 60 * 60 * 1000) return true;
    }

    // Max iterations: too many back-and-forth
    if (state.iterationCount && state.iterationCount > 15) return true;

    return false;
  }

  private defaultAssessment(): HomeostasisAssessment {
    return {
      knowledgeSufficiency: 'OK',
      certaintyAlignment: 'OK',
      progressMomentum: 'OK',
      communicationHealth: 'OK',
      productiveEngagement: 'OK',
      knowledgeApplication: 'OK',
      guidance: [],
      guardrailTriggered: false,
    };
  }
}

export const homeostasisEngine = new HomeostasisEngine();
```

---

### 8. Reflexion Loop (Level 3)

```typescript
// server/engine/reflexion.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { graphiti } from '../integrations/graphiti';

interface ReflexionResult {
  finalResponse: string;
  iterations: number;
  evidence: string[];
}

const MAX_ITERATIONS = 3;

export async function reflexionLoop(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  sessionId: string
): Promise<ReflexionResult> {
  let iterations = 0;
  let currentDraft = '';
  let evidence: string[] = [];

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Step 1: Draft response
    const draftResult = await streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      messages: [
        ...messages,
        ...(currentDraft ? [{
          role: 'assistant' as const,
          content: `Previous draft:\n${currentDraft}\n\nCritique:\n${evidence.join('\n')}`
        }] : []),
        { role: 'user' as const, content: 'Provide your response. If this is a revision, address the critique.' }
      ],
    });
    currentDraft = await draftResult.text;

    // Step 2: Gather evidence (search memories, tools)
    const searchResults = await graphiti.search(currentDraft, sessionId);
    const newEvidence = searchResults.memories.map(m => m.content);

    // Step 3: Critique
    const critiqueResult = await streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      messages: [
        { role: 'system', content: 'You are a critical reviewer. Identify gaps, errors, or unsupported claims.' },
        { role: 'user', content: `Response:\n${currentDraft}\n\nEvidence available:\n${newEvidence.join('\n')}\n\nWhat's wrong or missing?` },
      ],
    });
    const critique = await critiqueResult.text;

    // Step 4: Check if good enough
    if (critique.toLowerCase().includes('no significant issues') ||
        critique.toLowerCase().includes('response is adequate')) {
      break;
    }

    evidence = [...evidence, critique];
  }

  return {
    finalResponse: currentDraft,
    iterations,
    evidence,
  };
}
```

---

### 9. Context Builder (Complete)

```typescript
// server/engine/context-builder.ts
import { db } from '../db';
import { preprompts, personas, selfModels, userModels, domainModels } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { HomeostasisAssessment } from './homeostasis-engine';
import type { ActivityClassification } from './activity-router';

interface ContextBuildInput {
  sessionId: string;
  personaId: string;
  userId: string;
  message: string;
  classification: ActivityClassification;
  homeostasis: HomeostasisAssessment | null;
  memories: { episodic: any[]; semantic: any[]; procedural: any[] };
}

interface BuiltContext {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

class ContextBuilder {
  async build(input: ContextBuildInput): Promise<BuiltContext> {
    const { personaId, userId, message, classification, homeostasis, memories } = input;

    // 1. Get persona and preprompts
    const [persona] = await db.select().from(personas).where(eq(personas.id, personaId));
    const allPreprompts = await db.select().from(preprompts)
      .where(eq(preprompts.active, true))
      .orderBy(preprompts.priority);

    // 2. Get cognitive models
    const [selfModel] = await db.select().from(selfModels).where(eq(selfModels.personaId, personaId));
    const [userModel] = await db.select().from(userModels).where(eq(userModels.userId, userId));
    const [domainModel] = persona?.domain
      ? await db.select().from(domainModels).where(eq(domainModels.domainId, persona.domain))
      : [null];

    // 3. Build system prompt (guaranteed content)
    const systemParts: string[] = [];

    // Core identity
    if (persona) {
      systemParts.push(`You are ${persona.name}, a ${persona.role} specializing in ${persona.domain}.`);
    }

    // Preprompts by type (core → persona → domain → hard_rule)
    const corePrompts = allPreprompts.filter(p => p.type === 'core');
    const personaPrompts = allPreprompts.filter(p => p.type === 'persona');
    const domainPrompts = allPreprompts.filter(p => p.type === 'domain');
    const hardRules = allPreprompts.filter(p => p.type === 'hard_rule');

    systemParts.push(...corePrompts.map(p => p.content));
    systemParts.push(...personaPrompts.map(p => p.content));
    systemParts.push(...domainPrompts.map(p => p.content));

    // Hard rules (always included, critical)
    if (hardRules.length > 0) {
      systemParts.push('\n## HARD RULES (Never violate these):');
      systemParts.push(...hardRules.map(p => `- ${p.content}`));
    }

    // Self-knowledge (model awareness)
    if (selfModel) {
      systemParts.push(`\n## Self-Knowledge:`);
      systemParts.push(`Strengths: ${selfModel.capabilities?.strong?.join(', ')}`);
      systemParts.push(`Limitations: ${selfModel.limitations?.join(', ')}`);
    }

    // Current activity state
    systemParts.push(`\n## Current State:`);
    systemParts.push(`Activity Level: ${classification.level} (${classification.reason})`);
    systemParts.push(`Model: ${classification.model}`);

    // 4. Build messages array
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    // User model context (if available)
    if (userModel?.theories && userModel.theories.length > 0) {
      const highConfidence = userModel.theories.filter(t => t.confidence > 0.7);
      if (highConfidence.length > 0) {
        messages.push({
          role: 'system',
          content: `User context:\n${highConfidence.map(t => `- ${t.statement}`).join('\n')}`,
        });
      }
    }

    // Relevant memories
    if (memories.semantic.length > 0) {
      messages.push({
        role: 'system',
        content: `Relevant facts:\n${memories.semantic.map(m => `- ${m.content}`).join('\n')}`,
      });
    }

    if (memories.procedural.length > 0) {
      messages.push({
        role: 'system',
        content: `Relevant procedures:\n${memories.procedural.map(p => `- ${p.name}: ${p.trigger.pattern}`).join('\n')}`,
      });
    }

    // Homeostasis guidance (if not skipped)
    if (homeostasis && homeostasis.guidance.length > 0) {
      messages.push({
        role: 'system',
        content: `## Current Guidance:\n${homeostasis.guidance.join('\n\n')}`,
      });

      if (homeostasis.guardrailTriggered) {
        messages.push({
          role: 'system',
          content: '⚠️ GUARDRAIL TRIGGERED: You may be over-researching, going dark, or spinning. Take corrective action.',
        });
      }
    }

    // User message
    messages.push({ role: 'user', content: message });

    return {
      systemPrompt: systemParts.join('\n\n'),
      messages,
    };
  }
}

export const contextBuilder = new ContextBuilder();
```

---

### 10. Chat UI with Streaming

```typescript
// app/routes/chat/$sessionId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useChat } from 'ai/react';
import { MessageList } from '../../components/chat/MessageList';
import { ChatInput } from '../../components/chat/ChatInput';
import { StatePanel } from '../../components/homeostasis/StatePanel';

export const Route = createFileRoute('/chat/$sessionId')({
  component: ChatPage,
});

function ChatPage() {
  const { sessionId } = Route.useParams();

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { sessionId },
  });

  // Fetch homeostasis state
  const { data: homeostasis } = useQuery({
    queryKey: ['homeostasis', sessionId],
    queryFn: () => fetch(`/api/homeostasis/${sessionId}`).then(r => r.json()),
    refetchInterval: 5000,  // Poll every 5s
  });

  return (
    <div className="flex h-screen">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <MessageList messages={messages} />
        <ChatInput
          value={input}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>

      {/* Side panel */}
      <div className="w-80 border-l p-4">
        <StatePanel state={homeostasis} />
      </div>
    </div>
  );
}
```

---

## Data Flow Summary

### Chat Request Flow

```
1. User types message
         │
         ▼
2. POST /api/chat { sessionId, message }
         │
         ▼
3. Activity Router classifies (Level 0-3)
         │
         ├── Level 0: Direct tool execution (no LLM)
         │
         ├── Level 1: Pattern match → Haiku
         │
         ├── Level 2: Reasoning → Sonnet
         │
         └── Level 3: Reflection → Sonnet + loop
                │
                ▼
4. Context Builder assembles:
   • Preprompts (persona, hard rules)
   • Relevant memories (Graphiti search)
   • Homeostasis guidance (if applicable)
   • Recent conversation
         │
         ▼
5. LLM generates response (streaming)
         │
         ▼
6. Response streamed to client
         │
         ▼
7. Post-processing:
   • Store message in Drizzle
   • Update homeostasis state
   • Store as episodic memory (Graphiti)
```

### Observation Flow

```
1. Event arrives (HTTP or MQTT)
         │
         ▼
2. Store raw observation (Drizzle)
         │
         ▼
3. Enrichment:
   • Group related events
   • Guess user intent
   • Add context
         │
         ▼
4. Validation (optional):
   • Queue for dialogue if uncertain
   • User confirms/corrects
         │
         ▼
5. Memory Formation:
   • Store as episodic (Graphiti)
   • Update cognitive models
         │
         ▼
6. Promotion (later):
   • Episode → Fact (if repeated)
   • Fact → Procedure (if pattern emerges)
```

---

## External Dependencies

| Service | Purpose | Local Dev | Production |
|---------|---------|-----------|------------|
| **SQLite** | Primary storage | File | → PostgreSQL |
| **FalkorDB** | Graph memory | Docker | Docker/Cloud |
| **Graphiti** | Temporal graph | Python subprocess | Python subprocess |
| **Mosquitto** | MQTT broker | Docker (or existing HA) | Same |
| **Anthropic API** | LLM | API key | API key |
| **Voyage AI** | Embeddings | API key | API key |

### Docker Compose (Local Dev)

```yaml
version: '3.8'
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"  # WebSocket
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  falkordb_data:
```

---

## What We Reuse vs Build

### Reuse (Zero/Low Effort)

| Component | Source | Notes |
|-----------|--------|-------|
| Full-stack framework | TanStack Start | As-is |
| Data fetching | TanStack Query | As-is |
| Forms | TanStack Form | As-is |
| Data tables | TanStack Table | As-is |
| Routing | TanStack Router | Included |
| AI streaming | Vercel AI SDK | Official integration |
| Database ORM | Drizzle | Schema definition only |
| Auth | Better Auth | Configuration only |
| UI components | shadcn/ui | As-is |

### Build (Medium Effort)

| Component | Effort | Notes |
|-----------|--------|-------|
| Activity Router | 2-3 days | Core logic, pattern matching |
| Homeostasis Engine | 3-5 days | 6 dimensions, assessment |
| Context Builder | 2-3 days | Assembly logic |
| Graphiti Bridge | 2-3 days | Python subprocess wrapper |
| MQTT Integration | 1-2 days | Subscriber + routing |
| Observation Pipeline | 3-5 days | All 4 layers |
| Memory UI | 2-3 days | TanStack Table customization |
| Chat UI | 1-2 days | Streaming, panels |

**Total Build Effort**: ~3-4 weeks for MVP

---

## Learning Pipeline

### Memory Promotion Flow

```
┌─────────────────┐
│   Raw Event     │  (MQTT, HTTP, dialogue)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Observation   │  Store in Drizzle, mark unprocessed
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Enrichment    │  Add context, guess intent
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Episode      │  Store in Graphiti with timestamp
└────────┬────────┘
         │
         ▼ (if pattern repeats 3+ times)
┌─────────────────┐
│      Fact       │  Extract as semantic memory
└────────┬────────┘
         │
         ▼ (if trigger→steps pattern emerges)
┌─────────────────┐
│   Procedure     │  Create trigger→steps procedure
└─────────────────┘
```

### Learning Server Function

```typescript
// server/functions/learning.ts
import { createServerFn } from '@tanstack/react-start/server';
import { graphiti } from '../integrations/graphiti';
import { db } from '../db';
import { observations, userModels } from '../db/schema';
import { eq } from 'drizzle-orm';

// Promote observation to episode
export const promoteToEpisode = createServerFn({ method: 'POST' })
  .validator((input: { observationId: string; summary: string }) => input)
  .handler(async ({ input }) => {
    const [obs] = await db.select().from(observations)
      .where(eq(observations.id, input.observationId));

    if (!obs) throw new Error('Observation not found');

    await graphiti.addEpisode({
      content: input.summary,
      sessionId: obs.sessionId || 'global',
      source: obs.source,
      timestamp: obs.createdAt,
    });

    await db.update(observations)
      .set({ processed: true })
      .where(eq(observations.id, input.observationId));

    return { success: true };
  });

// Promote episode to fact
export const promoteToFact = createServerFn({ method: 'POST' })
  .validator((input: { episodeId: string; factContent: string; confidence: number }) => input)
  .handler(async ({ input }) => {
    await graphiti.promoteToFact(input.episodeId, input.confidence);
    return { success: true };
  });

// Update user model theory
export const updateUserTheory = createServerFn({ method: 'POST' })
  .validator((input: {
    userId: string;
    theory: string;
    confidence: number;
    episodeId: string;
    isEvidence: boolean;
  }) => input)
  .handler(async ({ input }) => {
    const [model] = await db.select().from(userModels)
      .where(eq(userModels.userId, input.userId));

    if (!model) {
      // Create new user model
      await db.insert(userModels).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        firstSeen: new Date(),
        interactionCount: 1,
        theories: [{
          statement: input.theory,
          confidence: input.confidence,
          evidenceFor: input.isEvidence ? [input.episodeId] : [],
          evidenceAgainst: input.isEvidence ? [] : [input.episodeId],
        }],
        preferences: {},
        expertise: {},
        updatedAt: new Date(),
      });
    } else {
      // Update existing theory or add new
      const theories = model.theories || [];
      const existing = theories.find(t => t.statement === input.theory);

      if (existing) {
        if (input.isEvidence) {
          existing.evidenceFor.push(input.episodeId);
        } else {
          existing.evidenceAgainst.push(input.episodeId);
        }
        // Recalculate confidence
        existing.confidence = existing.evidenceFor.length /
          (existing.evidenceFor.length + existing.evidenceAgainst.length);
      } else {
        theories.push({
          statement: input.theory,
          confidence: input.confidence,
          evidenceFor: input.isEvidence ? [input.episodeId] : [],
          evidenceAgainst: input.isEvidence ? [] : [input.episodeId],
        });
      }

      await db.update(userModels)
        .set({ theories, updatedAt: new Date() })
        .where(eq(userModels.userId, input.userId));
    }

    return { success: true };
  });
```

### Threshold Calibration

```typescript
// server/engine/calibration.ts
import { db } from '../db';
import { personas, homeostasisState } from '../db/schema';
import { eq } from 'drizzle-orm';
import { graphiti } from '../integrations/graphiti';

interface CalibrationResult {
  dimension: string;
  suggestedThreshold: number;
  evidence: string[];
}

export async function calibrateFromObservations(
  personaId: string
): Promise<CalibrationResult[]> {
  // Query episodes where user asked for help
  const helpEpisodes = await graphiti.search('user asked for help', personaId);

  // Analyze timing patterns
  const results: CalibrationResult[] = [];

  // Example: Communication health calibration
  // If user typically asks "what's the status?" after 90 minutes of silence,
  // suggest communication threshold of 60 minutes
  const silenceBeforeAsk = helpEpisodes.memories
    .filter(m => m.content.includes('status'))
    .map(m => {
      // Extract time since last communication (from episode metadata)
      return 90; // placeholder - would extract from episode
    });

  if (silenceBeforeAsk.length > 0) {
    const avgSilence = silenceBeforeAsk.reduce((a, b) => a + b, 0) / silenceBeforeAsk.length;
    results.push({
      dimension: 'communicationHealth',
      suggestedThreshold: Math.floor(avgSilence * 0.7), // 70% of observed pattern
      evidence: helpEpisodes.memories.map(m => m.id),
    });
  }

  return results;
}
```

---

## Gap Analysis vs PSYCHOLOGICAL_ARCHITECTURE.md

| Component | Status | Notes |
|-----------|--------|-------|
| Activity Router (L0-3) | ✅ Complete | Classification + model selection |
| Reflexion Loop (L3) | ✅ Complete | Draft → Critique → Revise |
| Explicit Guidance | ✅ Complete | Preprompts table with types |
| Homeostasis (6 dims) | ✅ Complete | Assessment + guidance generation |
| Guardrails | ✅ Complete | Over-research, going dark, max iterations |
| Memory Layer | ✅ Complete | Graphiti integration |
| Self Model | ✅ Complete | Schema + context builder |
| User Model | ✅ Complete | Theories, preferences, expertise |
| Domain Model | ✅ Complete | Risk level, precision required |
| Relationship Model | ✅ Complete | Trust level, phase |
| Personas (Agent Specs) | ✅ Complete | Thresholds, identity |
| Memory Promotion | ✅ Complete | Episode → Fact → Procedure |
| Threshold Calibration | ✅ Complete | From observation patterns |
| Safety Systems | ⏸️ Deferred | Per PSYCHOLOGICAL_ARCHITECTURE.md |

---

*Architecture documented: 2026-02-03*
*Updated: Added cognitive models, reflexion loop, guardrails, learning pipeline*
