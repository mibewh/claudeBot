import type { ToolResultCollector } from './tool-result-collector.js';

export interface ToolCallResult {
  content: string;
  isError?: boolean;
  shouldEndSession?: boolean;
}

export class ToolExecutor {
  constructor(private collector: ToolResultCollector) {}

  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      switch (toolName) {
        case 'confirm':
          return this.handleConfirm(input);
        case 'present_choices':
          return this.handleChoices(input);
        case 'show_select_menu':
          return this.handleSelectMenu(input);
        case 'show_form':
          return this.handleForm(input);
        case 'end_conversation':
          return this.handleEndConversation(input);
        default:
          return { content: `Unknown tool: ${toolName}`, isError: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: message, isError: true };
    }
  }

  private async handleConfirm(input: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.collector.collectConfirm(
      input.prompt as string,
      input.yes_label as string | undefined,
      input.no_label as string | undefined,
    );
    return { content: JSON.stringify(result) };
  }

  private async handleChoices(input: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.collector.collectChoices(
      input.prompt as string,
      input.options as { label: string; value: string; description?: string }[],
    );
    return { content: result };
  }

  private async handleSelectMenu(input: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.collector.collectSelect(
      input.prompt as string,
      input.options as { label: string; value: string }[],
      input.placeholder as string | undefined,
      (input.min_values as number) ?? 1,
      (input.max_values as number) ?? 1,
    );
    return { content: result.length === 1 ? result[0] : JSON.stringify(result) };
  }

  private async handleForm(input: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.collector.collectForm(
      input.title as string,
      input.fields as { id: string; label: string; placeholder?: string; required?: boolean; style?: 'short' | 'paragraph' }[],
    );
    return { content: JSON.stringify(result) };
  }

  private handleEndConversation(input: Record<string, unknown>): ToolCallResult {
    return { content: input.message as string, shouldEndSession: true };
  }
}
