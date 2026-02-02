# Ecosystem Reuse: MCP, Skills, and Integrations

**Date**: 2026-02-01
**Purpose**: Document how Galatea can leverage existing MCP servers, skills, and integration ecosystems

---

## Executive Summary

Galatea can reuse **1,000+ tools** from existing ecosystems:
- ✅ **MCP Servers** - 1,000+ tools via Model Context Protocol
- ✅ **Claude Code Skills** - 20+ reusable prompt patterns
- ✅ **n8n Workflows** - 1,000+ service integrations
- ✅ **OpenClaw Adapters** - 12+ messaging platforms
- ✅ **LangChain Tools** - 100+ integrations

**Key Insight**: Vercel AI SDK 6 has native MCP support → instant ecosystem access!

---

## 1. MCP (Model Context Protocol) Ecosystem

### What is MCP?

**Industry standard** for tool integration (backed by OpenAI, Anthropic, Google, Microsoft)
- **97M+ monthly downloads**
- **1,000+ servers available**
- **Universal protocol** - works with any LLM

### Official MCP Servers (Anthropic)

| Server | Purpose | Package |
|--------|---------|---------|
| **Filesystem** | Read/write files | `@modelcontextprotocol/server-filesystem` |
| **GitHub** | Issues, PRs, repos | `@modelcontextprotocol/server-github` |
| **GitLab** | GitLab operations | `@modelcontextprotocol/server-gitlab` |
| **Google Drive** | Drive file access | `@modelcontextprotocol/server-gdrive` |
| **Brave Search** | Web search | `@modelcontextprotocol/server-brave-search` |
| **PostgreSQL** | Database queries | `@modelcontextprotocol/server-postgres` |
| **Puppeteer** | Web scraping | `@modelcontextprotocol/server-puppeteer` |
| **Slack** | Slack API | `@modelcontextprotocol/server-slack` |
| **Memory** | Simple memory | `@modelcontextprotocol/server-memory` |
| **Sequential Thinking** | Chain of thought | `@modelcontextprotocol/server-sequential-thinking` |

### Community MCP Servers (100+)

**Development Tools:**
- `mcp-server-docker` - Docker operations
- `mcp-server-kubernetes` - K8s management
- `mcp-server-git` - Git operations
- `mcp-server-vscode` - VSCode integration

**Data & Analytics:**
- `mcp-server-bigquery` - Google BigQuery
- `mcp-server-snowflake` - Snowflake data warehouse
- `mcp-server-mongodb` - MongoDB operations
- `mcp-server-redis` - Redis operations

**Productivity:**
- `mcp-server-notion` - Notion API
- `mcp-server-todoist` - Task management
- `mcp-server-google-calendar` - Calendar ops
- `mcp-server-gmail` - Email operations

**AI/ML:**
- `mcp-server-openai` - OpenAI API
- `mcp-server-huggingface` - HF models
- `mcp-server-replicate` - Replicate API
- `mcp-server-stability` - Stable Diffusion

### How to Use MCP in Galatea

**Installation:**
```bash
npm install @modelcontextprotocol/sdk
npm install @modelcontextprotocol/server-filesystem
npm install @modelcontextprotocol/server-github
# ... any MCP server
```

**Integration with Vercel AI SDK:**
```typescript
import { createMCPClient } from 'ai/mcp';
import { generateText } from 'ai';

// Load MCP servers
const mcpClient = await createMCPClient({
  servers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      },
    },
    search: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: process.env.BRAVE_API_KEY,
      },
    },
  },
});

// Use with Galatea
const result = await generateText({
  model: claude('claude-sonnet-4'),
  tools: mcpClient.getTools(), // All MCP tools available!
  prompt: 'Read my README.md and create a GitHub issue for the bug mentioned',
});
```

**Convex Integration:**
```typescript
// convex/mcp.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const executeMCPTool = action({
  args: {
    server: v.string(),
    tool: v.string(),
    params: v.any(),
  },
  handler: async (ctx, args) => {
    // Execute MCP tool
    const result = await mcpClient.callTool(
      args.server,
      args.tool,
      args.params
    );

    // Store execution in toolExecutions table
    await ctx.runMutation(internal.toolExecutions.create, {
      sessionId: ctx.sessionId,
      server: args.server,
      tool: args.tool,
      params: args.params,
      result,
      success: true,
      timestamp: Date.now(),
    });

    return result;
  },
});
```

---

## 2. Claude Code Skills Ecosystem

### What are Claude Code Skills?

**Reusable prompt-based behaviors** in Claude Code CLI
- ~20 built-in skills
- Extensible (create custom skills)
- Composable (skills call other skills)

