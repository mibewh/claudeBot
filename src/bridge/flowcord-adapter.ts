/**
 * ComponentSerializer — FlowCord → Discord.js serialization.
 *
 * Converts FlowCord component configs (ButtonConfig, ActionRowConfig)
 * into Discord.js builders ready for channel.send().
 *
 * Structured as a class with a namespacing function to mirror the API proposed
 * for FlowCord's own ComponentSerializer extraction (see flowcord-gaps.md,
 * Suggestion A). When FlowCord exposes this natively, this file becomes a
 * one-line re-export.
 *
 * NOTE: This adapter exists because FlowCord's MenuRenderer serialization is
 * private and coupled to the interaction-based session lifecycle.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { ButtonConfig, ActionRowConfig } from '#flowcord';

type NamespaceFn = (id: string) => string;

export class ComponentSerializer {
  constructor(private readonly namespace: NamespaceFn) {}

  /**
   * Convert a FlowCord ButtonConfig to a Discord.js ButtonBuilder.
   */
  buildButton(config: ButtonConfig): ButtonBuilder {
    const builder = new ButtonBuilder()
      .setLabel(config.label)
      .setStyle(config.style)
      .setDisabled(config.disabled ?? false);

    if (config.style === ButtonStyle.Link) {
      if (!config.url) {
        throw new Error(`Link button missing required "url" (label: ${config.label})`);
      }
      builder.setURL(config.url);
    } else {
      const id = config.id ?? `__btn_${Math.random().toString(36).slice(2, 8)}`;
      builder.setCustomId(this.namespace(id));
    }

    if (config.emoji) builder.setEmoji(config.emoji);
    return builder;
  }

  /**
   * Convert a FlowCord ActionRowConfig to a Discord.js ActionRowBuilder.
   * Handles both button and select children.
   */
  buildActionRow(config: ActionRowConfig): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    for (const child of config.children) {
      if (child.type === 'button') {
        row.addComponents(this.buildButton(child));
      } else if (child.type === 'select') {
        const selectId = child.id ?? '__select';
        // Set namespaced ID on the builder directly — this mutates the input config's builder.
        // Safe in our usage since each select config is constructed fresh per collect call.
        child.builder.setCustomId(this.namespace(selectId));
        row.addComponents(child.builder);
      }
    }

    return row;
  }

  /**
   * Build a namespaced ID for a component — useful for filter comparisons
   * after sending (e.g. checking which button was clicked).
   */
  resolveId(componentId: string): string {
    return this.namespace(componentId);
  }
}

/**
 * Split an array of FlowCord ButtonConfigs into ActionRowConfigs (config-level,
 * before serialization), respecting Discord's 5-buttons-per-row limit.
 */
export function buttonsToActionRows(buttons: ButtonConfig[]): ActionRowConfig[] {
  const rows: ActionRowConfig[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({
      type: 'action_row',
      children: buttons.slice(i, i + 5),
    });
  }
  return rows;
}
