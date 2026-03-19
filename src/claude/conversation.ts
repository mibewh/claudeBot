import Anthropic from '@anthropic-ai/sdk';

type Message = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlockParam;

export class Conversation {
  private messages: Message[] = [];

  addUser(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  addAssistant(content: ContentBlock[]): void {
    this.messages.push({ role: 'assistant', content });
  }

  addToolResult(toolUseId: string, content: string, isError = false): void {
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      ...(isError && { is_error: true }),
    };

    // If the last message is already a user message with tool results, append to it
    const last = this.messages.at(-1);
    if (last?.role === 'user' && Array.isArray(last.content)) {
      (last.content as ContentBlock[]).push(block);
    } else {
      this.messages.push({ role: 'user', content: [block] });
    }
  }

  getMessages(): Message[] {
    return this.messages;
  }

  get length(): number {
    return this.messages.length;
  }
}