### Built-in Claude Code Skills

| Skill | Purpose | Reusable As |
|-------|---------|-------------|
| `/commit` | Smart git commits | Preprompt for version control |
| `/review-pr` | PR review | Preprompt for code review |
| `/test` | Generate/run tests | Preprompt for testing |
| `/debug` | Analyze errors | Preprompt for debugging |
| `/docs` | Generate docs | Preprompt for documentation |
| `/refactor` | Code refactoring | Preprompt for code quality |
| `/explain` | Explain code | Preprompt for teaching |
| `/security` | Security review | Preprompt for security |

### How to Port to Galatea Preprompts

**Claude Code Skill Structure:**
```typescript
// Claude Code internal structure
{
  name: "commit",
  description: "Create git commits with best practices",
  systemPrompt: `
    When creating commits:
    1. Analyze all staged changes
    2. Review recent commit history for style
    3. Write descriptive commit messages
    4. Follow conventional commits format
    5. Add co-author attribution
  `,
  tools: ["git", "file-read", "bash"],
}
```

**Port to Galatea Preprompt:**
```typescript
// convex/preprompts.ts
export const commitSkill = {
  name: "commit",
  type: "skill" as const,
  content: `
# Git Commit Skill

When the user asks you to create a commit:

1. **Analyze Changes**
   - Run git status to see all changes
   - Run git diff to understand modifications
   - Identify the nature of changes (feature, fix, refactor, etc.)

2. **Review Style**
   - Check git log for recent commits
   - Follow the repository's commit message style
   - Use conventional commits format if appropriate

3. **Write Message**
   - First line: Brief summary (<50 chars)
   - Body: Explain what and why (not how)
   - Footer: References (issues, breaking changes)

4. **Execute**
   - Stage relevant files (be selective)
   - Create commit with message
   - Add co-author if appropriate

5. **Verify**
   - Run git status after commit
   - Confirm success to user

Tools available: filesystem (read), git (via bash), bash
`,
  tools: ['filesystem', 'bash'],
};
```

**Usage in Galatea:**
```typescript
// Load skill as context
const session = await ctx.db.get(sessionId);
const commitSkill = await ctx.db
  .query("preprompts")
  .withIndex("by_name", q => q.eq("name", "commit"))
  .first();

// Add to STABLE zone for current interaction
await ctx.db.insert("blocks", {
  sessionId,
  content: commitSkill.content,
  type: "skill",
  zone: "STABLE",
  position: nextPosition,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
```

### Custom Skills for Galatea Subsystems

**Curiosity Skill:**
```typescript
export const curiositySkill = {
  name: "explore",
  type: "skill",
  content: `
# Curiosity Exploration Skill

When you encounter low-confidence information:

1. **Identify Gap**
   - What specifically are you uncertain about?
   - What would you need to know to be confident?

2. **Plan Exploration**
   - What tools can help? (search, documentation, code analysis)
   - What questions need answering?

3. **Execute**
   - Use available tools to investigate
   - Gather evidence and examples
   - Test hypotheses

4. **Synthesize**
   - Update your understanding
   - Store findings in semantic memory
   - Assess new confidence level

5. **Report**
   - Share what you learned
   - Acknowledge remaining uncertainties
`,
  tools: ['brave-search', 'filesystem', 'github'],
};
```

**Reflection Skill:**
```typescript
export const reflectionSkill = {
  name: "reflect",
  type: "skill",
  content: `
# Reflection Skill

After completing a task:

1. **Outcome Assessment**
   - Did the task succeed or fail?
   - What was the actual result?

2. **Analysis**
   - What worked well?
   - What didn't work?
   - What surprised you?

3. **Root Cause**
   - Why did things go this way?
   - What assumptions were wrong?

4. **Learning**
   - What would you do differently?
   - What pattern should you remember?
   - How should this update your approach?

5. **Storage**
   - Store in procedural memory
   - Tag for easy retrieval
   - Link to relevant context
`,
  tools: ['memory'],
};
```

---

## 3. n8n Workflow Ecosystem

### What is n8n?

**Workflow automation platform** with 1,000+ integrations
- Open source
- Visual workflow builder
- Webhooks, scheduled triggers
- Data transformations

### Popular n8n Integrations

**Communication:**
- Slack, Discord, Telegram, Email (Gmail, Outlook)
- SMS (Twilio), Voice (Vonage)

**Productivity:**
- Google Workspace (Docs, Sheets, Calendar, Drive)
- Microsoft 365 (Outlook, OneDrive, Teams)
- Notion, Airtable, Trello, Asana

