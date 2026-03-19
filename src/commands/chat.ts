import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import { scenarioRegistry } from '../scenarios/registry.js';
import { ChatSession } from '../bridge/chat-session.js';
import type { ClaudeClient } from '../claude/claude-client.js';

// Map of channelId:userId → active ChatSession
export const activeSessions = new Map<string, ChatSession>();

function sessionKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export const chatCommand = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('Start a conversation with Claude')
  .addStringOption((opt) =>
    opt
      .setName('scenario')
      .setDescription('Which scenario to use')
      .setRequired(false)
      .setAutocomplete(true),
  );

export function handleAutocomplete(interaction: AutocompleteInteraction): void {
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = scenarioRegistry
    .list()
    .filter((s) => s.id.includes(focused) || s.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((s) => ({ name: `${s.name} — ${s.description}`.slice(0, 100), value: s.id }));

  interaction.respond(choices);
}

export async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
  claudeClient: ClaudeClient,
): Promise<void> {
  const key = sessionKey(interaction.channelId, interaction.user.id);

  if (activeSessions.has(key)) {
    await interaction.reply({
      content: 'You already have an active session in this channel. Send "exit" to end it first.',
      ephemeral: true,
    });
    return;
  }

  const scenarioId = interaction.options.getString('scenario');
  const scenario = scenarioId ? scenarioRegistry.get(scenarioId) : scenarioRegistry.getDefault();

  if (!scenario) {
    await interaction.reply({
      content: `Unknown scenario: ${scenarioId}. Use autocomplete to see available scenarios.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply(`Starting **${scenario.name}** session...`);

  const channel = interaction.channel;
  if (!channel) return;

  const session = new ChatSession(claudeClient, scenario, channel, interaction.user.id, () => {
    activeSessions.delete(key);
  });

  activeSessions.set(key, session);
  await session.start();
}
