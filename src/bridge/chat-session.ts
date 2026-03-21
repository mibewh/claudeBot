import { randomUUID } from 'crypto';
import {
  type SendableChannels,
  type Message,
} from 'discord.js';
import type Anthropic from '@anthropic-ai/sdk';
import { Conversation } from '../claude/conversation.js';
import { ClaudeClient } from '../claude/claude-client.js';
import type { ScenarioConfig } from '../scenarios/types.js';
import { ToolResultCollector, CollectionCancelledError } from './tool-result-collector.js';
import { ToolExecutor } from './tool-executor.js';

const SESSION_TIMEOUT = 10 * 60_000; // 10 minutes
const DISCORD_MAX_LENGTH = 2000;

export class ChatSession {
  private conversation: Conversation;
  private collector: ToolResultCollector;
  private toolExecutor: ToolExecutor;
  private active = true;
  private processingPromise: Promise<void> | null = null;
  private turnCount = 0;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private claudeClient: ClaudeClient,
    private scenario: ScenarioConfig,
    private channel: SendableChannels,
    private userId: string,
    private onEnd: () => void,
  ) {
    this.conversation = new Conversation();
    const sessionId = randomUUID().slice(0, 12);
    this.collector = new ToolResultCollector(channel, userId, sessionId);
    this.toolExecutor = new ToolExecutor(this.collector);
  }

  async start(): Promise<void> {
    if (this.scenario.greeting) {
      await this.channel.send(this.scenario.greeting);
    }
    this.resetTimeout();
  }

  async handleUserMessage(message: Message): Promise<void> {
    if (!this.active) return;

    const content = message.content.trim();

    // Handle exit commands
    if (['exit', 'quit', 'stop'].includes(content.toLowerCase())) {
      await this.channel.send('Session ended. Bye!');
      this.stop();
      return;
    }

    // Cancel any pending tool interaction and wait for the previous turn to settle
    if (this.processingPromise) {
      await this.collector.cancelPending();
      await this.processingPromise;
    }

    this.resetTimeout();
    this.conversation.addUser(content);
    this.turnCount++;

    // Check max turns
    if (this.scenario.constraints?.maxTurns && this.turnCount > this.scenario.constraints.maxTurns) {
      await this.channel.send("We've reached the maximum number of turns for this session. Goodbye!");
      this.stop();
      return;
    }

    this.processingPromise = this.processClaude();
    await this.processingPromise;
  }

  private async processClaude(): Promise<void> {
    if (!this.active) return;
    try {
      // Show typing indicator
      const typing = this.channel.sendTyping().catch(() => {});

      const response = await this.claudeClient.sendMessage({
        systemPrompt: this.scenario.systemPrompt,
        conversation: this.conversation,
        tools: this.scenario.tools,
        maxTokens: this.scenario.constraints?.maxTokensPerResponse,
        temperature: this.scenario.constraints?.temperature,
      });

      // Collect assistant content blocks for conversation history
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      let shouldEndSession = false;

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push(block);
          await this.sendLongMessage(block.text);
        } else if (block.type === 'tool_use') {
          assistantContent.push(block);
        }
      }

      // Add assistant message to conversation
      this.conversation.addAssistant(assistantContent);

      // Process tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length > 0) {
        let cancelled = false;

        for (const toolUse of toolUseBlocks) {
          if (!this.active) return;

          try {
            const result = await this.toolExecutor.execute(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
            );

            if (result.shouldEndSession) {
              await this.sendLongMessage(result.content);
              this.conversation.addToolResult(toolUse.id, result.content);
              shouldEndSession = true;
            } else {
              this.conversation.addToolResult(toolUse.id, result.content, result.isError);
            }
          } catch (toolErr) {
            // Always add a tool_result — an orphaned tool_use corrupts the conversation
            const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            this.conversation.addToolResult(toolUse.id, errMsg, true);

            if (toolErr instanceof CollectionCancelledError) {
              cancelled = true;
              break;
            }
          }
        }

        if (shouldEndSession) {
          this.stop();
          return;
        }

        // Don't recurse if cancelled — the user's new message will start a fresh turn
        if (!cancelled && response.stop_reason === 'tool_use') {
          await this.processClaude();
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claude API error:', message);
      await this.channel.send(`Something went wrong: ${message}`).catch(() => {});
    } finally {
      this.processingPromise = null;
    }
  }

  private async sendLongMessage(text: string): Promise<void> {
    if (!text.trim()) return;

    // Split into chunks respecting Discord's 2000 char limit
    if (text.length <= DISCORD_MAX_LENGTH) {
      await this.channel.send(text);
      return;
    }

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= DISCORD_MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }
      // Try to split on newline
      let splitIdx = remaining.lastIndexOf('\n', DISCORD_MAX_LENGTH);
      if (splitIdx < DISCORD_MAX_LENGTH / 2) splitIdx = DISCORD_MAX_LENGTH;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx);
    }

    for (const chunk of chunks) {
      await this.channel.send(chunk);
    }
  }

  private resetTimeout(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      this.channel.send('Session timed out due to inactivity.').catch(() => {});
      this.stop();
    }, SESSION_TIMEOUT);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.onEnd();
  }

  get isActive(): boolean {
    return this.active;
  }
}
