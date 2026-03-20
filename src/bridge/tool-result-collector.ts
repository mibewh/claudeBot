import {
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type SendableChannels,
  type Message,
  ComponentType,
  type MessageComponentInteraction,
  type MessageActionRowComponentBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import {
  button,
  actionRow,
  select,
  ComponentIdManager,
  validateEmbeds,
} from '#flowcord';
import type { ButtonConfig, ActionRowConfig } from '#flowcord';
import { ComponentSerializer, buttonsToActionRows } from './flowcord-adapter.js';

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

/** Result from sendAndCollect — the interaction plus the sent message for cleanup. */
interface CollectResult {
  interaction: MessageComponentInteraction;
  message: Message;
}

const COLLECT_TIMEOUT = 120_000; // 2 minutes
const PROMPT_COLOR = 0x5865f2;
const SUCCESS_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;

export class ToolResultCollector {
  private serializer: ComponentSerializer;

  constructor(private channel: SendableChannels, private userId: string, sessionId: string) {
    const idManager = new ComponentIdManager(sessionId, 'tool');
    this.serializer = new ComponentSerializer((id) => idManager.namespace(id));
  }

  async collectConfirm(prompt: string, yesLabel = 'Yes', noLabel = 'No'): Promise<boolean> {
    const embed = new EmbedBuilder().setDescription(prompt).setColor(PROMPT_COLOR);

    const yesBtn = button({ label: yesLabel, style: ButtonStyle.Success, id: 'confirm-yes' });
    const noBtn = button({ label: noLabel, style: ButtonStyle.Danger, id: 'confirm-no' });

    const yesId = this.serializer.resolveId('confirm-yes');
    const noId = this.serializer.resolveId('confirm-no');

    const { interaction } = await this.sendAndCollect({
      embeds: [embed],
      rows: [actionRow([yesBtn, noBtn])],
      filter: (i) => i.user.id === this.userId && [yesId, noId].includes(i.customId),
      timeoutMessage: 'Timed out waiting for confirmation.',
    });

    const selected = interaction.customId === yesId;
    await this.disableAndShow(interaction, selected ? yesLabel : noLabel);
    return selected;
  }

  async collectChoices(prompt: string, options: ChoiceOption[]): Promise<string> {
    const embed = new EmbedBuilder().setDescription(prompt).setColor(PROMPT_COLOR);

    const buttons: ButtonConfig[] = options.map((opt, i) =>
      button({ label: opt.label, style: ButtonStyle.Primary, id: `choice-${i}` }),
    );

    const rows = buttonsToActionRows(buttons);

    // Validate action row count using FlowCord's validator
    const validation = validateEmbeds(rows.length, 'choices');
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    const validIds = options.map((_, i) => this.serializer.resolveId(`choice-${i}`));

    const { interaction } = await this.sendAndCollect({
      embeds: [embed],
      rows,
      filter: (i) => i.user.id === this.userId && validIds.includes(i.customId),
      timeoutMessage: 'Timed out waiting for choice.',
    });

    const idx = validIds.indexOf(interaction.customId);
    const selected = options[idx];
    await this.disableAndShow(interaction, selected.label);
    return selected.value;
  }

  async collectSelect(
    prompt: string,
    options: SelectOption[],
    placeholder?: string,
    minValues = 1,
    maxValues = 1,
  ): Promise<string[]> {
    const embed = new EmbedBuilder().setDescription(prompt).setColor(PROMPT_COLOR);

    const selectBuilder = new StringSelectMenuBuilder()
      .setPlaceholder(placeholder ?? 'Select an option...')
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(options.map((o) => ({ label: o.label, value: o.value })));

    // Route through FlowCord's select config + ComponentSerializer
    const selectConfig = select({ builder: selectBuilder, id: 'select' });
    const selectId = this.serializer.resolveId('select');

    const { interaction } = await this.sendAndCollect({
      embeds: [embed],
      rows: [actionRow([selectConfig])],
      filter: (i) => i.user.id === this.userId && i.customId === selectId,
      timeoutMessage: 'Timed out waiting for selection.',
    });

    const values = (interaction as StringSelectMenuInteraction).values;
    const labels = values.map((v: string) => options.find((o) => o.value === v)?.label ?? v);
    await this.disableAndShow(interaction, labels.join(', '));
    return values;
  }

  async collectForm(
    title: string,
    fields: FormField[],
  ): Promise<Record<string, string>> {
    const embed = new EmbedBuilder()
      .setDescription(`**${title}**\nClick the button below to fill out the form.`)
      .setColor(PROMPT_COLOR);

    const triggerBtn = button({
      label: 'Fill out form',
      style: ButtonStyle.Primary,
      id: 'form-trigger',
    });

    const triggerId = this.serializer.resolveId('form-trigger');
    const modalId = this.serializer.resolveId('form-modal');

    // Form uses a two-step flow (button → modal) so it can't use sendAndCollect directly
    const discordRow = this.serializer.buildActionRow(actionRow([triggerBtn]));
    const message = await this.channel.send({ embeds: [embed], components: [discordRow] });

    try {
      const buttonInteraction = await message.awaitMessageComponent({
        filter: (i: ButtonInteraction) => i.user.id === this.userId && i.customId === triggerId,
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

      const modalInteraction = await buttonInteraction.awaitModalSubmit({
        filter: (i: ModalSubmitInteraction) => i.customId === modalId && i.user.id === this.userId,
        time: COLLECT_TIMEOUT,
      });

      await modalInteraction.deferUpdate();

      const result: Record<string, string> = {};
      for (const field of fields) {
        result[field.id] = modalInteraction.fields.getTextInputValue(field.id);
      }

      const completionEmbed = new EmbedBuilder()
        .setDescription(`**${title}** — submitted`)
        .setColor(SUCCESS_COLOR);
      await message.edit({ embeds: [completionEmbed], components: [] });

      return result;
    } catch {
      await this.disableMessage(message);
      throw new Error('Timed out waiting for form submission.');
    }
  }

  /**
   * Shared helper: serialize FlowCord rows → send to channel → await one interaction.
   * Handles timeout with consistent disable + error behavior.
   * Mirrors the collectInteraction() helper proposed for FlowCord (see flowcord-gaps.md, Suggestion B).
   */
  private async sendAndCollect(opts: {
    embeds: EmbedBuilder[];
    rows: ActionRowConfig[];
    filter: (i: MessageComponentInteraction) => boolean;
    timeoutMessage: string;
  }): Promise<CollectResult> {
    const discordRows = opts.rows.map((r) => this.serializer.buildActionRow(r));
    const message = await this.channel.send({ embeds: opts.embeds, components: discordRows });

    try {
      const interaction = await message.awaitMessageComponent({
        filter: opts.filter,
        time: COLLECT_TIMEOUT,
      });

      return { interaction, message };
    } catch {
      await this.disableMessage(message);
      throw new Error(opts.timeoutMessage);
    }
  }

  private async disableAndShow(interaction: MessageComponentInteraction, selectedLabel: string): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(`Selected: **${selectedLabel}**`)
      .setColor(SUCCESS_COLOR);
    await interaction.update({ embeds: [embed], components: [] });
  }

  private async disableMessage(message: Message): Promise<void> {
    const embed = new EmbedBuilder().setDescription('*Timed out*').setColor(ERROR_COLOR);
    try {
      await message.edit({ embeds: [embed], components: [] });
    } catch {
      // Message may have been deleted
    }
  }
}
