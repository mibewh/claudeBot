import Anthropic from '@anthropic-ai/sdk';
import type { Conversation } from './conversation.js';

export interface ClaudeRequestOptions {
  systemPrompt: string;
  conversation: Conversation;
  tools: Anthropic.Tool[];
  maxTokens?: number;
  temperature?: number;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async sendMessage(options: ClaudeRequestOptions): Promise<Anthropic.Message> {
    const { systemPrompt, conversation, tools, maxTokens = 4096, temperature } = options;

    return this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: conversation.getMessages(),
      tools,
      ...(temperature !== undefined && { temperature }),
    });
  }
}
