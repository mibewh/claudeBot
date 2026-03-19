import Anthropic from '@anthropic-ai/sdk';

export const presentChoicesTool: Anthropic.Tool = {
  name: 'present_choices',
  description:
    'Present the user with a set of choices as clickable buttons. Use when you want the user to pick one option from a list. Returns the value of the selected option.',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'The question or prompt to display above the buttons.',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Button label (max 80 chars).' },
            value: { type: 'string', description: 'Value returned when selected.' },
            description: { type: 'string', description: 'Optional short description shown below the label.' },
          },
          required: ['label', 'value'],
        },
        description: 'The options to present. Max 25 options.',
        minItems: 1,
        maxItems: 25,
      },
    },
    required: ['prompt', 'options'],
  },
};

export const showSelectMenuTool: Anthropic.Tool = {
  name: 'show_select_menu',
  description:
    'Show a dropdown select menu for the user to pick one or more options. Use for longer lists where buttons would be too many. Returns selected value(s).',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'The question or prompt to display above the select menu.',
      },
      placeholder: {
        type: 'string',
        description: 'Placeholder text shown in the select menu before selection.',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Option label.' },
            value: { type: 'string', description: 'Value returned when selected.' },
          },
          required: ['label', 'value'],
        },
        description: 'The options for the select menu. Max 25.',
        minItems: 1,
        maxItems: 25,
      },
      min_values: {
        type: 'number',
        description: 'Minimum number of selections. Default 1.',
      },
      max_values: {
        type: 'number',
        description: 'Maximum number of selections. Default 1.',
      },
    },
    required: ['prompt', 'options'],
  },
};

export const showFormTool: Anthropic.Tool = {
  name: 'show_form',
  description:
    'Show a form (modal) with text input fields for the user to fill out. Use when you need structured text input. Returns a record mapping field IDs to user-entered values.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'The modal title (max 45 chars).',
      },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique field identifier.' },
            label: { type: 'string', description: 'Field label (max 45 chars).' },
            placeholder: { type: 'string', description: 'Placeholder text.' },
            required: { type: 'boolean', description: 'Whether the field is required. Default true.' },
            style: {
              type: 'string',
              enum: ['short', 'paragraph'],
              description: 'Input style. "short" for single line, "paragraph" for multi-line. Default "short".',
            },
          },
          required: ['id', 'label'],
        },
        description: 'Form fields. Max 5.',
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ['title', 'fields'],
  },
};

export const confirmTool: Anthropic.Tool = {
  name: 'confirm',
  description:
    'Ask the user a yes/no confirmation question with two buttons. Returns true if yes, false if no.',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'The confirmation question to ask.',
      },
      yes_label: {
        type: 'string',
        description: 'Label for the yes button. Default "Yes".',
      },
      no_label: {
        type: 'string',
        description: 'Label for the no button. Default "No".',
      },
    },
    required: ['prompt'],
  },
};

export const endConversationTool: Anthropic.Tool = {
  name: 'end_conversation',
  description:
    'End the current conversation session. Use when the interaction is complete or the user wants to stop.',
  input_schema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'A farewell message to send before ending the session.',
      },
    },
    required: ['message'],
  },
};

export const allTools: Anthropic.Tool[] = [
  presentChoicesTool,
  showSelectMenuTool,
  showFormTool,
  confirmTool,
  endConversationTool,
];
