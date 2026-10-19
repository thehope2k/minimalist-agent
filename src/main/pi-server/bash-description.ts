// Adds an optional `description` to pi's bash tool so the chat UI can label a
// command by its intent ("Find unused exports") instead of a raw pipeline.
// Optional on purpose: models that skip it fall back to the command itself.
// The bash tool's execute() destructures only `command`/`timeout`, so the
// extra field never reaches the shell.
import { Type } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

export const BASH_DESCRIPTION_GUIDANCE =
  'Short label shown to the user instead of the raw command: 5–10 words in active voice saying ' +
  'what it does (e.g. "List files in src", "Run unit tests for auth"). Do not repeat the command.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withBashDescription(tool: ToolDefinition<any, any>): ToolDefinition<any, any> {
  const params = tool.parameters as { properties?: Record<string, unknown> };
  return {
    ...tool,
    parameters: Type.Object({
      ...(params.properties as Record<string, never>),
      description: Type.Optional(Type.String({ description: BASH_DESCRIPTION_GUIDANCE })),
    }),
  };
}