**Development:**
- GitHub, GitLab, Bitbucket
- Jira, Linear, ClickUp
- Docker, Kubernetes

**Data:**
- PostgreSQL, MySQL, MongoDB, Redis
- Snowflake, BigQuery, Elasticsearch
- CSV, JSON, XML parsers

**AI/ML:**
- OpenAI, Anthropic, Cohere
- Hugging Face, Replicate
- Custom API endpoints

### How to Use n8n with Galatea

**Approach 1: Webhook Integration**
```typescript
// convex/n8n.ts
export const triggerN8NWorkflow = action({
  args: {
    workflowUrl: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const response = await fetch(args.workflowUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.payload),
    });

    return await response.json();
  },
});

// Usage in Galatea
await ctx.runAction(api.n8n.triggerN8NWorkflow, {
  workflowUrl: 'https://n8n.example.com/webhook/morning-briefing',
  payload: {
    userId: ctx.userId,
    date: new Date().toISOString(),
  },
});
```

**Approach 2: Wrap as MCP Server**
```typescript
// Create custom MCP server for n8n workflows
// mcp-server-n8n/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({
  name: 'n8n-workflows',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'trigger_workflow',
      description: 'Trigger an n8n workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          payload: { type: 'object' },
        },
        required: ['workflowId'],
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'trigger_workflow') {
    const response = await fetch(`${N8N_URL}/webhook/${args.workflowId}`, {
      method: 'POST',
      body: JSON.stringify(args.payload),
    });
    return { content: [{ type: 'text', text: await response.text() }] };
  }
});
```

**Common Workflows for Galatea:**

**Programmer in the Box:**
- `deploy-to-staging` - Deploy code to staging
- `run-test-suite` - Execute full test suite
- `create-pr` - Create GitHub PR with description
- `notify-team` - Send Slack notification
- `update-jira` - Update Jira ticket status

**Personal Assistant:**
- `morning-briefing` - Aggregate news, calendar, tasks
- `meeting-prep` - Gather context for upcoming meeting
- `email-triage` - Prioritize and categorize emails
- `daily-summary` - End-of-day summary and planning
- `research-topic` - Deep research on a topic

---

## 4. OpenClaw Integration Patterns

### What is OpenClaw?

**Multi-platform messaging gateway**
- 12+ platform adapters (Discord, Telegram, Slack, etc.)
- Session management
- Message normalization
- WebSocket support

### OpenClaw Platform Adapters

| Platform | Use Case | Integration |
|----------|----------|-------------|
| **Discord** | Developer communities | Gateway pattern |
| **Telegram** | Personal chat | WebSocket |
| **Slack** | Team collaboration | Webhook |
| **WhatsApp** | Personal messaging | API |
| **SMS** | Notifications | Twilio |
| **Web Chat** | Website integration | WebSocket |
| **CLI** | Terminal interface | Stdio |

### Reusable Patterns from OpenClaw

**1. Gateway Pattern:**
```typescript
// Unified message handling
interface UnifiedMessage {
  userId: string;
  platform: string;
  content: string;
  timestamp: number;
  metadata: Record<string, any>;
}

class GalateaGateway {
  adapters: Map<string, PlatformAdapter> = new Map();

  async handleMessage(msg: UnifiedMessage) {
    // Normalize message
    const normalized = this.normalize(msg);

    // Get or create session
    const session = await this.getSession(msg.userId);

    // Process with Galatea core
    const response = await this.galatea.process(session, normalized);

    // Send via appropriate adapter
    await this.adapters.get(msg.platform).send(response);
  }
}
```

**2. Session Management:**
```typescript
// OpenClaw pattern: session per user per platform
interface SessionKey {
  userId: string;
  platform: string;
}

// Reuse in Galatea
await ctx.db.insert("sessions", {
  userId,
  platform,
  name: `${platform}-${userId}`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
```

**3. WebSocket Real-Time:**
```typescript
// OpenClaw uses WebSocket for real-time
// Convex already has real-time via subscriptions!

// Client-side (React)
const messages = useQuery(api.messages.list, { sessionId });
// Automatically updates in real-time ✅
```

---

## 5. LangChain Tools Ecosystem

### LangChain Tool Categories

**100+ integrations** that can be wrapped as MCP servers:

**Search:**
- Google Search, Bing, DuckDuckGo, Brave
- Wolfram Alpha, Wikipedia
- ArXiv, PubMed (academic)

**Browsers:**
- Playwright, Puppeteer
- Selenium, BeautifulSoup

