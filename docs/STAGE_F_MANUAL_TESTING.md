# Stage F: UI Visualization — Manual Testing Checklist

## Prerequisites

- Database running: `docker compose up postgres -d`
- Ollama running with `glm-4.7-flash` pulled
- Dev server: `pnpm dev` (http://localhost:13000)

## Test Scenarios

### 1. New Session — Empty State

- Navigate to a chat session
- [ ] Homeostasis sidebar appears on the right (280px wide)
- [ ] Sidebar shows: "No assessment yet. Send a message to begin."

### 2. Send a Simple Message

- Type: "Hello, how are you?"
- After response arrives:
- [ ] Activity level badge appears on the assistant message (e.g. `L1`, `L2`, or `L3`)
- [ ] Badge is color-coded (gray=L0, blue=L1, purple=L2, orange=L3)
- [ ] Hovering the badge shows a tooltip with description + model name
- [ ] Sidebar updates with 6 dimension bars
- [ ] Each dimension shows a colored zone (yellow=LOW, green=HEALTHY, blue=HIGH)
- [ ] "Last updated" timestamp appears at the top of the sidebar

### 3. Send a Complex Message (Try to Trigger Level 3)

- Type: "Analyze the trade-offs between microservices and monolithic architecture for a startup with 5 engineers"
- [ ] Badge might show `L3 + Reflexion` (orange) if classified as Level 3
- [ ] Sidebar dimensions update after response completes

### 4. Multiple Messages

- Send 2-3 more messages
- [ ] Sidebar refetches after each new response (dimensions may change)
- [ ] Each assistant message has its own activity level badge

### 5. Token Metadata

- On assistant messages:
- [ ] Token counts appear alongside the badge (e.g. `L2 glm-4.7-flash`)

### 6. Graceful Degradation

- [ ] Missing activity levels on messages don't show a badge (no crash)
- [ ] If sidebar query fails, shows "Unable to load homeostasis state" with Retry button

### 7. Visual Layout

- [ ] Sidebar doesn't push or overlap the chat area
- [ ] Chat messages still scroll properly
- [ ] Streaming cursor still works during response generation
- [ ] Colors are visually distinct across LOW/HEALTHY/HIGH zones

## Model Dropdown

- [ ] Ollama dropdown shows: `glm-4.7-flash`, `gpt-oss`, `gemma3:12b`
- [ ] Switching models works and response uses selected model
