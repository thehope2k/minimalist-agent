/**
 * Collaboration tool definitions for Pi backend.
 * 
 * These wrap the collaboration handlers in Pi's ToolDefinition format.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { CollaborationContext } from '../../collaboration-handlers';
import {
  handleRequestDecision,
  handleRequestPreference,
  handleRequestFeedback,
  handleRequestGuidance,
  handleRequestApproval,
} from '../../collaboration-handlers';
import type {
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
} from '../../../../shared/collaboration-types';

/**
 * Create Pi collaboration tools with access to collaboration context.
 */
export function createPiCollaborationTools(
  context: CollaborationContext,
): ToolDefinition[] {
  return [
    createPiRequestDecisionTool(context),
    createPiRequestPreferenceTool(context),
    createPiRequestFeedbackTool(context),
    createPiRequestGuidanceTool(context),
    createPiRequestApprovalTool(context),
  ];
}

function createPiRequestDecisionTool(context: CollaborationContext): ToolDefinition {
  return {
    name: 'RequestDecision',
    label: 'Request user decision',
    description: 'Ask user to decide between multiple valid alternatives',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Clear question to ask the user',
        },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'description', 'pros', 'cons'],
          },
          minItems: 2,
          maxItems: 5,
        },
        recommended: {
          type: 'string',
          description: 'Your recommended option',
        },
        context: {
          type: 'string',
          description: 'Additional context about why this decision matters',
        },
      },
      required: ['question', 'alternatives'],
    },
    execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const result = await handleRequestDecision(params as DecisionPayload, context);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `User selected: ${result.selected}${
              result.custom_response ? `\n\nUser response: ${result.custom_response}` : ''
            }`,
          },
        ],
        details: {},
      };
    },
  };
}

function createPiRequestPreferenceTool(context: CollaborationContext): ToolDefinition {
  return {
    name: 'RequestPreference',
    label: 'Request user preference',
    description: "Ask for user's subjective preference",
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Clear question about preference',
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'description'],
          },
          minItems: 2,
          maxItems: 4,
        },
        context: {
          type: 'string',
          description: 'Why this preference matters',
        },
      },
      required: ['question', 'options'],
    },
    execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const result = await handleRequestPreference(params as PreferencePayload, context);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `User preference: ${result.selected}${
              result.custom_response ? `\n\nDetails: ${result.custom_response}` : ''
            }`,
          },
        ],
        details: {},
      };
    },
  };
}

function createPiRequestFeedbackTool(context: CollaborationContext): ToolDefinition {
  return {
    name: 'RequestFeedback',
    label: 'Request user feedback',
    description: 'Request feedback on completed work',
    parameters: {
      type: 'object',
      properties: {
        work_completed: {
          type: 'string',
          description: 'Summary of work completed',
        },
        preview: {
          type: 'string',
          description: 'Preview of the work (code snippet, file content, etc.)',
        },
        specific_questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific questions to ask about the work',
        },
      },
      required: ['work_completed'],
    },
    execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const result = await handleRequestFeedback(params as FeedbackPayload, context);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `User feedback: ${result.feedback}`,
          },
        ],
        details: {},
      };
    },
  };
}

function createPiRequestGuidanceTool(context: CollaborationContext): ToolDefinition {
  return {
    name: 'RequestGuidance',
    label: 'Request user guidance',
    description: 'Request guidance on trade-offs and priorities',
    parameters: {
      type: 'object',
      properties: {
        situation: {
          type: 'string',
          description: 'Description of the situation requiring guidance',
        },
        trade_offs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              option: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
            },
            required: ['option', 'pros', 'cons'],
          },
          minItems: 2,
          maxItems: 4,
        },
        what_guidance_needed: {
          type: 'string',
          description: 'What specific guidance you need from the user',
        },
      },
      required: ['situation', 'trade_offs', 'what_guidance_needed'],
    },
    execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const result = await handleRequestGuidance(params as GuidancePayload, context);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `User guidance: ${result.guidance}`,
          },
        ],
        details: {},
      };
    },
  };
}

function createPiRequestApprovalTool(context: CollaborationContext): ToolDefinition {
  return {
    name: 'RequestApproval',
    label: 'Request operation approval',
    description: 'Request approval for a risky operation',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'Description of the operation requiring approval',
        },
        risk_level: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Risk score (0-100)',
        },
        risk_factors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Risk factors identified',
        },
        reason: {
          type: 'string',
          description: 'Why this operation is needed',
        },
        details: {
          type: 'object',
          description: 'Operation details (file paths, commands, etc.)',
        },
      },
      required: ['operation', 'risk_level', 'risk_factors', 'reason'],
    },
    execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const result = await handleRequestApproval(params as ApprovalPayload, context);
      
      if (!result.approved) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `User denied this operation${
                result.reason ? `: ${result.reason}` : ''
              }`,
            },
          ],
          details: {},
        };
      }
      
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `Approved${
              result.reason ? ` - User note: ${result.reason}` : ''
            }`,
          },
        ],
        details: {},
      };
    },
  };
}