**Documents:**
- PDF, Word, Excel parsers
- OCR (Tesseract)
- Document loaders (50+ types)

**APIs:**
- RESTful APIs (generic wrapper)
- GraphQL
- SOAP

**Databases:**
- SQL (all major databases)
- Vector DBs (Pinecone, Weaviate, Chroma)
- NoSQL (MongoDB, Redis, Cassandra)

### Wrapping LangChain Tools as MCP

**Example: Google Search Tool → MCP Server**
```typescript
// LangChain tool
import { GoogleSearchAPITool } from 'langchain/tools';

// Wrap as MCP server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({
  name: 'google-search',
  version: '1.0.0',
});

const googleTool = new GoogleSearchAPITool({
  apiKey: process.env.GOOGLE_API_KEY,
});

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search') {
    const result = await googleTool.call(request.params.arguments.query);
    return { content: [{ type: 'text', text: result }] };
  }
});
```

---

## 6. Implementation Strategy for Galatea

### Phase 1: Core MCP Integration (Week 2)

**Add to ContextForge:**
```typescript
// convex/mcp.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

// MCP client initialization
const mcpClient = await createMCPClient({
  servers: {
    filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
    },
    search: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY }
    },
  },
});

export const listMCPTools = action({
  handler: async () => {
    return await mcpClient.listTools();
  },
});

export const callMCPTool = action({
  args: {
    sessionId: v.id("sessions"),
    server: v.string(),
    tool: v.string(),
    params: v.any(),
  },
  handler: async (ctx, args) => {
    // Execute tool
    const result = await mcpClient.callTool(
      args.server,
      args.tool,
      args.params
    );

    // Log execution
    await ctx.runMutation(internal.toolExecutions.create, {
      sessionId: args.sessionId,
      server: args.server,
      tool: args.tool,
      params: args.params,
      result,
      success: true,
      timestamp: Date.now(),
    });

    return result;
  },
});
```

### Phase 2: Skills System (Week 3)

**Add preprompts table:**
```typescript
// convex/schema.ts
preprompts: defineTable({
  name: v.string(),
  type: v.union(v.literal("core"), v.literal("role"), v.literal("skill")),
  content: v.string(),
  tools: v.optional(v.array(v.string())), // Required MCP servers
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_name", ["name"]),
```

**Port Claude Code skills:**
```typescript
// convex/preprompts.ts
export const seedSkills = internalMutation({
  handler: async (ctx) => {
    const skills = [
      {
        name: "commit",
        type: "skill",
        content: commitSkillContent,
        tools: ["filesystem", "git"],
      },
      {
        name: "debug",
        type: "skill",
        content: debugSkillContent,
        tools: ["filesystem", "bash"],
      },
      // ... more skills
    ];

    for (const skill of skills) {
      await ctx.db.insert("preprompts", {
        ...skill,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
```

### Phase 3: n8n Integration (Week 4)

**Add workflow triggers:**
```typescript
// convex/workflows.ts
export const triggerWorkflow = action({
  args: {
    sessionId: v.id("sessions"),
    workflowName: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const webhookUrl = `${N8N_URL}/webhook/${args.workflowName}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...args.payload,
        sessionId: args.sessionId,
        userId: ctx.userId,
      }),
    });

    return await response.json();
  },
});
```

### Phase 4: Multi-Platform (Week 5-6)

**Add gateway adapters:**
```typescript
// convex/gateway.ts
interface PlatformAdapter {
  platform: string;
  send(userId: string, message: string): Promise<void>;
  normalize(raw: any): UnifiedMessage;
}

