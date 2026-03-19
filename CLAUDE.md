# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This project is a testbed for the [FlowCord](libs/pokeSandbox/libs/flowcord) library. The bot exercises FlowCord's APIs in a real-world scenario (AI-driven dynamic menus) to evaluate whether the library provides solid, ergonomic tools for building rich chatbot experiences. We are actively looking for pain points, API gaps, and opportunities to improve FlowCord — both in ergonomics and capabilities. When working in this repo, pay attention to places where FlowCord's APIs feel clunky, where we have to work around limitations, or where the library could offer better abstractions for what we're trying to do.

## Commands

```bash
npm run dev                  # Run bot locally (tsx src/main.ts)
npm run deploy-commands      # Register slash commands with Discord (run once, or after command changes)
npm run build                # TypeScript compile to dist/
npm run start                # Run compiled output (node dist/main.js)
```

No test runner or linter is configured at the root level.

## Architecture

Discord bot that gives Claude a conversational presence via interactive sessions. Users start a session with `/chat [scenario]`, then exchange messages freely. Claude can dynamically invoke tools that render Discord UI components (buttons, selects, modals) to collect structured input.

### Core loop

`ChatSession` (one per `/chat` invocation) orchestrates the cycle:
1. User text → `Conversation` history → `ClaudeClient` API call
2. Claude text blocks → `channel.send()`
3. Claude `tool_use` blocks → `ToolExecutor` → `ToolResultCollector` (renders Discord components, awaits user interaction) → tool result fed back to conversation → recurse if `stop_reason === 'tool_use'`

### Key relationships

- **`src/main.ts`** wires everything: registers scenarios, creates clients, routes `InteractionCreate` to command handlers and `MessageCreate` to active sessions via the `activeSessions` map (keyed `channelId:userId`).
- **`src/bridge/chat-session.ts`** is the orchestrator. It owns a `Conversation`, a `ToolExecutor`, and manages the Claude response loop including recursion on tool use.
- **`src/bridge/tool-result-collector.ts`** builds Discord embeds + components and uses `awaitMessageComponent()`/`awaitModalSubmit()` to collect responses. Modals require a button-click interaction to trigger (`showModal`), so forms send a "Fill out form" button first.
- **`src/scenarios/`** — Scenarios are plain `ScenarioConfig` objects that define system prompt, tool subset, constraints, and greeting. Registered in `main.ts` via `scenarioRegistry.register()`.

### FlowCord integration

The `@flowcord` path alias resolves to `./libs/pokeSandbox/libs/flowcord/src/index.ts` (git submodule). The bot uses flowcord's `ComponentIdManager` for namespaced component IDs (prevents collisions across concurrent sessions) and its type definitions for structuring menu data. The actual Discord render/collect cycle is handled directly — flowcord's `MenuSession`/`MenuEngine` are not used because tool menus appear mid-conversation, not from slash command interactions.

### Environment

Requires `.env` with `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ANTHROPIC_API_KEY`. The Discord bot needs the **Message Content** privileged intent enabled.
