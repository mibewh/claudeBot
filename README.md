# claudeBot

A Discord bot that gives Claude a conversational presence in Discord with interactive UI. Claude chats naturally with users and dynamically constructs interactive menus — buttons, dropdowns, modals — when it needs structured input.

## How it works

1. User runs `/chat [scenario]` to start a session
2. Bot greets the user and listens for messages in that channel
3. User sends text → it's added to conversation history → sent to Claude
4. Claude responds with text → posted as a Discord message
5. Claude responds with a tool call → bot renders an interactive menu (buttons, select, modal), collects the user's response, and feeds it back to Claude
6. Loop continues until the session ends

Sessions end via the `end_conversation` tool, typing "exit"/"quit"/"stop", or after 10 minutes of inactivity.

## Interactive tools

Claude can use these tools to build UI on the fly:

| Tool | Discord UI | Returns |
|------|-----------|---------|
| `present_choices` | Embed with buttons | Selected value |
| `show_select_menu` | Embed with dropdown | Selected value(s) |
| `show_form` | Button → modal with text inputs | `{field_id: value}` |
| `confirm` | Yes/No buttons | `true`/`false` |
| `end_conversation` | Farewell message | Ends session |

## Scenarios

Scenarios are code-defined configs that shape Claude's behavior, system prompt, available tools, and constraints. The bot ships with a `general-assistant` scenario and supports adding more.

Each scenario defines:
- System prompt
- Which tools are available
- Optional constraints (max turns, temperature, max tokens)
- Greeting message

Pass a scenario to `/chat` via autocomplete, or omit it for the default.

## Setup

### Prerequisites

- Node.js 18+
- A [Discord bot](https://discord.com/developers/applications) with the **Message Content** privileged intent enabled
- An [Anthropic API key](https://console.anthropic.com/)

### Install

```bash
git submodule update --init --recursive
npm install
```

### Configure

```bash
cp .env.example .env
```

Fill in `.env`:
- `DISCORD_TOKEN` — Bot token from the Discord developer portal
- `DISCORD_CLIENT_ID` — Application ID from the Discord developer portal
- `ANTHROPIC_API_KEY` — Your Anthropic API key

### Register slash commands

Run once (and again whenever you change command definitions):

```bash
npm run deploy-commands
```

### Run

```bash
npm run dev
```

## Project structure

```
src/
  main.ts                     # Entry point: client, event routing
  config.ts                   # Env var loader
  deploy-commands.ts          # Slash command registration script
  claude/
    claude-client.ts          # Anthropic SDK wrapper
    conversation.ts           # Message history manager
    tool-definitions.ts       # Claude tool schemas
  bridge/
    chat-session.ts           # Session orchestrator (Claude ↔ Discord ↔ menus)
    tool-executor.ts          # Routes tool calls to collectors
    tool-result-collector.ts  # Builds Discord components, collects responses
  scenarios/
    types.ts                  # ScenarioConfig interface
    registry.ts               # Scenario registry
    general-assistant.ts      # Default scenario
  commands/
    chat.ts                   # /chat command + autocomplete handler
```

## Adding a scenario

Create a new file in `src/scenarios/`:

```ts
import { allTools } from '../claude/tool-definitions.js';
import type { ScenarioConfig } from './types.js';

export const myScenario: ScenarioConfig = {
  id: 'my-scenario',
  name: 'My Scenario',
  description: 'A custom scenario.',
  systemPrompt: 'You are ...',
  tools: allTools,  // or a subset
  greeting: 'Hello!',
  constraints: {
    maxTurns: 20,
    temperature: 0.7,
  },
};
```

Then register it in `src/main.ts`:

```ts
import { myScenario } from './scenarios/my-scenario.js';
scenarioRegistry.register(myScenario);
```

## FlowCord integration

The bot uses [FlowCord](libs/pokeSandbox/libs/flowcord) (included as a submodule) for menu infrastructure. Specifically, it uses `ComponentIdManager` for namespaced component IDs that prevent collisions across concurrent sessions. The component types (`ButtonConfig`, `SelectConfig`, `ModalConfig`) inform the menu data structures. The actual Discord render/collect cycle is handled directly since tool menus appear mid-conversation rather than from slash command interactions.