export const discordAdapter: PlatformAdapter = {
  platform: 'discord',
  async send(userId, message) {
    await fetch(`${DISCORD_API}/channels/${userId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
      body: JSON.stringify({ content: message }),
    });
  },
  normalize(raw) {
    return {
      userId: raw.author.id,
      platform: 'discord',
      content: raw.content,
      timestamp: Date.parse(raw.timestamp),
      metadata: { channelId: raw.channel_id },
    };
  },
};
```

---

## 7. Tool Availability Matrix

| Tool/Integration | Availability | Integration Method | Effort |
|------------------|--------------|-------------------|---------|
| **MCP Servers** | | | |
| - Filesystem | ✅ Ready | Native MCP | 1 day |
| - GitHub | ✅ Ready | Native MCP | 1 day |
| - Brave Search | ✅ Ready | Native MCP | 1 day |
| - PostgreSQL | ✅ Ready | Native MCP | 1 day |
| - Puppeteer | ✅ Ready | Native MCP | 1 day |
| **Claude Skills** | | | |
| - Commit | ✅ Ready | Port to preprompt | 2 hours |
| - Review PR | ✅ Ready | Port to preprompt | 2 hours |
| - Debug | ✅ Ready | Port to preprompt | 2 hours |
| - Custom skills | ✅ Ready | Create preprompts | 1 hour each |
| **n8n Workflows** | | | |
| - Any workflow | ✅ Ready | Webhook | 4 hours |
| - MCP wrapper | ⚠️ Custom | Build wrapper | 1 week |
| **OpenClaw** | | | |
| - Gateway pattern | ✅ Ready | Convex HTTP endpoint | 2 days |
| - Platform adapters | ⚠️ Port | Adapt from OpenClaw | 1 day each |
| **LangChain** | | | |
| - Tools (100+) | ⚠️ Wrap | Create MCP wrappers | 1 day each |

---

## 8. Recommended Tool Stack for Galatea

### Tier 1: Essential (Week 2)

**MCP Servers:**
- ✅ `filesystem` - File operations
- ✅ `brave-search` - Web search
- ✅ `github` - For programmer instantiation
- ✅ `postgres` - Database access (if needed)

**Skills:**
- ✅ `commit` - Git commits
- ✅ `debug` - Debugging
- ✅ `explore` - Curiosity exploration (custom)
- ✅ `reflect` - Self-reflection (custom)

### Tier 2: Enhanced (Week 3-4)

**MCP Servers:**
- ✅ `puppeteer` - Web scraping
- ✅ `slack` - Team communication
- ✅ `google-drive` - Document access

**n8n Workflows:**
- ✅ `morning-briefing` - Daily summary
- ✅ `deploy-to-staging` - Deployment automation
- ✅ `research-topic` - Deep research

### Tier 3: Advanced (Week 5-6)

**Multi-Platform:**
- ✅ Discord adapter
- ✅ Telegram adapter
- ✅ Web chat widget

**Custom MCP Servers:**
- ✅ Obsidian integration (notes)
- ✅ n8n wrapper (all workflows)
- ✅ Custom business logic

---

## 9. Cost & Performance Implications

### MCP Server Costs

**Free (Self-Hosted):**
- Filesystem, Git operations
- Local database access
- Custom MCP servers

**API-Based (Usage Costs):**
- Brave Search: $5/1000 requests
- GitHub API: Free (5000/hour)
- Google APIs: Varies by service
- OpenAI/Anthropic: Standard API costs

### Performance Considerations

**Latency:**
- MCP tool call: ~100-300ms overhead
- Workflow triggers: ~500ms-2s
- Multi-platform: Varies by platform

**Optimization:**
- Cache tool results (convex/cache.ts)
- Batch operations where possible
- Async workflow triggers (don't block)

---

## 10. Security & Privacy

### MCP Security

**Best Practices:**
- ✅ API keys in environment variables
- ✅ Scope tool access (filesystem sandbox)
- ✅ Audit tool executions (log to DB)
- ✅ User approval for destructive actions

**Implementation:**
```typescript
// Require approval for destructive operations
const DESTRUCTIVE_TOOLS = ['filesystem.delete', 'github.delete_repo'];

export const callMCPTool = action({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const toolName = `${args.server}.${args.tool}`;

    if (DESTRUCTIVE_TOOLS.includes(toolName)) {
      // Store pending approval
      const approvalId = await ctx.runMutation(internal.approvals.create, {
        sessionId: args.sessionId,
        toolName,
        params: args.params,
        status: 'pending',
      });

      // Return approval request
      return { requiresApproval: true, approvalId };
    }

    // Execute immediately for safe tools
    return await mcpClient.callTool(args.server, args.tool, args.params);
  },
});
```

---

## Conclusion

**Ecosystem Reuse = Massive Leverage**

- ✅ **1,000+ MCP tools** available immediately
- ✅ **20+ Claude Code skills** portable to preprompts
- ✅ **1,000+ n8n integrations** via webhooks
- ✅ **OpenClaw patterns** for multi-platform
- ✅ **LangChain tools** wrappable as MCP

**Total Reuse: ~95% of tools/integrations needed**

**Implementation Timeline:**
- Week 2: Core MCP (5 servers)
- Week 3: Skills system (5 preprompts)
- Week 4: n8n integration (3 workflows)
- Week 5-6: Multi-platform (2 adapters)

**This maximizes our REUSE principle while delivering production-grade tool ecosystem!**

---

*Analysis completed: 2026-02-01*
*Aligns with guiding principles: Pragmatic, Iterative, Reuse*
