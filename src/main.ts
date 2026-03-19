import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { ClaudeClient } from './claude/claude-client.js';
import { scenarioRegistry } from './scenarios/registry.js';
import { generalAssistant } from './scenarios/general-assistant.js';
import {
  activeSessions,
  handleChatCommand,
  handleAutocomplete,
} from './commands/chat.js';

// Register scenarios
scenarioRegistry.register(generalAssistant);

// Create clients
const claudeClient = new ClaudeClient(config.anthropicApiKey);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

// Handle slash commands + autocomplete
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'chat') {
      handleAutocomplete(interaction);
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'chat') {
    await handleChatCommand(interaction, claudeClient);
  }
});

// Route messages to active chat sessions
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const key = `${message.channelId}:${message.author.id}`;
  const session = activeSessions.get(key);

  if (session?.isActive) {
    await session.handleUserMessage(message);
  }
});

client.login(config.discordToken);
