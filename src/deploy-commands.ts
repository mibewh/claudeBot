import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { chatCommand } from './commands/chat.js';

const rest = new REST().setToken(config.discordToken);

const commands = [chatCommand.toJSON()];

console.log(`Registering ${commands.length} slash command(s)...`);

try {
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
  console.log('Commands registered successfully.');
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
