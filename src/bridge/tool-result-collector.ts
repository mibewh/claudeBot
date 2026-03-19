import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextBasedChannel,
  ComponentType,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { ComponentIdManager } from '@flowcord';

interface ChoiceOption {
  label: string;
  value: string;
  description?: string;
}

interface SelectOption {
  label: string;
  value: string;
}

interface FormField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  style?: 'short' | 'paragraph';
}

const COLLECT_TIMEOUT = 120_000; // 2 minutes

export class ToolResultCollector {
  private idManager: ComponentIdManager;

  constructor(private channel: TextBasedChannel, private userId: string, sessionId: string) {
    this.idManager = new ComponentIdManager(sessionId, 'tool');
  }

  async collectConfirm(prompt: string, yesLabel = 'Yes', noLabel = 'No'): Promise<boolean> {
    const yesId = this.idManager.namespace('confirm-yes');
    const noId = this.idManager.namespace('confirm-no');

    const embed = new EmbedBuilder().setDescription(prompt).setColor(0x5865f2);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(yesId).setLabel(yesLabel).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(noId).setLabel(noLabel).setStyle(ButtonStyle.Danger),
    );

    const message = await this.channel.send({ embeds: [embed], components: [row] });

    try {
      const interaction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === this.userId && [yesId, noId].includes(i.customId),
        time: COLLECT_TIMEOUT,
        componentType: ComponentType.Button,
      });

      const selected = interaction.customId === yesId;
      await this.disableAndShow(interaction, selected ? yesLabel : noLabel);
      return selected;
    } catch {
      await this.disableMessage(message);
      throw new Error('Timed out waiting for confirmation.');
    }
  }

  async collectChoices(prompt: string, options: ChoiceOption[]): Promise<string> {
    const embed = new EmbedBuilder().setDescription(prompt).setColor(0x5865f2);

    const buttons = options.map((opt, i) => {
      const id = this.idManager.namespace(`choice-${i}`);
      const btn = new ButtonBuilder()
        .setCustomId(id)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Primary);
      return btn;
    });

    // Discord allows max 5 buttons per row
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }

    const message = await this.channel.send({ embeds: [embed], components: rows });

    const validIds = options.map((_, i) => this.idManager.namespace(`choice-${i}`));

    try {
      const interaction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === this.userId && validIds.includes(i.customId),
        time: COLLECT_TIMEOUT,
        componentType: ComponentType.Button,
      });

      const idx = validIds.indexOf(interaction.customId);
      const selected = options[idx];
      await this.disableAndShow(interaction, selected.label);
      return selected.value;
    } catch {
      await this.disableMessage(message);
      throw new Error('Timed out waiting for choice.');
    }
  }

  async collectSelect(
    prompt: string,
    options: SelectOption[],
    placeholder?: string,
    minValues = 1,
    maxValues = 1,
  ): Promise<string[]> {
    const selectId = this.idManager.namespace('select');

    const embed = new EmbedBuilder().setDescription(prompt).setColor(0x5865f2);

    const select = new StringSelectMenuBuilder()
      .setCustomId(selectId)
      .setPlaceholder(placeholder ?? 'Select an option...')
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(options.map((o) => ({ label: o.label, value: o.value })));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const message = await this.channel.send({ embeds: [embed], components: [row] });

    try {
      const interaction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === this.userId && i.customId === selectId,
        time: COLLECT_TIMEOUT,
        componentType: ComponentType.StringSelect,
      });

      const values = interaction.values;
      const labels = values.map((v) => options.find((o) => o.value === v)?.label ?? v);
      await this.disableAndShow(interaction, labels.join(', '));
      return values;
    } catch {
      await this.disableMessage(message);
      throw new Error('Timed out waiting for selection.');
    }
  }

  async collectForm(
    title: string,
    fields: FormField[],
  ): Promise<Record<string, string>> {
    const triggerId = this.idManager.namespace('form-trigger');
    const modalId = this.idManager.namespace('form-modal');

    const embed = new EmbedBuilder().setDescription(`**${title}**\nClick the button below to fill out the form.`).setColor(0x5865f2);

    const triggerButton = new ButtonBuilder()
      .setCustomId(triggerId)
      .setLabel('Fill out form')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(triggerButton);
    const message = await this.channel.send({ embeds: [embed], components: [row] });

    try {
      // Wait for user to click the trigger button
      const buttonInteraction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === this.userId && i.customId === triggerId,
        time: COLLECT_TIMEOUT,
        componentType: ComponentType.Button,
      });

      // Build and show modal
      const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);

      for (const field of fields) {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required !== false);

        if (field.placeholder) input.setPlaceholder(field.placeholder);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      }

      await buttonInteraction.showModal(modal);

      // Wait for modal submission
      const modalInteraction = await buttonInteraction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === this.userId,
        time: COLLECT_TIMEOUT,
      });

      await modalInteraction.deferUpdate();

      const result: Record<string, string> = {};
      for (const field of fields) {
        result[field.id] = modalInteraction.fields.getTextInputValue(field.id);
      }

      // Update the original message to show completion
      const completionEmbed = new EmbedBuilder()
        .setDescription(`**${title}** — submitted`)
        .setColor(0x57f287);
      await message.edit({ embeds: [completionEmbed], components: [] });

      return result;
    } catch {
      await this.disableMessage(message);
      throw new Error('Timed out waiting for form submission.');
    }
  }

  private async disableAndShow(interaction: MessageComponentInteraction, selectedLabel: string): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(`Selected: **${selectedLabel}**`)
      .setColor(0x57f287);
    await interaction.update({ embeds: [embed], components: [] });
  }

  private async disableMessage(message: { edit: (opts: object) => Promise<unknown> }): Promise<void> {
    const embed = new EmbedBuilder().setDescription('*Timed out*').setColor(0xed4245);
    try {
      await message.edit({ embeds: [embed], components: [] });
    } catch {
      // Message may have been deleted
    }
  }
}
