import type Anthropic from '@anthropic-ai/sdk';

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: Anthropic.Tool[];
  constraints?: {
    maxTurns?: number;
    maxTokensPerResponse?: number;
    temperature?: number;
  };
  greeting?: string;
}
